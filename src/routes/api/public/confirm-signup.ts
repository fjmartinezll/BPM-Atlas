import { createFileRoute } from '@tanstack/react-router';
import { createClient } from '@supabase/supabase-js';

/**
 * Validates a signup confirmation token. Depending on the email domain:
 *   - If a tenant for the domain exists and auto_join_enabled = true → user
 *     joins that tenant with the configured default role.
 *   - If a tenant for the domain exists but auto-join is OFF → a pending
 *     join request is created; admins will approve/reject it.
 *   - Otherwise → a private tenant is auto-provisioned and the user gets
 *     the 'dueno_proceso' role on it.
 * Always marks the email as confirmed in Supabase Auth and consumes the token.
 * Idempotent.
 */
export const Route = createFileRoute('/api/public/confirm-signup')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = process.env.SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!url || !key) return Response.json({ error: 'server_misconfigured' }, { status: 500 });

        let token: string;
        try {
          const body = await request.json();
          token = String(body?.token || '').trim();
        } catch {
          return Response.json({ error: 'invalid_body' }, { status: 400 });
        }
        if (!token || token.length < 32) {
          return Response.json({ error: 'invalid_token' }, { status: 400 });
        }

        const admin = createClient(url, key);

        const { data: conf, error: confErr } = await admin
          .from('signup_confirmations')
          .select('id, user_id, email, expires_at, consumed_at')
          .eq('token', token)
          .maybeSingle();
        if (confErr) return Response.json({ error: 'lookup_failed' }, { status: 500 });
        if (!conf) return Response.json({ error: 'invalid_token' }, { status: 404 });

        if (conf.consumed_at) {
          return Response.json({ ok: true, alreadyConfirmed: true });
        }
        if (new Date(conf.expires_at).getTime() < Date.now()) {
          return Response.json({ error: 'expired' }, { status: 410 });
        }

        // Fetch profile
        const { data: profile } = await admin
          .from('profiles')
          .select('id, email, full_name')
          .eq('id', conf.user_id)
          .maybeSingle();

        const displayName = (profile?.full_name || profile?.email || conf.email || 'Usuario').trim();
        const emailLc = (conf.email || profile?.email || '').toLowerCase();
        const domain = emailLc.split('@')[1] || '';

        // Idempotency: user already in a tenant?
        const { data: existingUc } = await admin
          .from('user_clients')
          .select('client_id')
          .eq('user_id', conf.user_id)
          .limit(1)
          .maybeSingle();

        let outcome: 'auto_join' | 'requested' | 'new_tenant' | 'already_in_tenant' = 'new_tenant';

        if (!existingUc) {
          // Look for an existing tenant matching the email domain
          const { data: matchingTenant } = domain
            ? await admin
                .from('clients')
                .select('id, name, email_domain, auto_join_enabled, auto_join_role')
                .eq('email_domain', domain)
                .eq('active', true)
                .limit(1)
                .maybeSingle()
            : { data: null as any };

          if (matchingTenant && matchingTenant.auto_join_enabled) {
            // Auto-join
            await admin
              .from('user_clients')
              .insert({ user_id: conf.user_id, client_id: matchingTenant.id });
            await admin
              .from('user_roles')
              .insert({ user_id: conf.user_id, role: matchingTenant.auto_join_role || 'participante', client_id: matchingTenant.id });
            outcome = 'auto_join';
          } else if (matchingTenant) {
            // Pending request
            await admin
              .from('tenant_join_requests')
              .insert({
                client_id: matchingTenant.id,
                user_id: conf.user_id,
                email: emailLc,
              });
            outcome = 'requested';
          } else {
            // New private tenant
            const { data: newClient, error: cliErr } = await admin
              .from('clients')
              .insert({ name: `Espacio de ${displayName}`, active: true })
              .select('id')
              .single();
            if (cliErr || !newClient) {
              return Response.json({ error: 'tenant_create_failed', detail: cliErr?.message }, { status: 500 });
            }
            await admin
              .from('user_clients')
              .insert({ user_id: conf.user_id, client_id: newClient.id });
            await admin
              .from('user_roles')
              .insert({ user_id: conf.user_id, role: 'dueno_proceso', client_id: newClient.id });
            outcome = 'new_tenant';
          }
        } else {
          outcome = 'already_in_tenant';
        }

        // Confirm email
        try {
          await admin.auth.admin.updateUserById(conf.user_id, { email_confirm: true });
        } catch {}

        // Mark token consumed
        await admin
          .from('signup_confirmations')
          .update({ consumed_at: new Date().toISOString() })
          .eq('id', conf.id);

        return Response.json({ ok: true, alreadyConfirmed: false, outcome });
      },
    },
  },
});
