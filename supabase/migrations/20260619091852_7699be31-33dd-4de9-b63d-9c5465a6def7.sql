
-- 1. Enum for binding direction
CREATE TYPE public.var_binding_direction AS ENUM ('input','output','inout');

-- 2. Bindings table
CREATE TABLE public.node_variable_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  diagram_id uuid NOT NULL REFERENCES public.process_diagrams(id) ON DELETE CASCADE,
  node_id text NOT NULL,
  variable_id uuid NOT NULL REFERENCES public.process_variables(id) ON DELETE CASCADE,
  direction public.var_binding_direction NOT NULL DEFAULT 'input',
  is_required boolean NOT NULL DEFAULT false,
  default_value jsonb,
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  environment text NOT NULL DEFAULT 'produccion',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (diagram_id, node_id, variable_id, direction)
);

CREATE INDEX idx_nvb_diagram_node ON public.node_variable_bindings(diagram_id, node_id);
CREATE INDEX idx_nvb_variable ON public.node_variable_bindings(variable_id);

-- 3. GRANTs
GRANT SELECT, INSERT, UPDATE, DELETE ON public.node_variable_bindings TO authenticated;
GRANT ALL ON public.node_variable_bindings TO service_role;

-- 4. RLS
ALTER TABLE public.node_variable_bindings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nvb_select" ON public.node_variable_bindings FOR SELECT TO authenticated
USING (public.can_access_client(auth.uid(), client_id) AND public.can_access_environment(auth.uid(), environment));

CREATE POLICY "nvb_modify" ON public.node_variable_bindings FOR ALL TO authenticated
USING (public.can_access_client(auth.uid(), client_id) AND public.can_access_environment(auth.uid(), environment) AND public.can_edit_bpm(auth.uid()))
WITH CHECK (public.can_access_client(auth.uid(), client_id) AND public.can_access_environment(auth.uid(), environment) AND public.can_edit_bpm(auth.uid()));

-- 5. Tenant trigger (fills client_id/environment from diagram)
CREATE OR REPLACE FUNCTION public._tenant_node_variable_bindings_bi()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p record;
BEGIN
  IF NEW.client_id IS NULL OR NEW.environment IS NULL THEN
    SELECT * INTO p FROM public._tenant_lookup('process_diagrams', NEW.diagram_id);
    IF p.client_id IS NOT NULL THEN
      NEW.client_id := COALESCE(NEW.client_id, p.client_id);
      NEW.environment := COALESCE(NEW.environment, p.environment, 'produccion');
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER tenant_nvb_bi BEFORE INSERT OR UPDATE ON public.node_variable_bindings
FOR EACH ROW EXECUTE FUNCTION public._tenant_node_variable_bindings_bi();

-- 6. updated_at trigger
CREATE TRIGGER nvb_set_updated_at BEFORE UPDATE ON public.node_variable_bindings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 7. Change log trigger
CREATE TRIGGER nvb_change_log AFTER INSERT OR UPDATE OR DELETE ON public.node_variable_bindings
FOR EACH ROW EXECUTE FUNCTION public.log_bpm_change();

-- 8. Backfill: para cada process_variable, encontrar el start node de su diagrama y crear binding
-- owner_kind ('process'|'subprocess') => owner_id es process_diagrams.id
INSERT INTO public.node_variable_bindings (diagram_id, node_id, variable_id, direction, is_required, default_value, client_id, environment)
SELECT
  pv.owner_id AS diagram_id,
  (n->>'id') AS node_id,
  pv.id AS variable_id,
  'input'::public.var_binding_direction,
  pv.is_input,
  pv.default_value,
  pv.client_id,
  pv.environment
FROM public.process_variables pv
JOIN public.process_diagrams pd ON pd.id = pv.owner_id
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(pd.nodes, '[]'::jsonb)) AS n
WHERE pv.owner_kind IN ('process','subprocess')
  AND (n->'data'->>'kind') = 'start'
  AND (pv.is_input = true OR pv.default_value IS NOT NULL);

-- 9. Quitar columnas del catálogo
ALTER TABLE public.process_variables DROP COLUMN is_input;
ALTER TABLE public.process_variables DROP COLUMN default_value;
