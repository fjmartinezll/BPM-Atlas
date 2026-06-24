
-- Enum de tipos de dato
DO $$ BEGIN
  CREATE TYPE public.entity_field_data_type AS ENUM ('text','integer','numeric','boolean','date','timestamp','uuid','json');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =========================================
-- 1) Catálogo de campos
-- =========================================
CREATE TABLE public.entity_field_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  environment text NOT NULL DEFAULT 'pruebas',
  name text NOT NULL,
  data_type public.entity_field_data_type NOT NULL DEFAULT 'text',
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, environment, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.entity_field_catalog TO authenticated;
GRANT ALL ON public.entity_field_catalog TO service_role;

ALTER TABLE public.entity_field_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "efc_select" ON public.entity_field_catalog
  FOR SELECT TO authenticated
  USING (public.can_access_client(auth.uid(), client_id) AND public.can_access_environment(auth.uid(), environment));

CREATE POLICY "efc_insert" ON public.entity_field_catalog
  FOR INSERT TO authenticated
  WITH CHECK (public.can_edit_bpm(auth.uid()) AND public.can_access_client(auth.uid(), client_id) AND public.can_access_environment(auth.uid(), environment));

CREATE POLICY "efc_update" ON public.entity_field_catalog
  FOR UPDATE TO authenticated
  USING (public.can_edit_bpm(auth.uid()) AND public.can_access_client(auth.uid(), client_id))
  WITH CHECK (public.can_edit_bpm(auth.uid()) AND public.can_access_client(auth.uid(), client_id));

CREATE POLICY "efc_delete" ON public.entity_field_catalog
  FOR DELETE TO authenticated
  USING (public.can_edit_bpm(auth.uid()) AND public.can_access_client(auth.uid(), client_id));

CREATE TRIGGER trg_efc_updated_at BEFORE UPDATE ON public.entity_field_catalog
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_efc_log AFTER INSERT OR UPDATE OR DELETE ON public.entity_field_catalog
  FOR EACH ROW EXECUTE FUNCTION public.log_bpm_change();

-- =========================================
-- 2) Columnas asignadas a nodos-tabla del diagrama
-- =========================================
CREATE TABLE public.entity_table_columns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  environment text NOT NULL DEFAULT 'pruebas',
  diagram_id uuid NOT NULL REFERENCES public.process_diagrams(id) ON DELETE CASCADE,
  node_id text NOT NULL,
  field_id uuid NOT NULL REFERENCES public.entity_field_catalog(id) ON DELETE RESTRICT,
  position integer NOT NULL DEFAULT 0,
  is_primary_key boolean NOT NULL DEFAULT false,
  is_nullable boolean NOT NULL DEFAULT true,
  fk_target_node_id text,
  fk_target_column_id uuid REFERENCES public.entity_table_columns(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (diagram_id, node_id, field_id)
);

CREATE INDEX idx_etc_diagram ON public.entity_table_columns(diagram_id);
CREATE INDEX idx_etc_diagram_node ON public.entity_table_columns(diagram_id, node_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.entity_table_columns TO authenticated;
GRANT ALL ON public.entity_table_columns TO service_role;

ALTER TABLE public.entity_table_columns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "etc_select" ON public.entity_table_columns
  FOR SELECT TO authenticated
  USING (public.can_access_client(auth.uid(), client_id) AND public.can_access_environment(auth.uid(), environment));

CREATE POLICY "etc_insert" ON public.entity_table_columns
  FOR INSERT TO authenticated
  WITH CHECK (public.can_edit_bpm(auth.uid()) AND public.can_access_client(auth.uid(), client_id) AND public.can_access_environment(auth.uid(), environment));

CREATE POLICY "etc_update" ON public.entity_table_columns
  FOR UPDATE TO authenticated
  USING (public.can_edit_bpm(auth.uid()) AND public.can_access_client(auth.uid(), client_id))
  WITH CHECK (public.can_edit_bpm(auth.uid()) AND public.can_access_client(auth.uid(), client_id));

CREATE POLICY "etc_delete" ON public.entity_table_columns
  FOR DELETE TO authenticated
  USING (public.can_edit_bpm(auth.uid()) AND public.can_access_client(auth.uid(), client_id));

CREATE TRIGGER trg_etc_updated_at BEFORE UPDATE ON public.entity_table_columns
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_etc_log AFTER INSERT OR UPDATE OR DELETE ON public.entity_table_columns
  FOR EACH ROW EXECUTE FUNCTION public.log_bpm_change();

-- Auto-tenant: heredar client_id/environment del diagrama si no se proporciona
CREATE OR REPLACE FUNCTION public._tenant_entity_table_columns_bi()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE p record;
BEGIN
  IF NEW.client_id IS NULL OR NEW.environment IS NULL THEN
    SELECT * INTO p FROM public._tenant_lookup('process_diagrams', NEW.diagram_id);
    IF p.client_id IS NOT NULL THEN
      NEW.client_id := COALESCE(NEW.client_id, p.client_id);
      NEW.environment := COALESCE(NEW.environment, p.environment, 'pruebas');
    END IF;
  END IF;
  RETURN NEW;
END $fn$;

CREATE TRIGGER trg_etc_tenant BEFORE INSERT ON public.entity_table_columns
  FOR EACH ROW EXECUTE FUNCTION public._tenant_entity_table_columns_bi();
