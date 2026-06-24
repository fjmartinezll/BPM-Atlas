
-- Add is_human flag to tasks
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS is_human boolean NOT NULL DEFAULT false;

-- Executable elements: leaf nodes that bind to apps or n8n workflows
CREATE TABLE IF NOT EXISTS public.executable_elements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  mission text,
  owner_id uuid,
  inputs text,
  outputs text,
  status process_status NOT NULL DEFAULT 'borrador',
  kind text NOT NULL DEFAULT 'app' CHECK (kind IN ('app','n8n_workflow')),
  app_url text,
  n8n_workflow_id text,
  resources text,
  client_requirements text,
  suppliers text,
  regulations text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.executable_elements TO authenticated;
GRANT ALL ON public.executable_elements TO service_role;

ALTER TABLE public.executable_elements ENABLE ROW LEVEL SECURITY;

CREATE POLICY ee_read ON public.executable_elements FOR SELECT TO authenticated
  USING (public.has_any_bpm_role(auth.uid()));
CREATE POLICY ee_write ON public.executable_elements FOR ALL TO authenticated
  USING (public.can_edit_bpm(auth.uid()))
  WITH CHECK (public.can_edit_bpm(auth.uid()));

CREATE TRIGGER trg_ee_updated_at BEFORE UPDATE ON public.executable_elements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Block executable elements when the parent task is human
CREATE OR REPLACE FUNCTION public.enforce_executable_parent_not_human()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_is_human boolean;
BEGIN
  SELECT is_human INTO v_is_human FROM public.tasks WHERE id = NEW.parent_id;
  IF v_is_human THEN
    RAISE EXCEPTION 'Cannot attach executable elements to a human task';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_ee_parent_human BEFORE INSERT OR UPDATE ON public.executable_elements
  FOR EACH ROW EXECUTE FUNCTION public.enforce_executable_parent_not_human();

-- If a task becomes human, prevent it if it has executable elements
CREATE OR REPLACE FUNCTION public.enforce_task_human_no_executables()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.is_human AND EXISTS (SELECT 1 FROM public.executable_elements WHERE parent_id = NEW.id) THEN
    RAISE EXCEPTION 'Cannot mark task as human while it has executable elements';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_task_human_guard BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.enforce_task_human_no_executables();
