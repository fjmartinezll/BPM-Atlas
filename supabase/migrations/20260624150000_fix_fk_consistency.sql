
-- ============================================================
-- Fix: cambiar FKs inconsistentes de SET NULL a NO ACTION
-- Regla: no se puede borrar un padre si existen hijos
-- ============================================================

ALTER TABLE public.entity_diagram_tables
  DROP CONSTRAINT entity_diagram_tables_diagram_id_fkey,
  ADD CONSTRAINT entity_diagram_tables_diagram_id_fkey
    FOREIGN KEY (diagram_id) REFERENCES public.process_diagrams(id)
    ON DELETE NO ACTION;

ALTER TABLE public.entity_table_columns
  DROP CONSTRAINT entity_table_columns_diagram_id_fkey,
  ADD CONSTRAINT entity_table_columns_diagram_id_fkey
    FOREIGN KEY (diagram_id) REFERENCES public.process_diagrams(id)
    ON DELETE NO ACTION;

ALTER TABLE public.entity_table_columns
  DROP CONSTRAINT entity_table_columns_fk_target_column_id_fkey,
  ADD CONSTRAINT entity_table_columns_fk_target_column_id_fkey
    FOREIGN KEY (fk_target_column_id) REFERENCES public.entity_table_columns(id)
    ON DELETE NO ACTION;

ALTER TABLE public.process_definitions
  DROP CONSTRAINT process_definitions_diagram_id_fkey,
  ADD CONSTRAINT process_definitions_diagram_id_fkey
    FOREIGN KEY (diagram_id) REFERENCES public.process_diagrams(id)
    ON DELETE NO ACTION;

ALTER TABLE public.process_diagrams
  DROP CONSTRAINT process_diagrams_entity_id_fkey,
  ADD CONSTRAINT process_diagrams_entity_id_fkey
    FOREIGN KEY (entity_id) REFERENCES public.entities(id)
    ON DELETE NO ACTION;

ALTER TABLE public.process_variables
  DROP CONSTRAINT process_variables_entity_id_fkey,
  ADD CONSTRAINT process_variables_entity_id_fkey
    FOREIGN KEY (entity_id) REFERENCES public.entities(id)
    ON DELETE NO ACTION;

ALTER TABLE public.process_tasks
  DROP CONSTRAINT process_tasks_token_id_fkey,
  ADD CONSTRAINT process_tasks_token_id_fkey
    FOREIGN KEY (token_id) REFERENCES public.process_tokens(id)
    ON DELETE NO ACTION;
