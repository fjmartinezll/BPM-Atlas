CREATE OR REPLACE FUNCTION public.admin_run_select(_sql text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  IF lowered ~ '\m(insert|update|delete|drop|alter|create|truncate|grant|revoke|comment|vacuum|analyze|reindex|call|do|copy|set|reset|listen|notify|lock|begin|commit|rollback|savepoint|prepare|execute|deallocate|security|definer|invoker|language|function|procedure|trigger|view|materialized|extension|policy|role|user|schema|tablespace|database|publication|subscription|cluster|refresh|import|foreign|server)\M' THEN
    RAISE EXCEPTION 'Forbidden keyword detected';
  END IF;

  -- Block any mention of sensitive or internal schemas/objects, qualified or bare.
  IF lowered ~ '\m(auth|vault|storage|realtime|graphql|graphql_public|extensions|net|cron|pgsodium|pgsodium_masks|supabase_functions|supabase_migrations|information_schema|pg_catalog|pg_toast|pg_temp|pg_shadow|pg_authid|pg_user|pg_roles)\M' THEN
    RAISE EXCEPTION 'Access to non-public schemas/objects is not allowed';
  END IF;

  IF lowered ~ '\mpg_[a-z_]+\M' THEN
    RAISE EXCEPTION 'Access to Postgres internal objects is not allowed';
  END IF;

  EXECUTE format('SELECT COALESCE(jsonb_agg(t), ''[]''::jsonb) FROM (SELECT * FROM (%s) _q LIMIT 500) t', trimmed) INTO result;
  RETURN result;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_run_select(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_run_select(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_run_select(text) TO service_role;