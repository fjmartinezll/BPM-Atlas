
-- =====================================================================
-- 1) FKs faltantes en la jerarquía (idempotente)
-- =====================================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='processes_parent_id_fkey') THEN
    ALTER TABLE public.processes
      ADD CONSTRAINT processes_parent_id_fkey FOREIGN KEY (parent_id)
      REFERENCES public.macroprocesses(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='subprocesses_parent_id_fkey') THEN
    ALTER TABLE public.subprocesses
      ADD CONSTRAINT subprocesses_parent_id_fkey FOREIGN KEY (parent_id)
      REFERENCES public.processes(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='tasks_parent_id_fkey') THEN
    ALTER TABLE public.tasks
      ADD CONSTRAINT tasks_parent_id_fkey FOREIGN KEY (parent_id)
      REFERENCES public.subprocesses(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='executable_elements_parent_id_fkey') THEN
    ALTER TABLE public.executable_elements
      ADD CONSTRAINT executable_elements_parent_id_fkey FOREIGN KEY (parent_id)
      REFERENCES public.tasks(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='macroprocesses_entity_id_fkey') THEN
    ALTER TABLE public.macroprocesses
      ADD CONSTRAINT macroprocesses_entity_id_fkey FOREIGN KEY (entity_id)
      REFERENCES public.entities(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Columnas opcionales: tipo de proceso / tipo de tarea
ALTER TABLE public.processes ADD COLUMN IF NOT EXISTS process_type_id uuid;
ALTER TABLE public.tasks     ADD COLUMN IF NOT EXISTS task_type_id    uuid;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='processes_process_type_id_fkey') THEN
    ALTER TABLE public.processes
      ADD CONSTRAINT processes_process_type_id_fkey FOREIGN KEY (process_type_id)
      REFERENCES public.process_types(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='tasks_task_type_id_fkey') THEN
    ALTER TABLE public.tasks
      ADD CONSTRAINT tasks_task_type_id_fkey FOREIGN KEY (task_type_id)
      REFERENCES public.task_types(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Índices
CREATE INDEX IF NOT EXISTS idx_processes_parent           ON public.processes(parent_id);
CREATE INDEX IF NOT EXISTS idx_subprocesses_parent        ON public.subprocesses(parent_id);
CREATE INDEX IF NOT EXISTS idx_tasks_parent               ON public.tasks(parent_id);
CREATE INDEX IF NOT EXISTS idx_executable_elements_parent ON public.executable_elements(parent_id);
CREATE INDEX IF NOT EXISTS idx_macroprocesses_entity      ON public.macroprocesses(entity_id);
CREATE INDEX IF NOT EXISTS idx_processes_type             ON public.processes(process_type_id);
CREATE INDEX IF NOT EXISTS idx_tasks_type                 ON public.tasks(task_type_id);

-- =====================================================================
-- 2) Enum para tipo de nivel BPM (referenciable polimórficamente)
-- =====================================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='bpm_level') THEN
    CREATE TYPE public.bpm_level AS ENUM (
      'macroprocesses','process_types','processes','subprocesses',
      'task_types','tasks','executable_elements'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='sipoc_role') THEN
    CREATE TYPE public.sipoc_role AS ENUM ('proveedor','cliente','entrada','salida');
  END IF;
END $$;

-- =====================================================================
-- 3) Vínculos Entidad <-> nodo BPM (polimórfico por nivel)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.entity_process_links (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id    uuid NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
  target_level public.bpm_level NOT NULL,
  target_id    uuid NOT NULL,
  role         public.sipoc_role NOT NULL,
  notes        text,
  created_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_id, target_level, target_id, role)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.entity_process_links TO authenticated;
GRANT ALL ON public.entity_process_links TO service_role;
ALTER TABLE public.entity_process_links ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_epl_target ON public.entity_process_links(target_level, target_id);
CREATE INDEX IF NOT EXISTS idx_epl_entity ON public.entity_process_links(entity_id);

DROP POLICY IF EXISTS "bpm read epl"  ON public.entity_process_links;
DROP POLICY IF EXISTS "bpm write epl" ON public.entity_process_links;
CREATE POLICY "bpm read epl"  ON public.entity_process_links FOR SELECT TO authenticated USING (public.has_any_bpm_role(auth.uid()));
CREATE POLICY "bpm write epl" ON public.entity_process_links FOR ALL    TO authenticated USING (public.can_edit_bpm(auth.uid())) WITH CHECK (public.can_edit_bpm(auth.uid()));

CREATE TRIGGER trg_epl_updated_at BEFORE UPDATE ON public.entity_process_links
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =====================================================================
-- 4) Indicadores (KPI)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.process_indicators (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_level public.bpm_level NOT NULL,
  target_id    uuid NOT NULL,
  code         text,
  name         text NOT NULL,
  formula      text,
  unit         text,
  target_value numeric,
  frequency    text,
  responsible_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  notes        text,
  created_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.process_indicators TO authenticated;
GRANT ALL ON public.process_indicators TO service_role;
ALTER TABLE public.process_indicators ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_indicators_target ON public.process_indicators(target_level, target_id);

DROP POLICY IF EXISTS "bpm read ind"  ON public.process_indicators;
DROP POLICY IF EXISTS "bpm write ind" ON public.process_indicators;
CREATE POLICY "bpm read ind"  ON public.process_indicators FOR SELECT TO authenticated USING (public.has_any_bpm_role(auth.uid()));
CREATE POLICY "bpm write ind" ON public.process_indicators FOR ALL    TO authenticated USING (public.can_edit_bpm(auth.uid())) WITH CHECK (public.can_edit_bpm(auth.uid()));

CREATE TRIGGER trg_ind_updated_at BEFORE UPDATE ON public.process_indicators
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =====================================================================
-- 5) Riesgos
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.process_risks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_level public.bpm_level NOT NULL,
  target_id    uuid NOT NULL,
  code         text,
  description  text NOT NULL,
  probability  smallint NOT NULL DEFAULT 1,
  impact       smallint NOT NULL DEFAULT 1,
  control      text,
  responsible_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CHECK (probability BETWEEN 1 AND 5),
  CHECK (impact BETWEEN 1 AND 5)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.process_risks TO authenticated;
GRANT ALL ON public.process_risks TO service_role;
ALTER TABLE public.process_risks ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_risks_target ON public.process_risks(target_level, target_id);

DROP POLICY IF EXISTS "bpm read risk"  ON public.process_risks;
DROP POLICY IF EXISTS "bpm write risk" ON public.process_risks;
CREATE POLICY "bpm read risk"  ON public.process_risks FOR SELECT TO authenticated USING (public.has_any_bpm_role(auth.uid()));
CREATE POLICY "bpm write risk" ON public.process_risks FOR ALL    TO authenticated USING (public.can_edit_bpm(auth.uid())) WITH CHECK (public.can_edit_bpm(auth.uid()));

CREATE TRIGGER trg_risk_updated_at BEFORE UPDATE ON public.process_risks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =====================================================================
-- 6) Documentos (metadatos; archivos en bucket bpm-docs)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.process_documents (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_level public.bpm_level NOT NULL,
  target_id    uuid NOT NULL,
  name         text NOT NULL,
  version      text,
  mime_type    text,
  size_bytes   bigint,
  storage_path text NOT NULL,
  created_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.process_documents TO authenticated;
GRANT ALL ON public.process_documents TO service_role;
ALTER TABLE public.process_documents ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_docs_target ON public.process_documents(target_level, target_id);

DROP POLICY IF EXISTS "bpm read doc"  ON public.process_documents;
DROP POLICY IF EXISTS "bpm write doc" ON public.process_documents;
CREATE POLICY "bpm read doc"  ON public.process_documents FOR SELECT TO authenticated USING (public.has_any_bpm_role(auth.uid()));
CREATE POLICY "bpm write doc" ON public.process_documents FOR ALL    TO authenticated USING (public.can_edit_bpm(auth.uid())) WITH CHECK (public.can_edit_bpm(auth.uid()));

CREATE TRIGGER trg_doc_updated_at BEFORE UPDATE ON public.process_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =====================================================================
-- 7) Change log (auditoría)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.change_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id     uuid,
  entity_table text NOT NULL,
  entity_id    uuid,
  action       text NOT NULL,
  diff         jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.change_log TO authenticated;
GRANT ALL    ON public.change_log TO service_role;
ALTER TABLE public.change_log ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_changelog_entity  ON public.change_log(entity_table, entity_id);
CREATE INDEX IF NOT EXISTS idx_changelog_created ON public.change_log(created_at DESC);

DROP POLICY IF EXISTS "admin read changelog" ON public.change_log;
CREATE POLICY "admin read changelog" ON public.change_log
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'administrador'));

-- Trigger genérico de auditoría
CREATE OR REPLACE FUNCTION public.log_bpm_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  v_id := COALESCE((NEW).id, (OLD).id);
  INSERT INTO public.change_log(actor_id, entity_table, entity_id, action, diff)
  VALUES (
    auth.uid(),
    TG_TABLE_NAME,
    v_id,
    TG_OP,
    CASE TG_OP
      WHEN 'INSERT' THEN jsonb_build_object('new', to_jsonb(NEW))
      WHEN 'UPDATE' THEN jsonb_build_object('old', to_jsonb(OLD), 'new', to_jsonb(NEW))
      WHEN 'DELETE' THEN jsonb_build_object('old', to_jsonb(OLD))
    END
  );
  RETURN COALESCE(NEW, OLD);
END $$;

DO $$ DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['macroprocesses','process_types','processes','subprocesses','task_types','tasks','executable_elements'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_%I ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER trg_audit_%I AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.log_bpm_change()', t, t);
  END LOOP;
END $$;

-- =====================================================================
-- 8) Políticas de Storage para el bucket bpm-docs
-- =====================================================================
DROP POLICY IF EXISTS "bpm-docs read"  ON storage.objects;
DROP POLICY IF EXISTS "bpm-docs write" ON storage.objects;
CREATE POLICY "bpm-docs read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'bpm-docs' AND public.has_any_bpm_role(auth.uid()));
CREATE POLICY "bpm-docs write" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'bpm-docs' AND public.can_edit_bpm(auth.uid()))
  WITH CHECK (bucket_id = 'bpm-docs' AND public.can_edit_bpm(auth.uid()));
