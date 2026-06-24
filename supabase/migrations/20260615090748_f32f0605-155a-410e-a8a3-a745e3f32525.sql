CREATE TABLE public.entity_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_id, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.entity_positions TO authenticated;
GRANT ALL ON public.entity_positions TO service_role;

ALTER TABLE public.entity_positions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read positions for any BPM user"
  ON public.entity_positions FOR SELECT
  TO authenticated
  USING (public.has_any_bpm_role(auth.uid()));

CREATE POLICY "Edit positions for BPM editors"
  ON public.entity_positions FOR ALL
  TO authenticated
  USING (public.can_edit_bpm(auth.uid()))
  WITH CHECK (public.can_edit_bpm(auth.uid()));

CREATE TRIGGER set_updated_at_entity_positions
  BEFORE UPDATE ON public.entity_positions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER log_entity_positions_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.entity_positions
  FOR EACH ROW EXECUTE FUNCTION public.log_bpm_change();

CREATE INDEX entity_positions_entity_id_idx ON public.entity_positions(entity_id);