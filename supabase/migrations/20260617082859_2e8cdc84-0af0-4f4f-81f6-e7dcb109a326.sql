
-- ============================================================
-- Triggers de propagación client_id/environment desde padre→hijos
-- + revocar EXECUTE a anon en funciones SECURITY DEFINER del tenant
-- ============================================================

-- Función helper: dado tabla y id, devolver (client_id, environment)
CREATE OR REPLACE FUNCTION public._tenant_lookup(_table text, _id uuid)
RETURNS TABLE(client_id uuid, environment text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _id IS NULL THEN
    RETURN;
  END IF;
  RETURN QUERY EXECUTE format(
    'SELECT client_id, environment FROM public.%I WHERE id = $1', _table)
    USING _id;
END $$;

-- ---------- process_definitions ← process_diagrams ----------
CREATE OR REPLACE FUNCTION public._tenant_process_definitions_bi()
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
CREATE TRIGGER tenant_inherit BEFORE INSERT ON public.process_definitions
  FOR EACH ROW EXECUTE FUNCTION public._tenant_process_definitions_bi();

-- ---------- process_instances ← process_definitions ----------
CREATE OR REPLACE FUNCTION public._tenant_process_instances_bi()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p record;
BEGIN
  IF NEW.client_id IS NULL OR NEW.environment IS NULL THEN
    SELECT * INTO p FROM public._tenant_lookup('process_definitions', NEW.definition_id);
    IF p.client_id IS NOT NULL THEN
      NEW.client_id := COALESCE(NEW.client_id, p.client_id);
      NEW.environment := COALESCE(NEW.environment, p.environment, 'produccion');
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER tenant_inherit BEFORE INSERT ON public.process_instances
  FOR EACH ROW EXECUTE FUNCTION public._tenant_process_instances_bi();

-- ---------- process_tokens, process_tasks, process_events_log ← process_instances ----------
CREATE OR REPLACE FUNCTION public._tenant_from_instance_bi()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p record;
BEGIN
  IF NEW.client_id IS NULL OR NEW.environment IS NULL THEN
    SELECT * INTO p FROM public._tenant_lookup('process_instances', NEW.instance_id);
    IF p.client_id IS NOT NULL THEN
      NEW.client_id := COALESCE(NEW.client_id, p.client_id);
      NEW.environment := COALESCE(NEW.environment, p.environment, 'produccion');
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER tenant_inherit BEFORE INSERT ON public.process_tokens
  FOR EACH ROW EXECUTE FUNCTION public._tenant_from_instance_bi();
CREATE TRIGGER tenant_inherit BEFORE INSERT ON public.process_tasks
  FOR EACH ROW EXECUTE FUNCTION public._tenant_from_instance_bi();
CREATE TRIGGER tenant_inherit BEFORE INSERT ON public.process_events_log
  FOR EACH ROW EXECUTE FUNCTION public._tenant_from_instance_bi();

-- ---------- entity_positions ← entities ----------
CREATE OR REPLACE FUNCTION public._tenant_entity_positions_bi()
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
CREATE TRIGGER tenant_inherit BEFORE INSERT ON public.entity_positions
  FOR EACH ROW EXECUTE FUNCTION public._tenant_entity_positions_bi();

-- ---------- entity_process_links ← entities ----------
CREATE OR REPLACE FUNCTION public._tenant_entity_process_links_bi()
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
CREATE TRIGGER tenant_inherit BEFORE INSERT ON public.entity_process_links
  FOR EACH ROW EXECUTE FUNCTION public._tenant_entity_process_links_bi();

-- ---------- subprocess_elements ← subprocesses ----------
CREATE OR REPLACE FUNCTION public._tenant_subprocess_elements_bi()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p record;
BEGIN
  IF NEW.client_id IS NULL OR NEW.environment IS NULL THEN
    SELECT * INTO p FROM public._tenant_lookup('subprocesses', NEW.subprocess_id);
    IF p.client_id IS NOT NULL THEN
      NEW.client_id := COALESCE(NEW.client_id, p.client_id);
      NEW.environment := COALESCE(NEW.environment, p.environment, 'produccion');
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER tenant_inherit BEFORE INSERT ON public.subprocess_elements
  FOR EACH ROW EXECUTE FUNCTION public._tenant_subprocess_elements_bi();

-- ---------- executable_element_integrations ← executable_elements ----------
CREATE OR REPLACE FUNCTION public._tenant_eei_bi()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p record;
BEGIN
  IF NEW.client_id IS NULL OR NEW.environment IS NULL THEN
    SELECT * INTO p FROM public._tenant_lookup('executable_elements', NEW.element_id);
    IF p.client_id IS NOT NULL THEN
      NEW.client_id := COALESCE(NEW.client_id, p.client_id);
      NEW.environment := COALESCE(NEW.environment, p.environment, 'produccion');
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER tenant_inherit BEFORE INSERT ON public.executable_element_integrations
  FOR EACH ROW EXECUTE FUNCTION public._tenant_eei_bi();

-- ---------- instance_start_drafts ← process_definitions ----------
CREATE OR REPLACE FUNCTION public._tenant_isd_bi()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p record;
BEGIN
  IF NEW.client_id IS NULL OR NEW.environment IS NULL THEN
    SELECT * INTO p FROM public._tenant_lookup('process_definitions', NEW.definition_id);
    IF p.client_id IS NOT NULL THEN
      NEW.client_id := COALESCE(NEW.client_id, p.client_id);
      NEW.environment := COALESCE(NEW.environment, p.environment, 'produccion');
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER tenant_inherit BEFORE INSERT ON public.instance_start_drafts
  FOR EACH ROW EXECUTE FUNCTION public._tenant_isd_bi();

-- ---------- process_diagrams ← polimórfico parent_table/parent_id ----------
CREATE OR REPLACE FUNCTION public._tenant_process_diagrams_bi()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p record;
BEGIN
  IF (NEW.client_id IS NULL OR NEW.environment IS NULL) AND NEW.parent_table IS NOT NULL AND NEW.parent_id IS NOT NULL THEN
    IF NEW.parent_table IN ('processes','macroprocesses','subprocesses','entities','tasks') THEN
      SELECT * INTO p FROM public._tenant_lookup(NEW.parent_table, NEW.parent_id);
      IF p.client_id IS NOT NULL THEN
        NEW.client_id := COALESCE(NEW.client_id, p.client_id);
        NEW.environment := COALESCE(NEW.environment, p.environment, 'produccion');
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER tenant_inherit BEFORE INSERT ON public.process_diagrams
  FOR EACH ROW EXECUTE FUNCTION public._tenant_process_diagrams_bi();

-- ---------- process_variables ← polimórfico owner_kind/owner_id ----------
CREATE OR REPLACE FUNCTION public._tenant_process_variables_bi()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p record; tbl text;
BEGIN
  IF (NEW.client_id IS NULL OR NEW.environment IS NULL) AND NEW.owner_kind IS NOT NULL AND NEW.owner_id IS NOT NULL THEN
    tbl := CASE NEW.owner_kind
             WHEN 'process' THEN 'process_diagrams'
             WHEN 'subprocess' THEN 'process_diagrams'
             ELSE NULL END;
    IF tbl IS NOT NULL THEN
      SELECT * INTO p FROM public._tenant_lookup(tbl, NEW.owner_id);
      IF p.client_id IS NOT NULL THEN
        NEW.client_id := COALESCE(NEW.client_id, p.client_id);
        NEW.environment := COALESCE(NEW.environment, p.environment, 'produccion');
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER tenant_inherit BEFORE INSERT ON public.process_variables
  FOR EACH ROW EXECUTE FUNCTION public._tenant_process_variables_bi();

-- ---------- process_indicators / process_risks / process_documents ← target_level/target_id ----------
CREATE OR REPLACE FUNCTION public._tenant_target_bi()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p record; tbl text;
BEGIN
  IF (NEW.client_id IS NULL OR NEW.environment IS NULL) AND NEW.target_level IS NOT NULL AND NEW.target_id IS NOT NULL THEN
    tbl := CASE NEW.target_level
             WHEN 'macroprocesses' THEN 'macroprocesses'
             WHEN 'processes' THEN 'processes'
             WHEN 'subprocesses' THEN 'subprocesses'
             WHEN 'tasks' THEN 'tasks'
             ELSE NULL END;
    IF tbl IS NOT NULL THEN
      SELECT * INTO p FROM public._tenant_lookup(tbl, NEW.target_id);
      IF p.client_id IS NOT NULL THEN
        NEW.client_id := COALESCE(NEW.client_id, p.client_id);
        NEW.environment := COALESCE(NEW.environment, p.environment, 'produccion');
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER tenant_inherit BEFORE INSERT ON public.process_indicators
  FOR EACH ROW EXECUTE FUNCTION public._tenant_target_bi();
CREATE TRIGGER tenant_inherit BEFORE INSERT ON public.process_risks
  FOR EACH ROW EXECUTE FUNCTION public._tenant_target_bi();
CREATE TRIGGER tenant_inherit BEFORE INSERT ON public.process_documents
  FOR EACH ROW EXECUTE FUNCTION public._tenant_target_bi();

-- ---------- Revocar EXECUTE público en funciones SECURITY DEFINER nuevas ----------
REVOKE EXECUTE ON FUNCTION public.can_access_client(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_access_environment(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public._tenant_lookup(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_client(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_access_environment(uuid, text) TO authenticated, service_role;
