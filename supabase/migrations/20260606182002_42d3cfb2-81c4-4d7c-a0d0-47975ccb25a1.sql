
CREATE OR REPLACE FUNCTION public.admin_run_select(_sql text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  trimmed text;
  lowered text;
  result jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'administrador') THEN
    RAISE EXCEPTION 'Forbidden: admin role required';
  END IF;

  trimmed := btrim(_sql);
  -- strip trailing semicolons
  WHILE right(trimmed, 1) = ';' LOOP
    trimmed := btrim(left(trimmed, length(trimmed) - 1));
  END LOOP;
  lowered := lower(trimmed);

  IF NOT (lowered LIKE 'select%' OR lowered LIKE 'with%') THEN
    RAISE EXCEPTION 'Only SELECT or WITH queries are allowed';
  END IF;

  -- Reject obvious DML/DDL keywords (defense in depth)
  IF lowered ~ '\m(insert|update|delete|drop|alter|create|truncate|grant|revoke|comment|vacuum|analyze|reindex|call|do|copy)\M' THEN
    RAISE EXCEPTION 'Forbidden keyword detected';
  END IF;

  EXECUTE format('SELECT COALESCE(jsonb_agg(t), ''[]''::jsonb) FROM (%s LIMIT 500) t', trimmed) INTO result;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_run_select(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_run_select(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_table_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'administrador') THEN
    RAISE EXCEPTION 'Forbidden: admin role required';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'table_name', c.relname,
    'row_estimate', c.reltuples::bigint,
    'total_bytes', pg_total_relation_size(c.oid),
    'total_size', pg_size_pretty(pg_total_relation_size(c.oid))
  ) ORDER BY c.relname), '[]'::jsonb)
  INTO result
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r';

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_table_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_table_stats() TO authenticated;
