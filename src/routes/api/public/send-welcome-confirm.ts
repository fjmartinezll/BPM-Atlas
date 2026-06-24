import { createFileRoute } from '@tanstack/react-router';
import { createClient } from '@supabase/supabase-js';

/**
 * Generates a one-time confirmation token for a newly registered user and
 * emails them a welcome message with a link to activate their account.
 * Includes rate-limit (max 3 sends per email in the last hour) and a
 * blocked-domain check.
 */
export const Route = createFileRoute('/api/public/send-welcome-confirm')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = process.env.SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!url || !key) return Response.json({ error: 'server_misconfigured' }, { status: 500 });

        let email: string;
        try {
          const body = await request.json();
          email = String(body?.email || '').trim().toLowerCase();
        } catch {
          return Response.json({ error: 'invalid_body' }, { status: 400 });
        }
        if (!email || !/.+@.+\..+/.test(email)) {
          return Response.json({ error: 'invalid_email' }, { status: 400 });
        }

        const admin = createClient(url, key);

        // Blocked-domain check
        const domain = email.split('@')[1];
        const { data: blocked } = await admin
          .from('blocked_email_domains')
          .select('domain')
          .eq('domain', domain)
          .maybeSingle();
        if (blocked) {
          return Response.json({ ok: false, reason: 'disposable_domain' }, { status: 400 });
        }

        // Confirm the profile exists and is recent
        const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
        const { data: profile } = await admin
          .from('profiles')
          .select('id, email, full_name, created_at')
          .eq('email', email)
          .gte('created_at', tenMinAgo)
          .maybeSingle();
        if (!profile) return Response.json({ ok: false, reason: 'no_recent_profile' });

        // Rate-limit: max 3 active (non-consumed) tokens issued in the last hour for this email
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        const { count: recentCount } = await admin
          .from('signup_confirmations')
          .select('id', { count: 'exact', head: true })
          .eq('email', email)
          .gte('created_at', oneHourAgo);
        if ((recentCount ?? 0) >= 3) {
          return Response.json({ ok: false, reason: 'rate_limited' }, { status: 429 });
        }

        // Generate a 256-bit token
        const bytes = new Uint8Array(32);
        crypto.getRandomValues(bytes);
        const token = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');

        const { error: insErr } = await admin
          .from('signup_confirmations')
          .insert({ user_id: profile.id, email: profile.email, token });
        if (insErr) {
          return Response.json({ ok: false, reason: 'insert_failed', detail: insErr.message }, { status: 500 });
        }

        const origin = new URL(request.url).origin;
        const confirmUrl = `${origin}/onboarding/confirm?token=${token}`;

        const { enqueueTemplateEmail } = await import('@/lib/email/internal-send.server');
        const res = await enqueueTemplateEmail(admin, {
          templateName: 'welcome-confirm-signup',
          recipientEmail: profile.email!,
          idempotencyKey: `welcome-confirm-${profile.id}-${Date.now()}`,
          templateData: {
            fullName: profile.full_name || '',
            confirmUrl,
          },
        });

        return Response.json({ ok: res.ok, reason: res.reason });
      },
    },
  },
});
