// Pure helpers extracted from tenant-admin.functions.ts so they can be
// unit-tested without the TanStack Start / Supabase runtime.
//
// All functions take a "supabase-like" object as input. In tests we pass a
// hand-rolled mock; at runtime the real supabase client is injected.

export type AppRole = 'administrador' | 'dueno_proceso' | 'participante' | 'auditor';

export type SupabaseLike = any;

/**
 * Throws unless `userId` has the `administrador` role AND belongs to `clientId`.
 * Mirrors the runtime guard used by every admin server function.
 */
export async function assertAdminOfTenant(
  supabase: SupabaseLike,
  userId: string,
  clientId: string,
): Promise<void> {
  const [{ data: isAdmin }, { data: belongs }] = await Promise.all([
    supabase.rpc('has_role', { _user_id: userId, _role: 'administrador' }),
    supabase
      .from('user_clients')
      .select('client_id')
      .eq('user_id', userId)
      .eq('client_id', clientId)
      .maybeSingle(),
  ]);
  if (!isAdmin) throw new Error('Forbidden: requiere rol administrador');
  if (!belongs) throw new Error('Forbidden: no perteneces a este tenant');
}

/**
 * Throws unless `userId` belongs to `clientId`.
 * Usable for server functions that need to verify tenant access
 * without requiring admin role (e.g., entity-fields, engine listings).
 */
export async function assertTenantAccess(
  supabase: SupabaseLike,
  userId: string,
  clientId: string,
): Promise<void> {
  const { data: ok, error } = await supabase.rpc('assert_tenant_access', {
    _user_id: userId,
    _client_id: clientId,
  });
  if (error) throw new Error(error.message);
  if (!ok) throw new Error('No tienes acceso a este tenant');
}

/**
 * Returns true if the user has the given role within a specific tenant.
 */
export async function hasRoleInTenant(
  supabase: SupabaseLike,
  userId: string,
  role: AppRole,
  clientId: string,
): Promise<boolean> {
  const { data } = await supabase.rpc('has_role_in_tenant', {
    _user_id: userId,
    _role: role,
    _client_id: clientId,
  });
  return !!data;
}

/** Count administradores in a tenant, optionally excluding one user. */
export async function countAdmins(
  supabaseAdmin: SupabaseLike,
  clientId: string,
  excludeUserId?: string,
): Promise<number> {
  let q = supabaseAdmin
    .from('user_roles')
    .select('user_id', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .eq('role', 'administrador');
  if (excludeUserId) q = q.neq('user_id', excludeUserId);
  const { count, error } = await q;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

const DOMAIN_RE = /^[a-z0-9.-]+\.[a-z]{2,}$/i;

/**
 * Validates the email_domain + auto_join_enabled combination.
 * Throws on invalid format or when the domain is blocked.
 */
export async function validateAutoJoinDomain(
  supabase: SupabaseLike,
  rawDomain: string | null,
  autoJoinEnabled: boolean,
): Promise<string | null> {
  const domain = rawDomain?.trim().toLowerCase() || null;
  if (domain && !DOMAIN_RE.test(domain)) {
    throw new Error('Dominio inválido');
  }
  if (domain && autoJoinEnabled) {
    const { data: blocked } = await supabase
      .from('blocked_email_domains')
      .select('domain')
      .eq('domain', domain)
      .maybeSingle();
    if (blocked) {
      throw new Error(
        `El dominio ${domain} es un proveedor público y no se permite para auto-unión`,
      );
    }
  }
  return domain;
}

/** Factory so each test gets its own clock. */
export function createCooldown(ms = 60_000, now: () => number = Date.now) {
  const store = new Map<string, number>();
  return function check(key: string) {
    const t = now();
    const prev = store.get(key) ?? 0;
    if (t - prev < ms) {
      const wait = Math.ceil((ms - (t - prev)) / 1000);
      throw new Error(`Espera ${wait}s antes de reintentar`);
    }
    store.set(key, t);
  };
}
