
-- Block 3 Phase 1: tenant-scoped roles

-- 1) Add client_id column
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE;

-- 2) Backfill: for each existing (user_id, role), create one row per user_clients
INSERT INTO public.user_roles (user_id, role, client_id)
SELECT ur.user_id, ur.role, uc.client_id
FROM public.user_roles ur
JOIN public.user_clients uc ON uc.user_id = ur.user_id
WHERE ur.client_id IS NULL
ON CONFLICT DO NOTHING;

-- 3) Drop orphan global rows (users without a tenant cannot keep a global role)
DELETE FROM public.user_roles WHERE client_id IS NULL;

-- 4) Constraints
DO $$ BEGIN
  ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_user_id_role_key;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_client_role_key UNIQUE (user_id, client_id, role);
EXCEPTION WHEN duplicate_table THEN NULL; END $$;

ALTER TABLE public.user_roles ALTER COLUMN client_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS user_roles_client_idx ON public.user_roles(client_id);
CREATE INDEX IF NOT EXISTS user_roles_user_client_idx ON public.user_roles(user_id, client_id);

-- 5) New tenant-scoped functions
CREATE OR REPLACE FUNCTION public.has_role_in(_user_id uuid, _client_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND client_id = _client_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.can_edit_bpm_in(_user_id uuid, _client_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role_in(_user_id, _client_id, 'administrador')
      OR public.has_role_in(_user_id, _client_id, 'dueno_proceso')
$$;

-- 6) Keep legacy wrappers (any-tenant) so existing RLS keeps working.
-- `has_role(user, role)` now means: the user has that role in AT LEAST ONE tenant.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.can_edit_bpm(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_user_id,'administrador') OR public.has_role(_user_id,'dueno_proceso')
$$;

GRANT EXECUTE ON FUNCTION public.has_role_in(uuid, uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_edit_bpm_in(uuid, uuid) TO authenticated;
