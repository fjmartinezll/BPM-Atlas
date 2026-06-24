
-- Relajar NOT NULL en client_id/environment para que los tipos generados
-- los marquen como opcionales en Insert (los triggers o app los rellenan,
-- y la RLS RESTRICTIVE rechaza filas con client_id NULL).

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'processes','macroprocesses','subprocesses','process_definitions','process_diagrams',
    'process_tasks','process_instances','process_variables','process_tokens','process_events_log',
    'process_indicators','process_risks','process_documents','tasks','entities','entity_positions',
    'entity_process_links','executable_elements','executable_element_integrations','instance_start_drafts',
    'subprocess_elements'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN client_id DROP NOT NULL', t);
    -- environment ya tiene DEFAULT 'produccion', dejarlo NOT NULL es correcto
  END LOOP;
END $$;
