
CREATE OR REPLACE FUNCTION public._clients_block_public_domain_autojoin()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE blocked boolean;
BEGIN
  IF NEW.auto_join_enabled IS TRUE AND NEW.email_domain IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1 FROM public.blocked_email_domains
      WHERE lower(domain) = lower(NEW.email_domain)
    ) INTO blocked;
    IF blocked THEN
      RAISE EXCEPTION 'El dominio % está en la lista de dominios públicos bloqueados y no se permite para auto-unión', NEW.email_domain
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS clients_block_public_domain_autojoin ON public.clients;
CREATE TRIGGER clients_block_public_domain_autojoin
BEFORE INSERT OR UPDATE OF email_domain, auto_join_enabled ON public.clients
FOR EACH ROW EXECUTE FUNCTION public._clients_block_public_domain_autojoin();

CREATE INDEX IF NOT EXISTS change_log_entity_table_created_at_idx
  ON public.change_log (entity_table, created_at DESC);
