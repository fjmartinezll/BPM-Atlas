
-- Drop legacy validation triggers tied to tasks
DROP TRIGGER IF EXISTS trg_enforce_executable_parent_not_human ON public.executable_elements;
DROP TRIGGER IF EXISTS trg_enforce_task_human_no_executables ON public.tasks;
DROP FUNCTION IF EXISTS public.enforce_executable_parent_not_human() CASCADE;
DROP FUNCTION IF EXISTS public.enforce_task_human_no_executables() CASCADE;

-- Clean slate: truncate BPM hierarchy and their dependents
TRUNCATE TABLE
  public.executable_elements,
  public.subprocesses,
  public.tasks,
  public.task_types,
  public.processes,
  public.process_types,
  public.macroprocesses,
  public.entity_process_links,
  public.process_diagrams,
  public.process_documents,
  public.process_indicators,
  public.process_risks
RESTART IDENTITY CASCADE;

-- Drop removed levels
DROP TABLE IF EXISTS public.tasks CASCADE;
DROP TABLE IF EXISTS public.task_types CASCADE;
DROP TABLE IF EXISTS public.process_types CASCADE;

-- Rewire subprocesses: now child of a process (group of executable elements)
ALTER TABLE public.subprocesses DROP CONSTRAINT IF EXISTS subprocesses_parent_id_fkey;
ALTER TABLE public.subprocesses
  ALTER COLUMN parent_id SET NOT NULL,
  ADD CONSTRAINT subprocesses_parent_id_fkey
    FOREIGN KEY (parent_id) REFERENCES public.processes(id) ON DELETE CASCADE;

-- Rewire executable_elements: now hang directly off a process
ALTER TABLE public.executable_elements DROP CONSTRAINT IF EXISTS executable_elements_parent_id_fkey;
ALTER TABLE public.executable_elements
  ALTER COLUMN parent_id SET NOT NULL,
  ADD CONSTRAINT executable_elements_parent_id_fkey
    FOREIGN KEY (parent_id) REFERENCES public.processes(id) ON DELETE CASCADE;

-- Make entity required for every macroprocess
ALTER TABLE public.macroprocesses DROP CONSTRAINT IF EXISTS macroprocesses_entity_id_fkey;
ALTER TABLE public.macroprocesses
  ALTER COLUMN entity_id SET NOT NULL,
  ADD CONSTRAINT macroprocesses_entity_id_fkey
    FOREIGN KEY (entity_id) REFERENCES public.entities(id) ON DELETE RESTRICT;

-- Subprocess <-> executable elements bridge (an element can belong to several subprocesses)
CREATE TABLE public.subprocess_elements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subprocess_id uuid NOT NULL REFERENCES public.subprocesses(id) ON DELETE CASCADE,
  executable_element_id uuid NOT NULL REFERENCES public.executable_elements(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subprocess_id, executable_element_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subprocess_elements TO authenticated;
GRANT ALL ON public.subprocess_elements TO service_role;
ALTER TABLE public.subprocess_elements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read subprocess_elements" ON public.subprocess_elements
  FOR SELECT TO authenticated USING (public.has_any_bpm_role(auth.uid()));
CREATE POLICY "write subprocess_elements" ON public.subprocess_elements
  FOR ALL TO authenticated
  USING (public.can_edit_bpm(auth.uid()))
  WITH CHECK (public.can_edit_bpm(auth.uid()));

-- Integrations: executable element <-> one or more external automation nodes (n8n / make)
DO $$ BEGIN
  CREATE TYPE public.automation_provider AS ENUM ('n8n', 'make');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE public.executable_element_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  executable_element_id uuid NOT NULL REFERENCES public.executable_elements(id) ON DELETE CASCADE,
  provider public.automation_provider NOT NULL,
  external_ref text NOT NULL,
  url text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (executable_element_id, provider, external_ref)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.executable_element_integrations TO authenticated;
GRANT ALL ON public.executable_element_integrations TO service_role;
ALTER TABLE public.executable_element_integrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read integrations" ON public.executable_element_integrations
  FOR SELECT TO authenticated USING (public.has_any_bpm_role(auth.uid()));
CREATE POLICY "write integrations" ON public.executable_element_integrations
  FOR ALL TO authenticated
  USING (public.can_edit_bpm(auth.uid()))
  WITH CHECK (public.can_edit_bpm(auth.uid()));
CREATE TRIGGER trg_eei_updated BEFORE UPDATE ON public.executable_element_integrations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
