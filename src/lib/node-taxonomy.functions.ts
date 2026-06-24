import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function ensureAdmin(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "administrador" });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Solo administradores");
}

const duplicateTypeMessage = "Ya existe un tipo con ese nombre para este nodo";
const duplicateSubtypeMessage = "Ya existe un subtipo con ese nombre para este tipo";

export const listTaxonomy = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const [cats, kinds, types, subtypes] = await Promise.all([
      supabase.from("node_categories").select("*").order("name"),
      supabase.from("node_kinds").select("*").order("name"),
      supabase.from("node_types").select("*").order("name"),
      supabase.from("node_subtypes").select("*").order("name"),
    ]);
    for (const r of [cats, kinds, types, subtypes]) if (r.error) throw new Error(r.error.message);
    return {
      categories: cats.data ?? [],
      kinds: kinds.data ?? [],
      types: types.data ?? [],
      subtypes: subtypes.data ?? [],
    };
  });

const typeSchema = z.object({
  id: z.string().uuid().optional(),
  kindId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  description: z.string().max(2000).optional().nullable(),
});

export const upsertNodeType = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => typeSchema.parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const payload = { kind_id: data.kindId, name: data.name, description: data.description ?? null };
    let duplicateQuery = context.supabase
      .from("node_types")
      .select("id")
      .eq("kind_id", data.kindId)
      .eq("name", data.name)
      .limit(1);
    if (data.id) duplicateQuery = duplicateQuery.neq("id", data.id);
    const { data: duplicate, error: duplicateError } = await duplicateQuery.maybeSingle();
    if (duplicateError) throw new Error(duplicateError.message);
    if (duplicate) return { ok: false, message: duplicateTypeMessage, id: duplicate.id };
    if (data.id) {
      const { error } = await context.supabase.from("node_types").update(payload).eq("id", data.id);
      if (error) return error.message.includes("node_types_kind_id_name_key") ? { ok: false, message: duplicateTypeMessage } : Promise.reject(new Error(error.message));
      return { ok: true, id: data.id };
    }
    const { data: row, error } = await context.supabase.from("node_types").insert(payload).select("id").single();
    if (error) return error.message.includes("node_types_kind_id_name_key") ? { ok: false, message: duplicateTypeMessage } : Promise.reject(new Error(error.message));
    return { ok: true, id: row!.id };
  });

export const deleteNodeType = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const { error } = await context.supabase.from("node_types").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const subtypeSchema = z.object({
  id: z.string().uuid().optional(),
  typeId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  description: z.string().max(2000).optional().nullable(),
});

export const upsertNodeSubtype = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => subtypeSchema.parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const payload = { type_id: data.typeId, name: data.name, description: data.description ?? null };
    let duplicateQuery = context.supabase
      .from("node_subtypes")
      .select("id")
      .eq("type_id", data.typeId)
      .eq("name", data.name)
      .limit(1);
    if (data.id) duplicateQuery = duplicateQuery.neq("id", data.id);
    const { data: duplicate, error: duplicateError } = await duplicateQuery.maybeSingle();
    if (duplicateError) throw new Error(duplicateError.message);
    if (duplicate) return { ok: false, message: duplicateSubtypeMessage, id: duplicate.id };
    if (data.id) {
      const { error } = await context.supabase.from("node_subtypes").update(payload).eq("id", data.id);
      if (error) return error.message.includes("node_subtypes_type_id_name_key") ? { ok: false, message: duplicateSubtypeMessage } : Promise.reject(new Error(error.message));
      return { ok: true, id: data.id };
    }
    const { data: row, error } = await context.supabase.from("node_subtypes").insert(payload).select("id").single();
    if (error) return error.message.includes("node_subtypes_type_id_name_key") ? { ok: false, message: duplicateSubtypeMessage } : Promise.reject(new Error(error.message));
    return { ok: true, id: row!.id };
  });

export const deleteNodeSubtype = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const { error } = await context.supabase.from("node_subtypes").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
