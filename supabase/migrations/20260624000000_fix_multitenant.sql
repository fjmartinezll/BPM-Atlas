
-- ============================================================
-- Fix: scope de roles por tenant + backfill client_id
-- ============================================================

-- 1. Función: verifica rol dentro de un tenant específico
CREATE OR REPLACE FUNCTION public.has_role_in_tenant(_user_id uuid, _role public.app_role, _client_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role AND client_id = _client_id
  )
$$;

-- 2. Función: puede editar BPM dentro de un tenant específico
CREATE OR REPLACE FUNCTION public.can_edit_bpm_in_tenant(_user_id uuid, _client_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role_in_tenant(_user_id, 'administrador', _client_id)
      OR public.has_role_in_tenant(_user_id, 'dueno_proceso', _client_id)
$$;

-- 3. Función: assert de acceso a tenant (usable via RPC desde server functions)
CREATE OR REPLACE FUNCTION public.assert_tenant_access(_user_id uuid, _client_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _client_id IS NULL THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.user_clients
    WHERE user_id = _user_id AND client_id = _client_id
  ) OR (
    public.has_role(_user_id, 'administrador')
    AND NOT EXISTS (SELECT 1 FROM public.user_clients WHERE user_id = _user_id)
  );
END $$;

GRANT EXECUTE ON FUNCTION public.has_role_in_tenant(uuid, public.app_role, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_edit_bpm_in_tenant(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.assert_tenant_access(uuid, uuid) TO authenticated, service_role;

-- 4. Backfill: asignar client_id a filas de user_roles que no lo tengan
UPDATE public.user_roles ur
SET client_id = uc.client_id
FROM public.user_clients uc
WHERE ur.user_id = uc.user_id AND ur.client_id IS NULL;

-- 5. Hacer client_id NOT NULL en user_roles si aún es nullable
ALTER TABLE public.user_roles ALTER COLUMN client_id SET NOT NULL;
