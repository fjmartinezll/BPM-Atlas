ALTER TABLE public.process_diagrams
  ADD COLUMN IF NOT EXISTS diagram_type text NOT NULL DEFAULT 'procesos',
  ADD COLUMN IF NOT EXISTS parent_table text,
  ADD COLUMN IF NOT EXISTS parent_id uuid;

CREATE INDEX IF NOT EXISTS idx_process_diagrams_parent
  ON public.process_diagrams(parent_table, parent_id);