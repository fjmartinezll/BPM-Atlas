import { createFileRoute } from '@tanstack/react-router';
import { createClient } from '@supabase/supabase-js';

/**
 * Validate that an email address is likely deliverable and not from a blocked
 * (disposable) domain.
 * Returns { valid: boolean, reason?: string }.
 */
export const Route = createFileRoute('/api/public/validate-email')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let email = '';
        try {
          const body = await request.json();
          email = String(body?.email || '').trim().toLowerCase();
        } catch {
          return Response.json({ valid: false, reason: 'invalid_body' }, { status: 400 });
        }
        const match = email.match(/^[^\s@]+@([^\s@]+\.[^\s@]+)$/);
        if (!match) return Response.json({ valid: false, reason: 'invalid_format' });
        const domain = match[1];

        // Blocked-domain check (disposable inboxes)
        const url = process.env.SUPABASE_URL;
        const key = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (url && key) {
          try {
            const sb = createClient(url, key, {
              auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
            });
            const { data: blocked } = await sb
              .from('blocked_email_domains')
              .select('domain')
              .eq('domain', domain)
              .maybeSingle();
            if (blocked) return Response.json({ valid: false, reason: 'disposable_domain' });
          } catch {
            // non-fatal: continue with DNS check
          }
        }

        async function dohQuery(type: 'MX' | 'A' | 'AAAA'): Promise<boolean> {
          try {
            const res = await fetch(
              `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=${type}`,
              { headers: { accept: 'application/dns-json' } },
            );
            if (!res.ok) return false;
            const json: any = await res.json();
            return Array.isArray(json?.Answer) && json.Answer.some((a: any) => a?.type);
          } catch {
            return false;
          }
        }

        const hasMx = await dohQuery('MX');
        if (hasMx) return Response.json({ valid: true });
        const hasA = (await dohQuery('A')) || (await dohQuery('AAAA'));
        if (hasA) return Response.json({ valid: true });
        return Response.json({ valid: false, reason: 'no_mx' });
      },
    },
  },
});
