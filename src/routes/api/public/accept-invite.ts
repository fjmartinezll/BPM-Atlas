import { createFileRoute } from '@tanstack/react-router';
import { createClient } from '@supabase/supabase-js';

/**
 * Accepts a tenant invitation token. Requires that the caller is signed in:
 * the bearer token in the Authorization header is used to identify the user.
 * On success, the user is added to the tenant with the invited role and the
 * invitation is marked accepted.
 */
export const Route = createFileRoute('/api/public/accept-invite')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = process.env.SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        const pubKey = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!url || !key || !pubKey) return Response.json({ error: 'server_misconfigured' }, { status: 500 });

        let token: string;
        try {
          const body = await request.json();
          token = String(body?.token || '').trim();
        } catch {
          return Response.json({ error: 'invalid_body' }, { status: 400 });
        }
        if (!token) return Response.json({ error: 'invalid_token' }, { status: 400 });

        // Identify caller via bearer token
        const authHeader = request.headers.get('authorization') || '';
        const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
        if (!bearer) return Response.json({ error: 'unauthenticated' }, { status: 401 });

        const userClient = createClient(url, pubKey, {
          auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
        });
        const { data: claims, error: claimsErr } = await userClient.auth.getClaims(bearer);
        if (claimsErr || !claims?.claims?.sub) {
          return Response.json({ error: 'invalid_session' }, { status: 401 });
        }
        const userId = claims.claims.sub as string;
        const userEmail = String(claims.claims.email || '').toLowerCase();

        const admin = createClient(url, key);

        const { data: invite } = await admin
          .from('tenant_invitations')
          .select('id, client_id, email, role, expires_at, accepted_at, revoked_at')
          .eq('token', token)
          .maybeSingle();
        if (!invite) return Response.json({ error: 'invalid_token' }, { status: 404 });
        if (invite.accepted_at) return Response.json({ ok: true, alreadyAccepted: true, clientId: invite.client_id });
        if (invite.revoked_at) return Response.json({ error: 'revoked' }, { status: 410 });
        if (new Date(invite.expires_at).getTime() < Date.now()) {
          return Response.json({ error: 'expired' }, { status: 410 });
        }
        if (invite.email.toLowerCase() !== userEmail) {
          return Response.json({ error: 'email_mismatch' }, { status: 403 });
        }

        // Add user to tenant + role (idempotent)
        const { error: ucErr } = await admin
          .from('user_clients')
          .insert({ user_id: userId, client_id: invite.client_id });
        if (ucErr && !ucErr.message.includes('duplicate')) {
          return Response.json({ error: 'assign_failed', detail: ucErr.message }, { status: 500 });
        }
        const { error: roleErr } = await admin
          .from('user_roles')
          .insert({ user_id: userId, role: invite.role, client_id: invite.client_id });
        if (roleErr && !roleErr.message.includes('duplicate')) {
          return Response.json({ error: 'role_failed', detail: roleErr.message }, { status: 500 });
        }

        await admin
          .from('tenant_invitations')
          .update({ accepted_at: new Date().toISOString() })
          .eq('id', invite.id);

        return Response.json({ ok: true, clientId: invite.client_id });
      },
    },
  },
});
