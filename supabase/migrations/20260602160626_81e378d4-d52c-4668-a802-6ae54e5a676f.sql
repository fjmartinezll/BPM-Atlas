
-- Ficha técnica fields on all hierarchy tables
ALTER TABLE public.macroprocesses
  ADD COLUMN IF NOT EXISTS resources text,
  ADD COLUMN IF NOT EXISTS client_requirements text,
  ADD COLUMN IF NOT EXISTS suppliers text,
  ADD COLUMN IF NOT EXISTS regulations text;
ALTER TABLE public.process_types
  ADD COLUMN IF NOT EXISTS resources text,
  ADD COLUMN IF NOT EXISTS client_requirements text,
  ADD COLUMN IF NOT EXISTS suppliers text,
  ADD COLUMN IF NOT EXISTS regulations text;
ALTER TABLE public.processes
  ADD COLUMN IF NOT EXISTS resources text,
  ADD COLUMN IF NOT EXISTS client_requirements text,
  ADD COLUMN IF NOT EXISTS suppliers text,
  ADD COLUMN IF NOT EXISTS regulations text;
ALTER TABLE public.subprocesses
  ADD COLUMN IF NOT EXISTS resources text,
  ADD COLUMN IF NOT EXISTS client_requirements text,
  ADD COLUMN IF NOT EXISTS suppliers text,
  ADD COLUMN IF NOT EXISTS regulations text;
ALTER TABLE public.task_types
  ADD COLUMN IF NOT EXISTS resources text,
  ADD COLUMN IF NOT EXISTS client_requirements text,
  ADD COLUMN IF NOT EXISTS suppliers text,
  ADD COLUMN IF NOT EXISTS regulations text;
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS resources text,
  ADD COLUMN IF NOT EXISTS client_requirements text,
  ADD COLUMN IF NOT EXISTS suppliers text,
  ADD COLUMN IF NOT EXISTS regulations text;

-- Visual process diagrams (BPMN-style flow stored as JSONB)
CREATE TABLE IF NOT EXISTS public.process_diagrams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  level text NOT NULL CHECK (level IN ('macroprocesses','process_types','processes','subprocesses','task_types','tasks')),
  node_id uuid NOT NULL,
  name text NOT NULL DEFAULT 'Diagrama',
  nodes jsonb NOT NULL DEFAULT '[]'::jsonb,
  edges jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (level, node_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.process_diagrams TO authenticated;
GRANT ALL ON public.process_diagrams TO service_role;

ALTER TABLE public.process_diagrams ENABLE ROW LEVEL SECURITY;

CREATE POLICY pd_read ON public.process_diagrams FOR SELECT TO authenticated
  USING (public.has_any_bpm_role(auth.uid()));
CREATE POLICY pd_write ON public.process_diagrams FOR ALL TO authenticated
  USING (public.can_edit_bpm(auth.uid()))
  WITH CHECK (public.can_edit_bpm(auth.uid()));

CREATE TRIGGER trg_process_diagrams_updated
  BEFORE UPDATE ON public.process_diagrams
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
