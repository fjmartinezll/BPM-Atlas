import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

/**
 * Notify a user that their roles were updated by an administrator.
 * Caller must be authenticated AND have the 'administrador' role.
 */
export const notifyUserRolesChanged = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string; changeSummary?: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId: callerId } = context;

    // Authorize: caller must be admin
    const { data: isAdmin } = await supabase.rpc('has_role', {
      _user_id: callerId,
      _role: 'administrador',
    });
    if (!isAdmin) throw new Error('Forbidden');

    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { enqueueTemplateEmail } = await import('@/lib/email/internal-send.server');

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('id,email,full_name')
      .eq('id', data.userId)
      .maybeSingle();
    if (!profile?.email) return { ok: false, reason: 'no_profile' };

    const { data: roleRows } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', data.userId);
    const roles = (roleRows ?? []).map((r) => r.role);

    // Pull recipient locale from auth user metadata (set at signup)
    let locale = 'es';
    try {
      const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(data.userId);
      const metaLocale = (authUser?.user?.user_metadata as any)?.locale;
      if (metaLocale) locale = String(metaLocale).toLowerCase().split('-')[0];
    } catch {
      /* ignore — fallback to es */
    }

    const appUrl = process.env.APP_BASE_URL || 'https://bpm-atlas.com';
    const res = await enqueueTemplateEmail(supabaseAdmin, {
      templateName: 'role-assigned-user',
      recipientEmail: profile.email,
      idempotencyKey: `role-change-${data.userId}-${Date.now()}`,
      templateData: {
        userName: profile.full_name || '',
        roles,
        changeSummary: data.changeSummary,
        appUrl,
        locale,
      },
    });
    return res;
  });
