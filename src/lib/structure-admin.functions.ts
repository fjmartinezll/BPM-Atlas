import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertTenantAccess } from "@/lib/tenant-admin.guards";

export type TenantRow = { id: string; name: string; code: string | null };
export type EntityRow = { id: string; name: string; client_id: string | null; environment: string | null };
export type DiagramRow = {
  id: string;
  name: string;
  diagram_type: string;
  level: string;
  node_id: string;
  entity_id: string | null;
  client_id: string | null;
  environment: string | null;
  updated_at: string;
};

async function assertAdmin(supabase: any, userId: string) {
  const { data: isAdmin } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: "administrador",
  });
  if (!isAdmin) throw new Error("Solo administradores");
}

async function resolveMyTenantId(supabase: any, userId: string): Promise<string> {
  const { data, error } = await supabase
    .from("user_clients")
    .select("client_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.client_id) throw new Error("Sin tenant asignado");
  return data.client_id as string;
}

export const listStructure = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [tenantsRes, entitiesRes, diagramsRes] = await Promise.all([
      supabaseAdmin.from("clients").select("id, name, code").order("name"),
      supabaseAdmin.from("entities").select("id, name, client_id, environment").order("name"),
      supabaseAdmin
        .from("process_diagrams")
        .select("id, name, diagram_type, level, node_id, entity_id, client_id, environment, updated_at")
        .order("updated_at", { ascending: false }),
    ]);
    if (tenantsRes.error) throw new Error(tenantsRes.error.message);
    if (entitiesRes.error) throw new Error(entitiesRes.error.message);
    if (diagramsRes.error) throw new Error(diagramsRes.error.message);

    return {
      tenants: (tenantsRes.data ?? []) as TenantRow[],
      entities: (entitiesRes.data ?? []) as EntityRow[],
      diagrams: (diagramsRes.data ?? []) as DiagramRow[],
    };
  });

const migrateSchema = z.object({
  diagramId: z.string().uuid(),
  clientId: z.string().uuid(),
  entityId: z.string().uuid().nullable(),
  environment: z.enum(["produccion", "pruebas"]),
});

export const migrateDiagram = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => migrateSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    await assertTenantAccess(supabase, userId, data.clientId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error } = await supabaseAdmin
      .from("process_diagrams")
      .update({
        client_id: data.clientId,
        entity_id: data.entityId,
        environment: data.environment,
      })
      .eq("id", data.diagramId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const idSchema = z.object({ id: z.string().uuid() });

function friendlyDeleteError(msg: string, kind: string) {
  if (/foreign key|violates|referenced/i.test(msg)) {
    return `No se puede eliminar este ${kind}: tiene elementos dependientes.`;
  }
  return msg;
}

export const deleteTenant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => idSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const myTenantId = await resolveMyTenantId(supabase, userId);
    if (data.id !== myTenantId) throw new Error("Solo puedes eliminar tu propio tenant.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("clients").delete().eq("id", data.id);
    if (error) throw new Error(friendlyDeleteError(error.message, "tenant"));
    return { ok: true };
  });

export const deleteEntity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => idSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const myTenantId = await resolveMyTenantId(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: entity } = await supabaseAdmin
      .from("entities").select("client_id").eq("id", data.id).maybeSingle();
    if (!entity) throw new Error("Entidad no encontrada");
    if (entity.client_id !== myTenantId) throw new Error("La entidad no pertenece a tu tenant.");
    const { error } = await supabaseAdmin.from("entities").delete().eq("id", data.id);
    if (error) throw new Error(friendlyDeleteError(error.message, "entidad"));
    return { ok: true };
  });

export const deleteDiagram = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => idSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const myTenantId = await resolveMyTenantId(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: diagram } = await supabaseAdmin
      .from("process_diagrams").select("client_id").eq("id", data.id).maybeSingle();
    if (!diagram) throw new Error("Diagrama no encontrado");
    if (diagram.client_id !== myTenantId) throw new Error("El diagrama no pertenece a tu tenant.");
    const { error } = await supabaseAdmin.from("process_diagrams").delete().eq("id", data.id);
    if (error) throw new Error(friendlyDeleteError(error.message, "diagrama"));
    return { ok: true };
  });

export const deleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => idSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    if (data.id === userId) throw new Error("No puedes eliminar tu propio usuario.");
    const myTenantId = await resolveMyTenantId(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Verify the target user belongs to the same tenant
    const { data: uc } = await supabaseAdmin
      .from("user_clients")
      .select("client_id")
      .eq("user_id", data.id)
      .maybeSingle();
    if (uc && uc.client_id !== myTenantId) {
      throw new Error("Ese usuario no pertenece a tu tenant.");
    }

    const [{ count: roleCount }, { count: clientCount }] = await Promise.all([
      supabaseAdmin.from("user_roles").select("*", { count: "exact", head: true }).eq("user_id", data.id),
      supabaseAdmin.from("user_clients").select("*", { count: "exact", head: true }).eq("user_id", data.id),
    ]);
    if ((roleCount ?? 0) > 0 || (clientCount ?? 0) > 0) {
      throw new Error("No se puede eliminar: el usuario tiene roles o tenants asignados.");
    }

    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.id);
    if (error) throw new Error(friendlyDeleteError(error.message, "usuario"));
    return { ok: true };
  });
