
-- New "tasks" catalog level: Subprocess > Task > Executable Element
CREATE TABLE public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  name text NOT NULL,
  mission text,
  inputs text,
  outputs text,
  owner_id uuid REFERENCES public.profiles(id),
  parent_id uuid NOT NULL REFERENCES public.subprocesses(id) ON DELETE CASCADE,
  status public.process_status NOT NULL DEFAULT 'borrador',
  resources text,
  client_requirements text,
  suppliers text,
  regulations text,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX tasks_parent_id_idx ON public.tasks(parent_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO authenticated;
GRANT ALL ON public.tasks TO service_role;

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tasks_read_any_bpm"
  ON public.tasks FOR SELECT
  TO authenticated
  USING (public.has_any_bpm_role(auth.uid()));

CREATE POLICY "tasks_write_editors"
  ON public.tasks FOR ALL
  TO authenticated
  USING (public.can_edit_bpm(auth.uid()))
  WITH CHECK (public.can_edit_bpm(auth.uid()));

CREATE TRIGGER tasks_set_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER tasks_log_change
  AFTER INSERT OR UPDATE OR DELETE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.log_bpm_change();

-- Link executable_elements to a task (1 task -> N executable elements). Nullable for backward compatibility.
ALTER TABLE public.executable_elements
  ADD COLUMN task_id uuid REFERENCES public.tasks(id) ON DELETE SET NULL;

CREATE INDEX executable_elements_task_id_idx ON public.executable_elements(task_id);
