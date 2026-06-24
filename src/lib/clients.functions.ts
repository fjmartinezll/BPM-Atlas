import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ClientRow = {
  id: string;
  name: string;
  code: string | null;
  notes: string | null;
  active: boolean;
};

export type UserClientRow = {
  user_id: string;
  client_id: string;
  email: string | null;
  full_name: string | null;
  client_name: string;
};

/** Devuelve el tenant del usuario actual (0 o 1 elementos). */
export const listMyClients = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ClientRow[]> => {
    const { supabase, userId } = context;
    // Resolver el tenant asignado al usuario vía user_clients, no por la primera
    // fila visible en `clients` (los admins ven todos los tenants por RLS).
    const { data: uc, error: ucErr } = await (supabase as any)
      .from("user_clients")
      .select("client_id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();
    if (ucErr) throw new Error(ucErr.message);
    if (!uc?.client_id) return [];
    const { data, error } = await supabase
      .from("clients")
      .select("id, name, code, notes, active")
      .eq("id", uc.client_id)
      .limit(1);
    if (error) throw new Error(error.message);
    return (data ?? []) as ClientRow[];
  });

/** Compat: devuelve únicamente el tenant del admin que llama. */
export const listAllClients = listMyClients;

/** Resuelve el tenant del usuario actual (lanza si no existe). */
async function resolveMyTenantId(
  supabase: ReturnType<typeof Object>,
  userId: string,
): Promise<string> {
  const { data, error } = await (supabase as any)
    .from("user_clients")
    .select("client_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.client_id) throw new Error("Sin tenant asignado");
  return data.client_id as string;
}

const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1),
  code: z.string().min(1).max(40).nullable().optional(),
  notes: z.string().nullable().optional(),
  active: z.boolean().optional(),
});

/** Solo permite editar el tenant propio. No permite crear nuevos tenants. */
export const upsertClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => upsertSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "administrador",
    });
    if (!isAdmin) throw new Error("Solo administradores");

    const myTenantId = await resolveMyTenantId(supabase, userId);
    if (!data.id || data.id !== myTenantId) {
      throw new Error("Solo puedes editar tu propio tenant.");
    }

    const payload = {
      name: data.name,
      code: data.code ?? null,
      notes: data.notes ?? null,
      active: data.active ?? true,
    };
    const { data: row, error } = await supabase
      .from("clients")
      .update(payload)
      .eq("id", myTenantId)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

/** Lista usuarios del tenant del admin actual. `clientId` debe coincidir con su tenant. */
export const listClientUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ clientId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "administrador",
    });
    if (!isAdmin) throw new Error("Solo administradores");
    const myTenantId = await resolveMyTenantId(supabase, userId);
    if (data.clientId !== myTenantId) throw new Error("Tenant no accesible.");

    const { data: rows, error } = await supabase
      .from("user_clients")
      .select("user_id, client_id")
      .eq("client_id", myTenantId);
    if (error) throw new Error(error.message);
    const ids = (rows ?? []).map((r) => r.user_id);
    let profilesById: Record<string, { email: string | null; full_name: string | null }> = {};
    if (ids.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, email, full_name")
        .in("id", ids);
      profilesById = Object.fromEntries(
        (profs ?? []).map((p) => [p.id, { email: p.email, full_name: p.full_name }]),
      );
    }
    return (rows ?? []).map((r) => ({
      user_id: r.user_id,
      client_id: r.client_id,
      email: profilesById[r.user_id]?.email ?? null,
      full_name: profilesById[r.user_id]?.full_name ?? null,
    }));
  });

/** Lista perfiles candidatos para asignar al tenant del admin actual. */
export const listAllProfiles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "administrador",
    });
    if (!isAdmin) throw new Error("Solo administradores");
    const { data, error } = await supabase
      .from("profiles")
      .select("id, email, full_name")
      .order("email");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const assignUserToClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ userId: z.string().uuid(), clientId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "administrador",
    });
    if (!isAdmin) throw new Error("Solo administradores");
    const myTenantId = await resolveMyTenantId(supabase, userId);
    if (data.clientId !== myTenantId) throw new Error("Tenant no accesible.");

    // Multi-tenant estricto: cada usuario sólo en un tenant.
    const { data: existing } = await supabase
      .from("user_clients")
      .select("client_id")
      .eq("user_id", data.userId)
      .limit(1)
      .maybeSingle();
    if (existing && existing.client_id !== myTenantId) {
      throw new Error("El usuario ya pertenece a otro tenant.");
    }

    const { error } = await supabase
      .from("user_clients")
      .insert({ user_id: data.userId, client_id: myTenantId });
    if (error && !error.message.includes("duplicate")) throw new Error(error.message);
    return { ok: true };
  });

export const unassignUserFromClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ userId: z.string().uuid(), clientId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "administrador",
    });
    if (!isAdmin) throw new Error("Solo administradores");
    const myTenantId = await resolveMyTenantId(supabase, userId);
    if (data.clientId !== myTenantId) throw new Error("Tenant no accesible.");

    const { error } = await supabase
      .from("user_clients")
      .delete()
      .eq("user_id", data.userId)
      .eq("client_id", myTenantId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
