
-- Backfill: move bindings into the diagram JSON (data.inputs / data.inputMeta)
-- inputs: array of variable names already exists; add inputMeta keyed by name.
WITH agg AS (
  SELECT
    b.diagram_id,
    b.node_id,
    jsonb_agg(DISTINCT pv.name) AS names,
    jsonb_object_agg(
      pv.name,
      jsonb_strip_nulls(jsonb_build_object(
        'required', b.is_required,
        'defaultValue', b.default_value
      ))
    ) AS meta
  FROM public.node_variable_bindings b
  JOIN public.process_variables pv ON pv.id = b.variable_id
  WHERE b.direction IN ('input','inout')
  GROUP BY b.diagram_id, b.node_id
)
UPDATE public.process_diagrams pd
SET nodes = (
  SELECT jsonb_agg(
    CASE WHEN (n->>'id') = a.node_id THEN
      jsonb_set(
        jsonb_set(n, '{data,inputs}',
          COALESCE(n->'data'->'inputs', '[]'::jsonb) || (
            SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) FROM jsonb_array_elements(a.names) x
            WHERE NOT (n->'data'->'inputs' ? (x #>> '{}'))
          ),
          true),
        '{data,inputMeta}',
        COALESCE(n->'data'->'inputMeta', '{}'::jsonb) || a.meta,
        true)
    ELSE n END
  )
  FROM jsonb_array_elements(pd.nodes) n
)
FROM agg a
WHERE pd.id = a.diagram_id AND pd.nodes @> jsonb_build_array(jsonb_build_object('id', a.node_id));

-- Drop the table and supporting objects
DROP TRIGGER IF EXISTS tenant_nvb_bi ON public.node_variable_bindings;
DROP TRIGGER IF EXISTS nvb_set_updated_at ON public.node_variable_bindings;
DROP TRIGGER IF EXISTS nvb_change_log ON public.node_variable_bindings;
DROP FUNCTION IF EXISTS public._tenant_node_variable_bindings_bi();
DROP TABLE IF EXISTS public.node_variable_bindings;
DROP TYPE IF EXISTS public.var_binding_direction;
