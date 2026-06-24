CREATE TABLE public.entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  objectives text,
  status process_status NOT NULL DEFAULT 'borrador',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.entities TO authenticated;
GRANT ALL ON public.entities TO service_role;

ALTER TABLE public.entities ENABLE ROW LEVEL SECURITY;

CREATE POLICY ent_read ON public.entities FOR SELECT TO authenticated
  USING (has_any_bpm_role(auth.uid()));
CREATE POLICY ent_write ON public.entities FOR ALL TO authenticated
  USING (can_edit_bpm(auth.uid()))
  WITH CHECK (can_edit_bpm(auth.uid()));

CREATE TRIGGER entities_set_updated_at BEFORE UPDATE ON public.entities
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.macroprocesses ADD COLUMN entity_id uuid REFERENCES public.entities(id) ON DELETE SET NULL;
ALTER TABLE public.tasks ADD COLUMN n8n_workflow_id text;