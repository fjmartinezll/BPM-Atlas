
-- Enums
CREATE TYPE public.app_role AS ENUM ('administrador','dueno_proceso','participante','auditor');
CREATE TYPE public.process_status AS ENUM ('borrador','activo','revision','obsoleto');

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_read_auth" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- User roles
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "user_roles_read_own" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'administrador'));
CREATE POLICY "user_roles_admin_all" ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(),'administrador')) WITH CHECK (public.has_role(auth.uid(),'administrador'));

-- Auto-create profile and default role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name',''));
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'participante');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Helper: can edit (administrador or dueno_proceso)
CREATE OR REPLACE FUNCTION public.can_edit_bpm(_user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_user_id,'administrador') OR public.has_role(_user_id,'dueno_proceso')
$$;

-- Generic updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- Macroprocesses
CREATE TABLE public.macroprocesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  mission TEXT,
  owner_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  inputs TEXT,
  outputs TEXT,
  status public.process_status NOT NULL DEFAULT 'borrador',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.macroprocesses TO authenticated;
GRANT ALL ON public.macroprocesses TO service_role;
ALTER TABLE public.macroprocesses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mp_read" ON public.macroprocesses FOR SELECT TO authenticated USING (true);
CREATE POLICY "mp_write" ON public.macroprocesses FOR ALL TO authenticated USING (public.can_edit_bpm(auth.uid())) WITH CHECK (public.can_edit_bpm(auth.uid()));
CREATE TRIGGER mp_upd BEFORE UPDATE ON public.macroprocesses FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Process types
CREATE TABLE public.process_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID NOT NULL REFERENCES public.macroprocesses(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  mission TEXT,
  owner_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  inputs TEXT, outputs TEXT,
  status public.process_status NOT NULL DEFAULT 'borrador',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.process_types TO authenticated;
GRANT ALL ON public.process_types TO service_role;
ALTER TABLE public.process_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pt_read" ON public.process_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "pt_write" ON public.process_types FOR ALL TO authenticated USING (public.can_edit_bpm(auth.uid())) WITH CHECK (public.can_edit_bpm(auth.uid()));
CREATE TRIGGER pt_upd BEFORE UPDATE ON public.process_types FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Processes
CREATE TABLE public.processes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID NOT NULL REFERENCES public.process_types(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  mission TEXT,
  owner_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  inputs TEXT, outputs TEXT,
  status public.process_status NOT NULL DEFAULT 'borrador',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.processes TO authenticated;
GRANT ALL ON public.processes TO service_role;
ALTER TABLE public.processes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "p_read" ON public.processes FOR SELECT TO authenticated USING (true);
CREATE POLICY "p_write" ON public.processes FOR ALL TO authenticated USING (public.can_edit_bpm(auth.uid())) WITH CHECK (public.can_edit_bpm(auth.uid()));
CREATE TRIGGER p_upd BEFORE UPDATE ON public.processes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Subprocesses
CREATE TABLE public.subprocesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID NOT NULL REFERENCES public.processes(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  mission TEXT,
  owner_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  inputs TEXT, outputs TEXT,
  status public.process_status NOT NULL DEFAULT 'borrador',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subprocesses TO authenticated;
GRANT ALL ON public.subprocesses TO service_role;
ALTER TABLE public.subprocesses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sp_read" ON public.subprocesses FOR SELECT TO authenticated USING (true);
CREATE POLICY "sp_write" ON public.subprocesses FOR ALL TO authenticated USING (public.can_edit_bpm(auth.uid())) WITH CHECK (public.can_edit_bpm(auth.uid()));
CREATE TRIGGER sp_upd BEFORE UPDATE ON public.subprocesses FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Task types
CREATE TABLE public.task_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID NOT NULL REFERENCES public.subprocesses(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  mission TEXT,
  owner_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  inputs TEXT, outputs TEXT,
  status public.process_status NOT NULL DEFAULT 'borrador',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_types TO authenticated;
GRANT ALL ON public.task_types TO service_role;
ALTER TABLE public.task_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tt_read" ON public.task_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "tt_write" ON public.task_types FOR ALL TO authenticated USING (public.can_edit_bpm(auth.uid())) WITH CHECK (public.can_edit_bpm(auth.uid()));
CREATE TRIGGER tt_upd BEFORE UPDATE ON public.task_types FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Tasks
CREATE TABLE public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID NOT NULL REFERENCES public.task_types(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  mission TEXT,
  owner_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  inputs TEXT, outputs TEXT,
  status public.process_status NOT NULL DEFAULT 'borrador',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO authenticated;
GRANT ALL ON public.tasks TO service_role;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "t_read" ON public.tasks FOR SELECT TO authenticated USING (true);
CREATE POLICY "t_write" ON public.tasks FOR ALL TO authenticated USING (public.can_edit_bpm(auth.uid())) WITH CHECK (public.can_edit_bpm(auth.uid()));
CREATE TRIGGER t_upd BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
