
CREATE OR REPLACE FUNCTION public.admin_get_columns(_table text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'administrador') THEN
    RAISE EXCEPTION 'Forbidden: admin role required';
  END IF;

  SELECT jsonb_agg(jsonb_build_object(
    'name', c.column_name,
    'data_type', c.data_type,
    'udt_name', c.udt_name,
    'is_nullable', (c.is_nullable = 'YES'),
    'column_default', c.column_default,
    'is_identity', (c.is_identity = 'YES'),
    'is_primary_key', COALESCE(pk.is_pk, false)
  ) ORDER BY c.ordinal_position)
  INTO result
  FROM information_schema.columns c
  LEFT JOIN (
    SELECT kcu.column_name, true AS is_pk
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON kcu.constraint_name = tc.constraint_name
     AND kcu.table_schema = tc.table_schema
     AND kcu.table_name = tc.table_name
    WHERE tc.constraint_type = 'PRIMARY KEY'
      AND tc.table_schema = 'public'
      AND tc.table_name = _table
  ) pk ON pk.column_name = c.column_name
  WHERE c.table_schema = 'public' AND c.table_name = _table;

  RETURN COALESCE(result, '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_columns(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_columns(text) TO authenticated, service_role;
