import { describe, it, expect, beforeEach } from 'vitest';
import {
  assertAdminOfTenant,
  countAdmins,
  validateAutoJoinDomain,
  createCooldown,
} from '@/lib/tenant-admin.guards';
import { createSupabaseMock, type MockDB } from './helpers/supabase-mock';

const TENANT_A = '00000000-0000-0000-0000-00000000000a';
const TENANT_B = '00000000-0000-0000-0000-00000000000b';
const ADMIN_A = 'admin-a';
const ADMIN_B = 'admin-b';
const PARTICIPANT_A = 'part-a';
const STRANGER = 'stranger';

function seedDb(): MockDB {
  return {
    user_clients: [
      { user_id: ADMIN_A, client_id: TENANT_A },
      { user_id: ADMIN_B, client_id: TENANT_B },
      { user_id: PARTICIPANT_A, client_id: TENANT_A },
    ],
    user_roles: [
      { user_id: ADMIN_A, client_id: TENANT_A, role: 'administrador' },
      { user_id: ADMIN_B, client_id: TENANT_B, role: 'administrador' },
      { user_id: PARTICIPANT_A, client_id: TENANT_A, role: 'participante' },
    ],
    blocked_email_domains: [
      { domain: 'gmail.com', reason: 'public' },
      { domain: 'outlook.com', reason: 'public' },
    ],
  };
}

function makeClient(opts: { actor: string; db?: MockDB; denySelectOn?: string[] }) {
  const db = opts.db ?? seedDb();
  return createSupabaseMock({
    db,
    denySelectOn: opts.denySelectOn,
    rpc: {
      has_role: ({ _user_id, _role }: any) =>
        db.user_roles.some((r) => r.user_id === _user_id && r.role === _role),
    },
  });
}

describe('assertAdminOfTenant', () => {
  it('allows the administrador who belongs to the tenant', async () => {
    const sb = makeClient({ actor: ADMIN_A });
    await expect(assertAdminOfTenant(sb, ADMIN_A, TENANT_A)).resolves.toBeUndefined();
  });

  it('rejects non-admin users (participante)', async () => {
    const sb = makeClient({ actor: PARTICIPANT_A });
    await expect(assertAdminOfTenant(sb, PARTICIPANT_A, TENANT_A)).rejects.toThrow(
      /requiere rol administrador/i,
    );
  });

  it('rejects unknown users (no role at all)', async () => {
    const sb = makeClient({ actor: STRANGER });
    await expect(assertAdminOfTenant(sb, STRANGER, TENANT_A)).rejects.toThrow(
      /requiere rol administrador/i,
    );
  });

  it('prevents cross-tenant escalation: admin of A cannot act on tenant B', async () => {
    // Admin A IS administrador globally (has_role returns true) but does NOT
    // belong to tenant B via user_clients — the second guard must reject.
    const sb = makeClient({ actor: ADMIN_A });
    await expect(assertAdminOfTenant(sb, ADMIN_A, TENANT_B)).rejects.toThrow(
      /no perteneces a este tenant/i,
    );
  });

  it('surfaces RLS permission_denied as a thrown error (defense in depth)', async () => {
    // Simulate RLS hiding user_clients rows from the caller.
    const sb = makeClient({ actor: ADMIN_A, denySelectOn: ['user_clients'] });
    await expect(assertAdminOfTenant(sb, ADMIN_A, TENANT_A)).rejects.toThrow();
  });
});

describe('countAdmins / last-admin protection', () => {
  it('counts admins of the right tenant only', async () => {
    const sb = makeClient({ actor: ADMIN_A });
    expect(await countAdmins(sb, TENANT_A)).toBe(1);
    expect(await countAdmins(sb, TENANT_B)).toBe(1);
  });

  it('excludes the target user when checking remaining admins', async () => {
    const sb = makeClient({ actor: ADMIN_A });
    // If we were to demote/remove ADMIN_A, no admin would remain in tenant A.
    expect(await countAdmins(sb, TENANT_A, ADMIN_A)).toBe(0);
  });

  it('returns >0 when another admin still remains', async () => {
    const db = seedDb();
    db.user_roles.push({ user_id: 'admin-a2', client_id: TENANT_A, role: 'administrador' });
    db.user_clients.push({ user_id: 'admin-a2', client_id: TENANT_A });
    const sb = makeClient({ actor: ADMIN_A, db });
    expect(await countAdmins(sb, TENANT_A, ADMIN_A)).toBe(1);
  });
});

describe('validateAutoJoinDomain', () => {
  it('accepts a valid corporate domain', async () => {
    const sb = makeClient({ actor: ADMIN_A });
    await expect(validateAutoJoinDomain(sb, 'acme.com', true)).resolves.toBe('acme.com');
  });

  it('normalizes case and whitespace', async () => {
    const sb = makeClient({ actor: ADMIN_A });
    await expect(validateAutoJoinDomain(sb, '  ACME.com  ', true)).resolves.toBe('acme.com');
  });

  it('rejects malformed domains', async () => {
    const sb = makeClient({ actor: ADMIN_A });
    await expect(validateAutoJoinDomain(sb, 'not a domain', true)).rejects.toThrow(/inválido/i);
  });

  it('rejects public providers from the blocklist when auto-join is enabled', async () => {
    const sb = makeClient({ actor: ADMIN_A });
    await expect(validateAutoJoinDomain(sb, 'gmail.com', true)).rejects.toThrow(
      /proveedor público/i,
    );
  });

  it('allows the same blocked domain when auto-join is OFF (only stored, not auto-joining)', async () => {
    const sb = makeClient({ actor: ADMIN_A });
    await expect(validateAutoJoinDomain(sb, 'gmail.com', false)).resolves.toBe('gmail.com');
  });

  it('returns null when no domain is provided', async () => {
    const sb = makeClient({ actor: ADMIN_A });
    await expect(validateAutoJoinDomain(sb, null, true)).resolves.toBeNull();
    await expect(validateAutoJoinDomain(sb, '   ', true)).resolves.toBeNull();
  });
});

describe('createCooldown', () => {
  let now = 0;
  const clock = () => now;
  let check: (key: string) => void;

  beforeEach(() => {
    now = 1_000_000;
    check = createCooldown(60_000, clock);
  });

  it('allows first call, blocks immediate second call', () => {
    check('pwreset:user-1');
    expect(() => check('pwreset:user-1')).toThrow(/Espera \d+s/);
  });

  it('different keys do not block each other', () => {
    check('pwreset:user-1');
    expect(() => check('pwreset:user-2')).not.toThrow();
  });

  it('allows again after the cooldown elapses', () => {
    check('pwreset:user-1');
    now += 60_001;
    expect(() => check('pwreset:user-1')).not.toThrow();
  });
});
