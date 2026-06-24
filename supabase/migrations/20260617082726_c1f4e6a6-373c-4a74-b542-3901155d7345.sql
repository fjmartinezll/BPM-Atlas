
-- ============================================================
-- Multi-tenant por cliente + entorno pruebas/producción
-- ============================================================

-- 1. Tabla de clientes
CREATE TABLE public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text UNIQUE,
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients TO authenticated;
GRANT ALL ON public.clients TO service_role;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER set_clients_updated_at BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. Relación usuario-cliente
CREATE TABLE public.user_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, client_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_clients TO authenticated;
GRANT ALL ON public.user_clients TO service_role;
ALTER TABLE public.user_clients ENABLE ROW LEVEL SECURITY;

CREATE INDEX user_clients_user_idx ON public.user_clients(user_id);
CREATE INDEX user_clients_client_idx ON public.user_clients(client_id);

-- 3. Funciones helper (SECURITY DEFINER → no recursión RLS)
CREATE OR REPLACE FUNCTION public.can_access_client(_user_id uuid, _client_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _client_id IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.user_clients WHERE user_id = _user_id AND client_id = _client_id)
    OR (
      public.has_role(_user_id, 'administrador')
      AND NOT EXISTS (SELECT 1 FROM public.user_clients WHERE user_id = _user_id)
    )
  )
$$;

CREATE OR REPLACE FUNCTION public.can_access_environment(_user_id uuid, _env text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _env = 'produccion' OR public.has_role(_user_id, 'administrador')
$$;

-- 4. Políticas para clients y user_clients
CREATE POLICY "users see accessible clients" ON public.clients
  FOR SELECT TO authenticated
  USING (public.can_access_client(auth.uid(), id));

CREATE POLICY "admins manage clients" ON public.clients
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'administrador'))
  WITH CHECK (public.has_role(auth.uid(), 'administrador'));

CREATE POLICY "users see own mappings" ON public.user_clients
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'administrador'));

CREATE POLICY "admins manage mappings" ON public.user_clients
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'administrador'))
  WITH CHECK (public.has_role(auth.uid(), 'administrador'));

-- 5. Crear cliente "Default" para datos existentes
INSERT INTO public.clients (name, code, notes)
VALUES ('Default', 'DEFAULT', 'Cliente por defecto creado durante migración multi-tenant');

-- 6. Para cada tabla de negocio: agregar client_id + environment, backfill,
--    NOT NULL, índice y policy RESTRICTIVE de aislamiento por tenant.
DO $$
DECLARE
  default_cid uuid;
  t text;
  tables text[] := ARRAY[
    'processes','macroprocesses','subprocesses','process_definitions','process_diagrams',
    'process_tasks','process_instances','process_variables','process_tokens','process_events_log',
    'process_indicators','process_risks','process_documents','tasks','entities','entity_positions',
    'entity_process_links','executable_elements','executable_element_integrations','instance_start_drafts',
    'subprocess_elements'
  ];
BEGIN
  SELECT id INTO default_cid FROM public.clients WHERE code = 'DEFAULT';

  FOREACH t IN ARRAY tables LOOP
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.clients(id)', t);
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS environment text NOT NULL DEFAULT ''produccion''', t);
    EXECUTE format(
      'UPDATE public.%I SET client_id = %L WHERE client_id IS NULL', t, default_cid);
    EXECUTE format(
      'ALTER TABLE public.%I ALTER COLUMN client_id SET NOT NULL', t);
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (environment IN (''produccion'',''pruebas''))',
      t, t || '_environment_chk');
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON public.%I (client_id, environment)',
      t || '_client_env_idx', t);
    EXECUTE format(
      'CREATE POLICY "tenant_isolation" ON public.%I AS RESTRICTIVE FOR ALL TO authenticated ' ||
      'USING (public.can_access_client(auth.uid(), client_id) AND public.can_access_environment(auth.uid(), environment)) ' ||
      'WITH CHECK (public.can_access_client(auth.uid(), client_id) AND public.can_access_environment(auth.uid(), environment))',
      t);
  END LOOP;
END $$;

-- 7. Backfill user_clients: usuarios no-admin existentes → Default
--    Admins se dejan sin filas para mantener acceso global.
INSERT INTO public.user_clients (user_id, client_id)
SELECT u.id, (SELECT id FROM public.clients WHERE code='DEFAULT')
FROM auth.users u
WHERE NOT public.has_role(u.id, 'administrador')
ON CONFLICT DO NOTHING;
