
CREATE TABLE public.signup_confirmations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  token text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_signup_confirmations_user_id ON public.signup_confirmations(user_id);
GRANT ALL ON public.signup_confirmations TO service_role;
ALTER TABLE public.signup_confirmations ENABLE ROW LEVEL SECURITY;
-- No policies: only service_role accesses this table via the public confirmation endpoint.
