CREATE TABLE public.instance_start_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  definition_id uuid NOT NULL REFERENCES public.process_definitions(id) ON DELETE CASCADE,
  values jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, definition_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.instance_start_drafts TO authenticated;
GRANT ALL ON public.instance_start_drafts TO service_role;

ALTER TABLE public.instance_start_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users select own drafts" ON public.instance_start_drafts
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own drafts" ON public.instance_start_drafts
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own drafts" ON public.instance_start_drafts
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own drafts" ON public.instance_start_drafts
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER set_updated_at_instance_start_drafts
  BEFORE UPDATE ON public.instance_start_drafts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER log_instance_start_drafts_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.instance_start_drafts
  FOR EACH ROW EXECUTE FUNCTION public.log_bpm_change();
