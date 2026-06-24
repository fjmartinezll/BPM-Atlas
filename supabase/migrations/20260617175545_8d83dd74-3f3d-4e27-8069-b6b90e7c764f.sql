-- 1. Create entity_diagram_tables registry
CREATE TABLE public.entity_diagram_tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  diagram_id uuid NOT NULL REFERENCES public.process_diagrams(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  environment text NOT NULL DEFAULT 'pruebas',
  label text NOT NULL DEFAULT 'Tabla',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.entity_diagram_tables TO authenticated;
GRANT ALL ON public.entity_diagram_tables TO service_role;

ALTER TABLE public.entity_diagram_tables ENABLE ROW LEVEL SECURITY;

CREATE POLICY "diagram_tables_select" ON public.entity_diagram_tables
  FOR SELECT TO authenticated
  USING (public.can_access_client(auth.uid(), client_id) AND public.can_access_environment(auth.uid(), environment));

CREATE POLICY "diagram_tables_modify" ON public.entity_diagram_tables
  FOR ALL TO authenticated
  USING (public.can_access_client(auth.uid(), client_id) AND public.can_access_environment(auth.uid(), environment))
  WITH CHECK (public.can_access_client(auth.uid(), client_id) AND public.can_access_environment(auth.uid(), environment));

CREATE TRIGGER set_updated_at_entity_diagram_tables
  BEFORE UPDATE ON public.entity_diagram_tables
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_entity_diagram_tables_diagram ON public.entity_diagram_tables(diagram_id);

-- 2. Migrate: for each distinct (diagram_id, node_id) in entity_table_columns,
--    create a new uuid registry row and rewrite node_id to that uuid.
DO $$
DECLARE
  r record;
  new_id uuid;
  v_label text;
BEGIN
  FOR r IN
    SELECT DISTINCT etc.diagram_id, etc.node_id, etc.client_id, etc.environment
    FROM public.entity_table_columns etc
  LOOP
    new_id := gen_random_uuid();

    SELECT COALESCE(NULLIF(n->'data'->>'label',''), 'Tabla')
      INTO v_label
      FROM public.process_diagrams pd,
           LATERAL jsonb_array_elements(COALESCE(pd.nodes,'[]'::jsonb)) n
      WHERE pd.id = r.diagram_id AND n->>'id' = r.node_id
      LIMIT 1;

    INSERT INTO public.entity_diagram_tables (id, diagram_id, client_id, environment, label)
    VALUES (new_id, r.diagram_id, r.client_id, r.environment, COALESCE(v_label, 'Tabla'));

    -- Rewrite columns to point at the new uuid
    UPDATE public.entity_table_columns
       SET node_id = new_id::text
     WHERE diagram_id = r.diagram_id AND node_id = r.node_id;

    -- Rewrite FK targets pointing at the old text node_id
    UPDATE public.entity_table_columns
       SET fk_target_node_id = new_id::text
     WHERE diagram_id = r.diagram_id AND fk_target_node_id = r.node_id;
  END LOOP;
END $$;
