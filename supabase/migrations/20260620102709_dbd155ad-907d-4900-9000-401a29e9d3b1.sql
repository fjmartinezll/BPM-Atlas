ALTER TABLE public.user_clients DROP CONSTRAINT IF EXISTS user_clients_user_id_key;
ALTER TABLE public.user_clients DROP CONSTRAINT IF EXISTS user_clients_user_id_client_id_key;
ALTER TABLE public.user_clients ADD CONSTRAINT user_clients_user_id_client_id_key UNIQUE (user_id, client_id);