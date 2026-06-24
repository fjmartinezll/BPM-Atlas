
ALTER TABLE public.entity_diagram_tables ALTER COLUMN diagram_id DROP NOT NULL;
ALTER TABLE public.entity_diagram_tables DROP CONSTRAINT entity_diagram_tables_diagram_id_fkey;
ALTER TABLE public.entity_diagram_tables ADD CONSTRAINT entity_diagram_tables_diagram_id_fkey
  FOREIGN KEY (diagram_id) REFERENCES public.process_diagrams(id) ON DELETE SET NULL;

ALTER TABLE public.entity_table_columns ALTER COLUMN diagram_id DROP NOT NULL;
ALTER TABLE public.entity_table_columns DROP CONSTRAINT entity_table_columns_diagram_id_fkey;
ALTER TABLE public.entity_table_columns ADD CONSTRAINT entity_table_columns_diagram_id_fkey
  FOREIGN KEY (diagram_id) REFERENCES public.process_diagrams(id) ON DELETE SET NULL;
