
-- Definitions
CREATE TABLE public.process_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  diagram_id uuid REFERENCES public.process_diagrams(id) ON DELETE SET NULL,
  process_id uuid,
  version integer NOT NULL,
  name text NOT NULL,
  nodes jsonb NOT NULL DEFAULT '[]'::jsonb,
  edges jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','archived')),
  published_by uuid,
  published_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (diagram_id, version)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.process_definitions TO authenticated;
GRANT ALL ON public.process_definitions TO service_role;
ALTER TABLE public.process_definitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY pd_select ON public.process_definitions FOR SELECT TO authenticated USING (public.has_any_bpm_role(auth.uid()));
CREATE POLICY pd_write ON public.process_definitions FOR ALL TO authenticated USING (public.can_edit_bpm(auth.uid())) WITH CHECK (public.can_edit_bpm(auth.uid()));
CREATE TRIGGER pd_set_updated BEFORE UPDATE ON public.process_definitions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Instances
CREATE TABLE public.process_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  definition_id uuid NOT NULL REFERENCES public.process_definitions(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','paused','waiting','completed','aborted','error')),
  variables jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_by uuid,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.process_instances TO authenticated;
GRANT ALL ON public.process_instances TO service_role;
ALTER TABLE public.process_instances ENABLE ROW LEVEL SECURITY;
CREATE POLICY pi_select ON public.process_instances FOR SELECT TO authenticated USING (public.has_any_bpm_role(auth.uid()));
CREATE POLICY pi_write ON public.process_instances FOR ALL TO authenticated USING (public.can_edit_bpm(auth.uid())) WITH CHECK (public.can_edit_bpm(auth.uid()));
CREATE INDEX idx_pi_def_status ON public.process_instances (definition_id, status);
CREATE TRIGGER pi_set_updated BEFORE UPDATE ON public.process_instances FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Tokens
CREATE TABLE public.process_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id uuid NOT NULL REFERENCES public.process_instances(id) ON DELETE CASCADE,
  node_id text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','waiting_human','waiting_timer','waiting_service','completed','failed')),
  wake_at timestamptz,
  entered_at timestamptz NOT NULL DEFAULT now(),
  exited_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.process_tokens TO authenticated;
GRANT ALL ON public.process_tokens TO service_role;
ALTER TABLE public.process_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY pt_select ON public.process_tokens FOR SELECT TO authenticated USING (public.has_any_bpm_role(auth.uid()));
CREATE POLICY pt_write ON public.process_tokens FOR ALL TO authenticated USING (public.can_edit_bpm(auth.uid())) WITH CHECK (public.can_edit_bpm(auth.uid()));
CREATE INDEX idx_pt_instance_status ON public.process_tokens (instance_id, status);
CREATE INDEX idx_pt_timer ON public.process_tokens (wake_at) WHERE status = 'waiting_timer';
CREATE TRIGGER pt_set_updated BEFORE UPDATE ON public.process_tokens FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Tasks
CREATE TABLE public.process_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id uuid NOT NULL REFERENCES public.process_instances(id) ON DELETE CASCADE,
  token_id uuid REFERENCES public.process_tokens(id) ON DELETE SET NULL,
  node_id text NOT NULL,
  node_kind text,
  task_kind text NOT NULL CHECK (task_kind IN ('human','service','timer')),
  assignee_id uuid,
  lane_role text,
  wf_object text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','completed','failed','cancelled')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb,
  error text,
  retry_count integer NOT NULL DEFAULT 0,
  due_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.process_tasks TO authenticated;
GRANT ALL ON public.process_tasks TO service_role;
ALTER TABLE public.process_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY pts_select ON public.process_tasks FOR SELECT TO authenticated USING (public.has_any_bpm_role(auth.uid()) OR assignee_id = auth.uid());
CREATE POLICY pts_update ON public.process_tasks FOR UPDATE TO authenticated USING (public.can_edit_bpm(auth.uid()) OR assignee_id = auth.uid()) WITH CHECK (public.can_edit_bpm(auth.uid()) OR assignee_id = auth.uid());
CREATE POLICY pts_insert ON public.process_tasks FOR INSERT TO authenticated WITH CHECK (public.can_edit_bpm(auth.uid()));
CREATE POLICY pts_delete ON public.process_tasks FOR DELETE TO authenticated USING (public.can_edit_bpm(auth.uid()));
CREATE INDEX idx_pts_instance_status ON public.process_tasks (instance_id, status);
CREATE INDEX idx_pts_assignee ON public.process_tasks (assignee_id, status);
CREATE TRIGGER pts_set_updated BEFORE UPDATE ON public.process_tasks FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Events log
CREATE TABLE public.process_events_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id uuid NOT NULL REFERENCES public.process_instances(id) ON DELETE CASCADE,
  token_id uuid,
  node_id text,
  event_type text NOT NULL,
  actor_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.process_events_log TO authenticated;
GRANT ALL ON public.process_events_log TO service_role;
ALTER TABLE public.process_events_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY pel_select ON public.process_events_log FOR SELECT TO authenticated USING (public.has_any_bpm_role(auth.uid()));
CREATE POLICY pel_insert ON public.process_events_log FOR INSERT TO authenticated WITH CHECK (public.can_edit_bpm(auth.uid()));
CREATE INDEX idx_pel_instance_created ON public.process_events_log (instance_id, created_at DESC);
