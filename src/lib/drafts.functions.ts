import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };
type JsonObject = { [k: string]: JsonValue };

const idSchema = z.object({ definitionId: z.string().uuid() });
const saveSchema = z.object({
  definitionId: z.string().uuid(),
  values: z.record(z.string(), z.any()),
});

export const getStartDraft = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => idSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ values: JsonObject; updatedAt: string } | null> => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("instance_start_drafts")
      .select("values, updated_at")
      .eq("user_id", userId)
      .eq("definition_id", data.definitionId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row
      ? { values: (row.values ?? {}) as JsonObject, updatedAt: row.updated_at as string }
      : null;
  });

export const saveStartDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => saveSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("instance_start_drafts")
      .upsert(
        {
          user_id: userId,
          definition_id: data.definitionId,
          values: data.values as unknown as JsonObject,
        },
        { onConflict: "user_id,definition_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteStartDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => idSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("instance_start_drafts")
      .delete()
      .eq("user_id", userId)
      .eq("definition_id", data.definitionId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listMyDrafts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Array<{ definitionId: string; updatedAt: string }>> => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("instance_start_drafts")
      .select("definition_id, updated_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({
      definitionId: r.definition_id as string,
      updatedAt: r.updated_at as string,
    }));
  });
