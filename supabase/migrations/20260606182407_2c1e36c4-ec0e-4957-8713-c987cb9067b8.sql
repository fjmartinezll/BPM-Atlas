
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
  WHILE right(trimmed, 1) = ';' LOOP
    trimmed := btrim(left(trimmed, length(trimmed) - 1));
  END LOOP;
  lowered := lower(trimmed);

  IF NOT (lowered LIKE 'select%' OR lowered LIKE 'with%') THEN
    RAISE EXCEPTION 'Only SELECT or WITH queries are allowed';
  END IF;

  IF lowered ~ '\m(insert|update|delete|drop|alter|create|truncate|grant|revoke|comment|vacuum|analyze|reindex|call|do|copy)\M' THEN
    RAISE EXCEPTION 'Forbidden keyword detected';
  END IF;

  EXECUTE format('SELECT COALESCE(jsonb_agg(t), ''[]''::jsonb) FROM (SELECT * FROM (%s) _q LIMIT 500) t', trimmed) INTO result;
  RETURN result;
END;
$$;
