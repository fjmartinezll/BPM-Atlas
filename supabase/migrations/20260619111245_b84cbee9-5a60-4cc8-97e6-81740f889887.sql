
ALTER TABLE public.process_variables ALTER COLUMN owner_kind DROP NOT NULL;
ALTER TABLE public.process_variables ALTER COLUMN owner_id DROP NOT NULL;
ALTER TABLE public.process_variables DROP CONSTRAINT IF EXISTS process_variables_owner_kind_owner_id_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS process_variables_scope_name_key
  ON public.process_variables (client_id, environment, COALESCE(entity_id, '00000000-0000-0000-0000-000000000000'::uuid), name);
