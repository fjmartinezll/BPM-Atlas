import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Tablas a exportar/importar en orden de dependencias FK.
// Catálogos primero (referenciados por estructura BPM).
export const BACKUP_TABLES = [
  // Catálogos / taxonomía
  "node_categories",
  "node_kinds",
  "node_types",
  "node_subtypes",
  "entity_field_catalog",
  // Estructura BPM
  "clients",
  "entities",
  "macroprocesses",
  "processes",
  "subprocesses",
  "tasks",
  "process_diagrams",
  "entity_positions",
  "entity_process_links",
] as const;

export type BackupTable = (typeof BACKUP_TABLES)[number];

export type BackupPayload = {
  version: 1;
  exported_at: string;
  tables: Record<string, Array<Record<string, any>>>;
};

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data: isAdmin } = await ctx.supabase.rpc("has_role", {
    _user_id: ctx.userId,
    _role: "administrador",
  });
  if (!isAdmin) throw new Error("Solo administradores");
}

export const exportAllData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const tables: Record<string, Array<Record<string, any>>> = {};
    for (const t of BACKUP_TABLES) {
      const { data, error } = await (supabaseAdmin as any).from(t).select("*");
      if (error) throw new Error(`Error exportando ${t}: ${error.message}`);
      tables[t] = (data ?? []) as Array<Record<string, any>>;
    }
    const payload: BackupPayload = {
      version: 1,
      exported_at: new Date().toISOString(),
      tables,
    };
    return payload as any;
  });

const payloadSchema = z.object({
  version: z.literal(1),
  exported_at: z.string().optional(),
  tables: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))),
});

export type ImportResult = {
  table: BackupTable;
  inserted: number;
  errors: string[];
};

export const importAllData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ payload: payloadSchema }).parse(d))
  .handler(async ({ data, context }): Promise<ImportResult[]> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const results: ImportResult[] = [];
    const BATCH = 500;

    for (const t of BACKUP_TABLES) {
      const rows = (data.payload.tables[t] ?? []) as Record<string, unknown>[];
      const res: ImportResult = { table: t, inserted: 0, errors: [] };
      if (rows.length === 0) {
        results.push(res);
        continue;
      }
      for (let i = 0; i < rows.length; i += BATCH) {
        const chunk = rows.slice(i, i + BATCH);
        const { error, count } = await supabaseAdmin
          .from(t as any)
          .upsert(chunk as any, { onConflict: "id", count: "exact" });
        if (error) {
          res.errors.push(error.message);
        } else {
          res.inserted += count ?? chunk.length;
        }
      }
      results.push(res);
    }
    return results;
  });
