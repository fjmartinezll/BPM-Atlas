
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS modeler_diagram_id uuid,
  ADD COLUMN IF NOT EXISTS modeler_node_id text;

CREATE UNIQUE INDEX IF NOT EXISTS tasks_modeler_node_unique
  ON public.tasks (modeler_diagram_id, modeler_node_id)
  WHERE modeler_diagram_id IS NOT NULL AND modeler_node_id IS NOT NULL;
