
-- Triggers extra para herencia en jerarquía organizacional

-- macroprocesses ← entities (entity_id)
CREATE OR REPLACE FUNCTION public._tenant_macroprocesses_bi()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p record;
BEGIN
  IF NEW.client_id IS NULL OR NEW.environment IS NULL THEN
    SELECT * INTO p FROM public._tenant_lookup('entities', NEW.entity_id);
    IF p.client_id IS NOT NULL THEN
      NEW.client_id := COALESCE(NEW.client_id, p.client_id);
      NEW.environment := COALESCE(NEW.environment, p.environment, 'produccion');
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER tenant_inherit BEFORE INSERT ON public.macroprocesses
  FOR EACH ROW EXECUTE FUNCTION public._tenant_macroprocesses_bi();

-- processes ← macroprocesses (parent_id)
CREATE OR REPLACE FUNCTION public._tenant_processes_bi()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p record;
BEGIN
  IF NEW.client_id IS NULL OR NEW.environment IS NULL THEN
    SELECT * INTO p FROM public._tenant_lookup('macroprocesses', NEW.parent_id);
    IF p.client_id IS NOT NULL THEN
      NEW.client_id := COALESCE(NEW.client_id, p.client_id);
      NEW.environment := COALESCE(NEW.environment, p.environment, 'produccion');
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER tenant_inherit BEFORE INSERT ON public.processes
  FOR EACH ROW EXECUTE FUNCTION public._tenant_processes_bi();

-- subprocesses ← processes (parent_id)
CREATE OR REPLACE FUNCTION public._tenant_subprocesses_bi()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p record;
BEGIN
  IF NEW.client_id IS NULL OR NEW.environment IS NULL THEN
    SELECT * INTO p FROM public._tenant_lookup('processes', NEW.parent_id);
    IF p.client_id IS NOT NULL THEN
      NEW.client_id := COALESCE(NEW.client_id, p.client_id);
      NEW.environment := COALESCE(NEW.environment, p.environment, 'produccion');
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER tenant_inherit BEFORE INSERT ON public.subprocesses
  FOR EACH ROW EXECUTE FUNCTION public._tenant_subprocesses_bi();

-- tasks ← subprocesses (parent_id)
CREATE OR REPLACE FUNCTION public._tenant_tasks_bi()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p record;
BEGIN
  IF NEW.client_id IS NULL OR NEW.environment IS NULL THEN
    SELECT * INTO p FROM public._tenant_lookup('subprocesses', NEW.parent_id);
    IF p.client_id IS NOT NULL THEN
      NEW.client_id := COALESCE(NEW.client_id, p.client_id);
      NEW.environment := COALESCE(NEW.environment, p.environment, 'produccion');
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER tenant_inherit BEFORE INSERT ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public._tenant_tasks_bi();

-- executable_elements: sin padre claro, dejar que la app pase client_id.
-- (entities también: lo pasa la app vía withTenant)
