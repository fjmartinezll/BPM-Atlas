
-- 1. Restrict profiles SELECT: own row or admin
DROP POLICY IF EXISTS profiles_read_auth ON public.profiles;
CREATE POLICY profiles_read_own_or_admin ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id OR public.has_role(auth.uid(), 'administrador'));

-- 2. Helper: any BPM role assigned
CREATE OR REPLACE FUNCTION public.has_any_bpm_role(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id)
$$;
REVOKE EXECUTE ON FUNCTION public.has_any_bpm_role(uuid) FROM PUBLIC, anon, authenticated;

-- 3. Stop auto-granting 'participante' on signup. New users get no role
-- until an administrator assigns one, preventing data enumeration by strangers.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name',''));
  RETURN NEW;
END;
$$;

-- 4. Restrict BPM read policies to users with an assigned role
DROP POLICY IF EXISTS mp_read ON public.macroprocesses;
CREATE POLICY mp_read ON public.macroprocesses FOR SELECT TO authenticated
  USING (public.has_any_bpm_role(auth.uid()));

DROP POLICY IF EXISTS pt_read ON public.process_types;
CREATE POLICY pt_read ON public.process_types FOR SELECT TO authenticated
  USING (public.has_any_bpm_role(auth.uid()));

DROP POLICY IF EXISTS p_read ON public.processes;
CREATE POLICY p_read ON public.processes FOR SELECT TO authenticated
  USING (public.has_any_bpm_role(auth.uid()));

DROP POLICY IF EXISTS sp_read ON public.subprocesses;
CREATE POLICY sp_read ON public.subprocesses FOR SELECT TO authenticated
  USING (public.has_any_bpm_role(auth.uid()));

DROP POLICY IF EXISTS tt_read ON public.task_types;
CREATE POLICY tt_read ON public.task_types FOR SELECT TO authenticated
  USING (public.has_any_bpm_role(auth.uid()));

DROP POLICY IF EXISTS t_read ON public.tasks;
CREATE POLICY t_read ON public.tasks FOR SELECT TO authenticated
  USING (public.has_any_bpm_role(auth.uid()));

-- 5. Revoke direct EXECUTE on SECURITY DEFINER helpers from signed-in users.
-- They are still used internally by RLS policies (policies evaluate with the
-- function owner's privileges), but cannot be called via RPC.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.can_edit_bpm(uuid) FROM PUBLIC, anon, authenticated;
