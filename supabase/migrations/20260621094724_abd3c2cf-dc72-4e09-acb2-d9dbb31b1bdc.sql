
ALTER TABLE public.process_diagrams ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;

CREATE OR REPLACE FUNCTION public._process_diagrams_bump_version()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF (NEW.name IS DISTINCT FROM OLD.name)
     OR (NEW.nodes IS DISTINCT FROM OLD.nodes)
     OR (NEW.edges IS DISTINCT FROM OLD.edges) THEN
    NEW.version := COALESCE(OLD.version, 1) + 1;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS process_diagrams_bump_version ON public.process_diagrams;
CREATE TRIGGER process_diagrams_bump_version
BEFORE UPDATE ON public.process_diagrams
FOR EACH ROW EXECUTE FUNCTION public._process_diagrams_bump_version();

CREATE OR REPLACE FUNCTION public._process_diagrams_guard_delete()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE cnt int;
BEGIN
  SELECT count(*) INTO cnt FROM public.process_definitions WHERE diagram_id = OLD.id;
  IF cnt > 0 THEN
    RAISE EXCEPTION 'No se puede eliminar: el diagrama está publicado en el motor de procesos (% versión/versiones)', cnt
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS process_diagrams_guard_delete ON public.process_diagrams;
CREATE TRIGGER process_diagrams_guard_delete
BEFORE DELETE ON public.process_diagrams
FOR EACH ROW EXECUTE FUNCTION public._process_diagrams_guard_delete();
