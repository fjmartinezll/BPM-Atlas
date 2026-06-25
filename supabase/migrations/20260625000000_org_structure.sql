-- ============================================================
-- Migración: Estructura Organizativa (org chart + miembros +
--             responsabilidades + jerarquías + idioma)
-- ============================================================

-- 1. Extender entities con jerarquía padre-hijo
ALTER TABLE public.entities
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.entities(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS entities_parent_id_idx ON public.entities(parent_id);

-- 2. Extender entity_positions con jerarquía y soporte i18n
DROP INDEX IF EXISTS entity_positions_parent_id_idx;

ALTER TABLE public.entity_positions
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.entity_positions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS label jsonb NOT NULL DEFAULT '{}';

-- description ya existe como text → recrear como jsonb
ALTER TABLE public.entity_positions
  DROP COLUMN IF EXISTS description CASCADE;
ALTER TABLE public.entity_positions
  ADD COLUMN description jsonb NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS entity_positions_parent_id_idx ON public.entity_positions(parent_id);

-- Backfill: los positions existentes obtienen label en español
UPDATE public.entity_positions
  SET label = jsonb_build_object('es', name)
  WHERE label = '{}'::jsonb;

-- 3. Extender profiles con idioma preferido
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'es'
  CHECK (language IN ('es','en','fr','de','it','pt','ja','zh'));

-- 4. Crear org_members (personas de la organización)
CREATE TABLE IF NOT EXISTS public.org_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  email text,
  phone text,
  language text NOT NULL DEFAULT 'es'
    CHECK (language IN ('es','en','fr','de','it','pt','ja','zh')),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  client_id uuid NOT NULL REFERENCES public.clients(id),
  environment text NOT NULL DEFAULT 'produccion'
    CHECK (environment IN ('produccion','pruebas')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS org_members_entity_id_idx ON public.org_members(entity_id);
CREATE INDEX IF NOT EXISTS org_members_client_env_idx ON public.org_members(client_id, environment);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_members TO authenticated;
GRANT ALL ON public.org_members TO service_role;

ALTER TABLE public.org_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_members read auth" ON public.org_members
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "org_members write admin" ON public.org_members
  FOR ALL TO authenticated
  USING (public.can_edit_bpm(auth.uid()))
  WITH CHECK (public.can_edit_bpm(auth.uid()));

CREATE POLICY "tenant_isolation" ON public.org_members AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.can_access_client(auth.uid(), client_id) AND public.can_access_environment(auth.uid(), environment))
  WITH CHECK (public.can_access_client(auth.uid(), client_id) AND public.can_access_environment(auth.uid(), environment));

CREATE TRIGGER org_members_set_updated_at
  BEFORE UPDATE ON public.org_members
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER org_members_log
  AFTER INSERT OR UPDATE OR DELETE ON public.org_members
  FOR EACH ROW EXECUTE FUNCTION public.log_bpm_change();

-- 5. Crear org_position_assignments (quién ocupa qué cargo)
CREATE TABLE IF NOT EXISTS public.org_position_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id uuid NOT NULL REFERENCES public.entity_positions(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.org_members(id) ON DELETE CASCADE,
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  end_date date,
  is_primary boolean NOT NULL DEFAULT false,
  client_id uuid NOT NULL REFERENCES public.clients(id),
  environment text NOT NULL DEFAULT 'produccion'
    CHECK (environment IN ('produccion','pruebas')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS org_position_assignments_position_idx ON public.org_position_assignments(position_id);
CREATE INDEX IF NOT EXISTS org_position_assignments_member_idx ON public.org_position_assignments(member_id);
CREATE INDEX IF NOT EXISTS org_position_assignments_client_env_idx ON public.org_position_assignments(client_id, environment);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_position_assignments TO authenticated;
GRANT ALL ON public.org_position_assignments TO service_role;

ALTER TABLE public.org_position_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_position_assignments read auth" ON public.org_position_assignments
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "org_position_assignments write admin" ON public.org_position_assignments
  FOR ALL TO authenticated
  USING (public.can_edit_bpm(auth.uid()))
  WITH CHECK (public.can_edit_bpm(auth.uid()));

CREATE POLICY "tenant_isolation" ON public.org_position_assignments AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.can_access_client(auth.uid(), client_id) AND public.can_access_environment(auth.uid(), environment))
  WITH CHECK (public.can_access_client(auth.uid(), client_id) AND public.can_access_environment(auth.uid(), environment));

CREATE TRIGGER org_position_assignments_log
  AFTER INSERT OR UPDATE OR DELETE ON public.org_position_assignments
  FOR EACH ROW EXECUTE FUNCTION public.log_bpm_change();

-- 6. Crear org_responsibilities (tareas por cargo)
CREATE TABLE IF NOT EXISTS public.org_responsibilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id uuid NOT NULL REFERENCES public.entity_positions(id) ON DELETE CASCADE,
  name text NOT NULL,
  label jsonb NOT NULL DEFAULT '{}',
  description jsonb NOT NULL DEFAULT '{}',
  sort_order integer NOT NULL DEFAULT 0,
  client_id uuid NOT NULL REFERENCES public.clients(id),
  environment text NOT NULL DEFAULT 'produccion'
    CHECK (environment IN ('produccion','pruebas')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS org_responsibilities_position_idx ON public.org_responsibilities(position_id);
CREATE INDEX IF NOT EXISTS org_responsibilities_client_env_idx ON public.org_responsibilities(client_id, environment);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_responsibilities TO authenticated;
GRANT ALL ON public.org_responsibilities TO service_role;

ALTER TABLE public.org_responsibilities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_responsibilities read auth" ON public.org_responsibilities
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "org_responsibilities write admin" ON public.org_responsibilities
  FOR ALL TO authenticated
  USING (public.can_edit_bpm(auth.uid()))
  WITH CHECK (public.can_edit_bpm(auth.uid()));

CREATE POLICY "tenant_isolation" ON public.org_responsibilities AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.can_access_client(auth.uid(), client_id) AND public.can_access_environment(auth.uid(), environment))
  WITH CHECK (public.can_access_client(auth.uid(), client_id) AND public.can_access_environment(auth.uid(), environment));

CREATE TRIGGER org_responsibilities_set_updated_at
  BEFORE UPDATE ON public.org_responsibilities
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER org_responsibilities_log
  AFTER INSERT OR UPDATE OR DELETE ON public.org_responsibilities
  FOR EACH ROW EXECUTE FUNCTION public.log_bpm_change();

-- 7. Restricción: un miembro solo puede tener un cargo primario por entidad
CREATE UNIQUE INDEX IF NOT EXISTS org_position_assignments_one_primary
  ON public.org_position_assignments (member_id, is_primary)
  WHERE is_primary = true;
