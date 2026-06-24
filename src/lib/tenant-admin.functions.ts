import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import {
  assertAdminOfTenant,
  countAdmins,
  validateAutoJoinDomain,
  type AppRole,
} from './tenant-admin.guards';

// ============ Tenant settings (auto-join) ============

export const updateTenantAutoJoin = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    clientId: string;
    email_domain: string | null;
    auto_join_enabled: boolean;
    auto_join_role: AppRole;
  }) => d)
  .handler(async ({ data, context }) => {
    await assertAdminOfTenant(context.supabase, context.userId, data.clientId);
    const domain = await validateAutoJoinDomain(
      context.supabase,
      data.email_domain,
      data.auto_join_enabled,
    );
    const { error } = await context.supabase
      .from('clients')
      .update({
        email_domain: domain,
        auto_join_enabled: data.auto_join_enabled,
        auto_join_role: data.auto_join_role,
      })
      .eq('id', data.clientId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ Member management (roles, password reset, email verify) ============

export type TenantMember = {
  user_id: string;
  email: string | null;
  full_name: string | null;
  role: AppRole | null;
};

export const listTenantMembers = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { clientId: string }) => d)
  .handler(async ({ data, context }): Promise<TenantMember[]> => {
    await assertAdminOfTenant(context.supabase, context.userId, data.clientId);
    const { data: rows, error } = await context.supabase
      .from('user_clients')
      .select('user_id')
      .eq('client_id', data.clientId);
    if (error) throw new Error(error.message);
    const ids = (rows ?? []).map((r: any) => r.user_id);
    if (ids.length === 0) return [];
    const [{ data: profs }, { data: roles }] = await Promise.all([
      context.supabase.from('profiles').select('id, email, full_name').in('id', ids),
      context.supabase
        .from('user_roles')
        .select('user_id, role')
        .in('user_id', ids)
        .eq('client_id', data.clientId),
    ]);
    const profById: Record<string, { email: string | null; full_name: string | null }> = Object.fromEntries(
      (profs ?? []).map((p: any) => [p.id, { email: p.email, full_name: p.full_name }]),
    );
    const roleById: Record<string, AppRole> = Object.fromEntries(
      (roles ?? []).map((r: any) => [r.user_id, r.role as AppRole]),
    );
    return ids.map((id) => ({
      user_id: id,
      email: profById[id]?.email ?? null,
      full_name: profById[id]?.full_name ?? null,
      role: roleById[id] ?? null,
    }));
  });


export const setUserRoleInTenant = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { clientId: string; userId: string; role: AppRole }) => d)
  .handler(async ({ data, context }) => {
    await assertAdminOfTenant(context.supabase, context.userId, data.clientId);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');

    // Verify user belongs to tenant
    const { data: belongs } = await supabaseAdmin
      .from('user_clients').select('user_id')
      .eq('user_id', data.userId).eq('client_id', data.clientId).maybeSingle();
    if (!belongs) throw new Error('Ese usuario no pertenece a este tenant');

    // Guard: don't leave tenant without admins
    if (data.role !== 'administrador') {
      const remaining = await countAdmins(supabaseAdmin, data.clientId, data.userId);
      if (remaining === 0) throw new Error('No puedes dejar el tenant sin administradores');
    }

    const { error: delErr } = await supabaseAdmin
      .from('user_roles')
      .delete()
      .eq('user_id', data.userId)
      .eq('client_id', data.clientId);
    if (delErr) throw new Error(delErr.message);

    const { error: insErr } = await supabaseAdmin
      .from('user_roles')
      .insert({ user_id: data.userId, role: data.role, client_id: data.clientId });
    if (insErr) throw new Error(insErr.message);

    return { ok: true };
  });

export const removeUserFromTenant = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { clientId: string; userId: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdminOfTenant(context.supabase, context.userId, data.clientId);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');

    // If target is admin, ensure another admin remains
    const { data: targetRoles } = await supabaseAdmin
      .from('user_roles').select('role')
      .eq('user_id', data.userId).eq('client_id', data.clientId);
    const isTargetAdmin = (targetRoles ?? []).some((r: any) => r.role === 'administrador');
    if (isTargetAdmin) {
      const remaining = await countAdmins(supabaseAdmin, data.clientId, data.userId);
      if (remaining === 0) throw new Error('No puedes expulsar al último administrador del tenant');
    }

    await supabaseAdmin.from('user_roles').delete()
      .eq('user_id', data.userId).eq('client_id', data.clientId);
    await supabaseAdmin.from('user_clients').delete()
      .eq('user_id', data.userId).eq('client_id', data.clientId);

    return { ok: true };
  });

// Simple in-memory cooldown to throttle password reset & email verify per user.
const _resetCooldown = new Map<string, number>();
function checkCooldown(key: string, ms = 60_000) {
  const now = Date.now();
  const prev = _resetCooldown.get(key) ?? 0;
  if (now - prev < ms) {
    const wait = Math.ceil((ms - (now - prev)) / 1000);
    throw new Error(`Espera ${wait}s antes de reintentar`);
  }
  _resetCooldown.set(key, now);
}

export const sendPasswordResetForUser = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { clientId: string; userId: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdminOfTenant(context.supabase, context.userId, data.clientId);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');

    const { data: belongs } = await supabaseAdmin
      .from('user_clients').select('user_id')
      .eq('user_id', data.userId).eq('client_id', data.clientId).maybeSingle();
    if (!belongs) throw new Error('Ese usuario no pertenece a este tenant');

    const { data: prof } = await supabaseAdmin
      .from('profiles').select('email').eq('id', data.userId).maybeSingle();
    const email = prof?.email;
    if (!email) throw new Error('El usuario no tiene email registrado');

    checkCooldown(`pwreset:${data.userId}`);

    const origin = process.env.PUBLISHED_SITE_ORIGIN || 'https://bpm-atlas.com';
    const { data: linkData, error: linkErr } = await (supabaseAdmin as any).auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo: `${origin}/reset-password` },
    });
    if (linkErr) throw new Error(linkErr.message);
    const actionLink = (linkData as any)?.properties?.action_link
      || (linkData as any)?.action_link
      || `${origin}/reset-password`;

    const { enqueueTemplateEmail } = await import('@/lib/email/internal-send.server');
    await enqueueTemplateEmail(supabaseAdmin, {
      templateName: 'password-reset-admin',
      recipientEmail: email,
      idempotencyKey: `pwreset-${data.userId}-${Date.now()}`,
      templateData: { resetUrl: actionLink },
    });
    return { ok: true };
  });

export const resendEmailVerification = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { clientId: string; userId: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdminOfTenant(context.supabase, context.userId, data.clientId);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');

    const { data: belongs } = await supabaseAdmin
      .from('user_clients').select('user_id')
      .eq('user_id', data.userId).eq('client_id', data.clientId).maybeSingle();
    if (!belongs) throw new Error('Ese usuario no pertenece a este tenant');

    const { data: userRes, error: userErr } = await (supabaseAdmin as any).auth.admin.getUserById(data.userId);
    if (userErr) throw new Error(userErr.message);
    const email = userRes?.user?.email;
    if (!email) throw new Error('El usuario no tiene email');
    if (userRes?.user?.email_confirmed_at) {
      return { ok: true, alreadyVerified: true };
    }

    checkCooldown(`verify:${data.userId}`);

    const origin = process.env.PUBLISHED_SITE_ORIGIN || 'https://bpm-atlas.com';
    const { error: linkErr } = await (supabaseAdmin as any).auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: { redirectTo: `${origin}/dashboard` },
    });
    if (linkErr) throw new Error(linkErr.message);
    // generateLink in Supabase auto-sends the email when SMTP/hooks are configured.
    return { ok: true };
  });

export const listTenantAuditLog = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { clientId: string; limit?: number }) => d)
  .handler(async ({ data, context }) => {
    await assertAdminOfTenant(context.supabase, context.userId, data.clientId);
    const limit = Math.min(Math.max(data.limit ?? 50, 1), 200);
    const { data: rows, error } = await context.supabase
      .from('change_log')
      .select('id, actor_id, entity_table, entity_id, action, created_at')
      .in('entity_table', ['clients', 'user_roles', 'user_clients', 'tenant_invitations', 'tenant_join_requests'])
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });


// ============ Tenant invitations ============

export const listTenantInvitations = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { clientId: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdminOfTenant(context.supabase, context.userId, data.clientId);
    const { data: rows, error } = await context.supabase
      .from('tenant_invitations')
      .select('id, email, role, expires_at, accepted_at, revoked_at, created_at')
      .eq('client_id', data.clientId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const createTenantInvitation = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { clientId: string; email: string; role: AppRole }) => d)
  .handler(async ({ data, context }) => {
    await assertAdminOfTenant(context.supabase, context.userId, data.clientId);
    const email = data.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Email inválido');

    // generate token
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const token = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');

    // Load tenant name + inviter name
    const [{ data: tenant }, { data: inviterProfile }] = await Promise.all([
      context.supabase.from('clients').select('name').eq('id', data.clientId).maybeSingle(),
      context.supabase.from('profiles').select('full_name, email').eq('id', context.userId).maybeSingle(),
    ]);

    // Insert invitation via admin (writes through RLS would also work — admin used for consistency)
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { error: insErr } = await supabaseAdmin
      .from('tenant_invitations')
      .insert({
        client_id: data.clientId,
        email,
        role: data.role,
        token,
        invited_by: context.userId,
      });
    if (insErr) throw new Error(insErr.message);

    // Send email
    const origin = process.env.PUBLISHED_SITE_ORIGIN || 'https://bpm-atlas.com';
    const acceptUrl = `${origin}/invite/accept?token=${token}`;

    const { enqueueTemplateEmail } = await import('@/lib/email/internal-send.server');
    await enqueueTemplateEmail(supabaseAdmin, {
      templateName: 'tenant-invitation',
      recipientEmail: email,
      idempotencyKey: `invite-${token}`,
      templateData: {
        inviterName: inviterProfile?.full_name || inviterProfile?.email || 'Un compañero',
        tenantName: tenant?.name || 'el workspace',
        role: data.role,
        acceptUrl,
      },
    });

    return { ok: true };
  });

export const revokeTenantInvitation = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { clientId: string; invitationId: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdminOfTenant(context.supabase, context.userId, data.clientId);
    const { error } = await context.supabase
      .from('tenant_invitations')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', data.invitationId)
      .eq('client_id', data.clientId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ Join requests ============

export const listJoinRequests = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { clientId: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdminOfTenant(context.supabase, context.userId, data.clientId);
    const { data: rows, error } = await context.supabase
      .from('tenant_join_requests')
      .select('id, user_id, email, status, created_at, resolved_at')
      .eq('client_id', data.clientId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const resolveJoinRequest = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { clientId: string; requestId: string; approve: boolean; role?: AppRole }) => d)
  .handler(async ({ data, context }) => {
    await assertAdminOfTenant(context.supabase, context.userId, data.clientId);

    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { data: req } = await supabaseAdmin
      .from('tenant_join_requests')
      .select('id, user_id, client_id, status')
      .eq('id', data.requestId)
      .eq('client_id', data.clientId)
      .maybeSingle();
    if (!req) throw new Error('Solicitud no encontrada');
    if (req.status !== 'pending') throw new Error('Solicitud ya resuelta');

    if (data.approve) {
      // join + role
      const { error: ucErr } = await supabaseAdmin
        .from('user_clients')
        .insert({ user_id: req.user_id, client_id: req.client_id });
      if (ucErr && !ucErr.message.includes('duplicate')) throw new Error(ucErr.message);

      const role = data.role || 'participante';
      const { error: rErr } = await supabaseAdmin
        .from('user_roles')
        .insert({ user_id: req.user_id, role, client_id: req.client_id });
      if (rErr && !rErr.message.includes('duplicate')) throw new Error(rErr.message);
    }

    const { error: upErr } = await supabaseAdmin
      .from('tenant_join_requests')
      .update({
        status: data.approve ? 'approved' : 'rejected',
        resolved_at: new Date().toISOString(),
        resolved_by: context.userId,
      })
      .eq('id', req.id);
    if (upErr) throw new Error(upErr.message);

    return { ok: true };
  });
