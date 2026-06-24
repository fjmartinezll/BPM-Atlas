
-- ============ Bloque 4: dominios de email bloqueados ============
CREATE TABLE public.blocked_email_domains (
  domain text PRIMARY KEY,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.blocked_email_domains TO anon, authenticated;
GRANT ALL ON public.blocked_email_domains TO service_role;
ALTER TABLE public.blocked_email_domains ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read blocked domains" ON public.blocked_email_domains FOR SELECT USING (true);

INSERT INTO public.blocked_email_domains (domain, reason) VALUES
  ('mailinator.com','disposable'),('tempmail.com','disposable'),('temp-mail.org','disposable'),
  ('guerrillamail.com','disposable'),('guerrillamail.net','disposable'),('guerrillamail.org','disposable'),
  ('sharklasers.com','disposable'),('grr.la','disposable'),
  ('10minutemail.com','disposable'),('10minutemail.net','disposable'),('20minutemail.com','disposable'),
  ('yopmail.com','disposable'),('yopmail.fr','disposable'),('yopmail.net','disposable'),
  ('throwawaymail.com','disposable'),('trashmail.com','disposable'),('trashmail.net','disposable'),
  ('getnada.com','disposable'),('nada.email','disposable'),('inboxbear.com','disposable'),
  ('maildrop.cc','disposable'),('mintemail.com','disposable'),('mohmal.com','disposable'),
  ('mytemp.email','disposable'),('mytrashmail.com','disposable'),('emailondeck.com','disposable'),
  ('fakeinbox.com','disposable'),('mailcatch.com','disposable'),('mailnesia.com','disposable'),
  ('mailnull.com','disposable'),('mailtothis.com','disposable'),('spam4.me','disposable'),
  ('spambox.us','disposable'),('spamgourmet.com','disposable'),('spamhole.com','disposable'),
  ('spaml.com','disposable'),('temporaryemail.net','disposable'),('temporaryinbox.com','disposable'),
  ('disposablemail.com','disposable'),('discardmail.com','disposable'),('dispostable.com','disposable'),
  ('dropmail.me','disposable'),('emailfake.com','disposable'),('emailtemporanea.net','disposable'),
  ('fakemail.fr','disposable'),('fakemailgenerator.com','disposable'),('harakirimail.com','disposable'),
  ('jetable.org','disposable'),('mvrht.com','disposable'),('mailforspam.com','disposable'),
  ('mt2015.com','disposable'),('mvrht.net','disposable'),('rcpt.at','disposable'),
  ('tempinbox.com','disposable'),('tempmailo.com','disposable'),('tempr.email','disposable'),
  ('throwam.com','disposable'),('tmail.ws','disposable'),('vomoto.com','disposable'),
  ('wegwerfmail.de','disposable'),('zetmail.com','disposable')
ON CONFLICT DO NOTHING;

-- ============ Bloque 1: auto-join por dominio en clients ============
ALTER TABLE public.clients
  ADD COLUMN email_domain text,
  ADD COLUMN auto_join_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN auto_join_role app_role NOT NULL DEFAULT 'participante',
  ADD COLUMN onboarding_completed boolean NOT NULL DEFAULT false;
CREATE INDEX idx_clients_email_domain ON public.clients(email_domain) WHERE email_domain IS NOT NULL;

-- ============ Bloque 1: solicitudes de acceso a un tenant ============
CREATE TABLE public.tenant_join_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  resolved_by uuid REFERENCES auth.users(id),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, user_id)
);
CREATE INDEX idx_tenant_join_requests_client ON public.tenant_join_requests(client_id, status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_join_requests TO authenticated;
GRANT ALL ON public.tenant_join_requests TO service_role;
ALTER TABLE public.tenant_join_requests ENABLE ROW LEVEL SECURITY;
-- Admins of the tenant can manage its requests
CREATE POLICY "Tenant admins read requests" ON public.tenant_join_requests FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'administrador') AND public.can_access_client(auth.uid(), client_id));
CREATE POLICY "Tenant admins update requests" ON public.tenant_join_requests FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'administrador') AND public.can_access_client(auth.uid(), client_id));
-- Users see their own pending requests
CREATE POLICY "Users see own requests" ON public.tenant_join_requests FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ============ Bloque 2: invitaciones a un tenant ============
CREATE TABLE public.tenant_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  email text NOT NULL,
  role app_role NOT NULL DEFAULT 'participante',
  token text NOT NULL UNIQUE,
  invited_by uuid REFERENCES auth.users(id),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_tenant_invitations_client ON public.tenant_invitations(client_id);
CREATE INDEX idx_tenant_invitations_email ON public.tenant_invitations(lower(email));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_invitations TO authenticated;
GRANT ALL ON public.tenant_invitations TO service_role;
ALTER TABLE public.tenant_invitations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant admins manage invites" ON public.tenant_invitations FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'administrador') AND public.can_access_client(auth.uid(), client_id))
  WITH CHECK (public.has_role(auth.uid(),'administrador') AND public.can_access_client(auth.uid(), client_id));
