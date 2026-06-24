
CREATE OR REPLACE FUNCTION public._tenant_tasks_bi()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE p record;
BEGIN
  IF NEW.client_id IS NULL OR NEW.environment IS NULL THEN
    SELECT * INTO p FROM public._tenant_lookup('subprocesses', NEW.parent_id);
    IF p.client_id IS NULL THEN
      SELECT * INTO p FROM public._tenant_lookup('processes', NEW.parent_id);
    END IF;
    IF p.client_id IS NOT NULL THEN
      NEW.client_id := COALESCE(NEW.client_id, p.client_id);
      NEW.environment := COALESCE(NEW.environment, p.environment, 'produccion');
    END IF;
  END IF;
  RETURN NEW;
END $function$;
