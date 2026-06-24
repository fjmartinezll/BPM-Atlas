import { createFileRoute } from '@tanstack/react-router';
import { createClient } from '@supabase/supabase-js';

/**
 * Public endpoint called right after a user signs up to notify all admins
 * that they need to assign roles. We use the service role to:
 *   1. Verify a profile for the provided email was created within the last 10 minutes.
 *      (anti-spam: limits this endpoint to genuinely new signups)
 *   2. Fetch all administrator emails.
 *   3. Enqueue one email per admin.
 */
export const Route = createFileRoute('/api/public/notify-new-signup')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = process.env.SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!url || !key) return Response.json({ error: 'server_misconfigured' }, { status: 500 });

        let email: string;
        let locale = 'es';
        try {
          const body = await request.json();
          email = String(body?.email || '').trim().toLowerCase();
          if (body?.locale) locale = String(body.locale).toLowerCase().split('-')[0];
        } catch {
          return Response.json({ error: 'invalid_body' }, { status: 400 });
        }
        if (!email || !/.+@.+\..+/.test(email)) return Response.json({ error: 'invalid_email' }, { status: 400 });

        const admin = createClient(url, key);

        // 1. Verify the profile exists and was just created
        const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
        const { data: profile } = await admin
          .from('profiles')
          .select('id,email,full_name,created_at')
          .eq('email', email)
          .gte('created_at', tenMinAgo)
          .maybeSingle();
        if (!profile) return Response.json({ ok: false, reason: 'no_recent_profile' });

        // 2. Fetch admin emails
        const { data: adminRoles } = await admin
          .from('user_roles')
          .select('user_id')
          .eq('role', 'administrador');
        const adminIds = (adminRoles ?? []).map((r) => r.user_id);
        if (adminIds.length === 0) return Response.json({ ok: true, notified: 0 });

        const { data: adminProfiles } = await admin
          .from('profiles')
          .select('id,email,full_name')
          .in('id', adminIds);

        const { enqueueTemplateEmail } = await import('@/lib/email/internal-send.server');
        const origin = new URL(request.url).origin;
        const manageUrl = `${origin}/admin/users`;

        let notified = 0;
        for (const a of adminProfiles ?? []) {
          if (!a.email) continue;
          const res = await enqueueTemplateEmail(admin, {
            templateName: 'new-user-admin-alert',
            recipientEmail: a.email,
            idempotencyKey: `new-signup-${profile.id}-${a.id}`,
            templateData: {
              newUserEmail: profile.email,
              newUserName: profile.full_name || profile.email,
              adminName: a.full_name || '',
              manageUrl,
              locale,
            },
          });
          if (res.ok) notified++;
        }
        return Response.json({ ok: true, notified });
      },
    },
  },
});
