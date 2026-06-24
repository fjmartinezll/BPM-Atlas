
CREATE TABLE public.process_variables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_kind text NOT NULL CHECK (owner_kind IN ('process','subprocess')),
  owner_id uuid NOT NULL,
  name text NOT NULL,
  label text NOT NULL DEFAULT '',
  var_type text NOT NULL CHECK (var_type IN ('string','number','money','date','boolean','entity')),
  entity_id uuid NULL REFERENCES public.entities(id) ON DELETE SET NULL,
  default_value jsonb NULL,
  is_input boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_kind, owner_id, name)
);

CREATE INDEX process_variables_owner_idx ON public.process_variables(owner_kind, owner_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.process_variables TO authenticated;
GRANT ALL ON public.process_variables TO service_role;

ALTER TABLE public.process_variables ENABLE ROW LEVEL SECURITY;

CREATE POLICY "process_variables read auth" ON public.process_variables
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "process_variables write bpm editor" ON public.process_variables
  FOR ALL TO authenticated
  USING (public.can_edit_bpm(auth.uid()))
  WITH CHECK (public.can_edit_bpm(auth.uid()));

CREATE TRIGGER process_variables_set_updated_at
  BEFORE UPDATE ON public.process_variables
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER process_variables_log
  AFTER INSERT OR UPDATE OR DELETE ON public.process_variables
  FOR EACH ROW EXECUTE FUNCTION public.log_bpm_change();
