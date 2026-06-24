
-- 1. executable_element_integrations: restrict SELECT to editors only
DROP POLICY IF EXISTS "read integrations" ON public.executable_element_integrations;
CREATE POLICY "read integrations" ON public.executable_element_integrations
  FOR SELECT TO authenticated
  USING (public.can_edit_bpm(auth.uid()));

-- 2. process_variables: require a BPM role for read (consistent with other BPM tables)
DROP POLICY IF EXISTS "process_variables read auth" ON public.process_variables;
CREATE POLICY "process_variables read auth" ON public.process_variables
  FOR SELECT TO authenticated
  USING (public.has_any_bpm_role(auth.uid()));

-- 3. signup_confirmations: explicit deny for client roles (defense in depth; only service role should access)
DROP POLICY IF EXISTS "signup_confirmations deny client" ON public.signup_confirmations;
CREATE POLICY "signup_confirmations deny client" ON public.signup_confirmations
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

-- 4. tenant_invitations: hide raw token from client roles via column-level revoke.
--    Service role (used by /api/public/accept-invite) retains full access.
REVOKE SELECT (token) ON public.tenant_invitations FROM authenticated;
REVOKE SELECT (token) ON public.tenant_invitations FROM anon;

-- 5. Set immutable search_path on remaining SECURITY-sensitive functions
ALTER FUNCTION public.enqueue_email(text, jsonb)            SET search_path = public;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = public;
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = public;
ALTER FUNCTION public.delete_email(text, bigint)            SET search_path = public;
