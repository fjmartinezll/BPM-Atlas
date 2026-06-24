
-- 1. Añadir rol super_admin
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'super_admin' AND enumtypid = 'public.app_role'::regtype) THEN
    ALTER TYPE public.app_role ADD VALUE 'super_admin';
  END IF;
END $$;

-- 2. Clients: añadir status y plan_label
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS plan_label text;

-- 3. user_clients: un cliente por usuario
ALTER TABLE public.user_clients DROP CONSTRAINT IF EXISTS user_clients_user_id_key;
ALTER TABLE public.user_clients ADD CONSTRAINT user_clients_user_id_key UNIQUE (user_id);

-- 4. Webhooks en executable_element_integrations
ALTER TABLE public.executable_element_integrations
  ADD COLUMN IF NOT EXISTS webhook_url text,
  ADD COLUMN IF NOT EXISTS webhook_secret text,
  ADD COLUMN IF NOT EXISTS payload_template jsonb;
