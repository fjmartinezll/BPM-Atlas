import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ALLOWED_TABLES = new Set([
  "macroprocesses", "processes", "subprocesses", "executable_elements",
  "subprocess_elements", "executable_element_integrations",
  "entities", "entity_process_links",
  "process_diagrams", "process_indicators", "process_risks", "process_documents",
  "profiles", "user_roles", "change_log",
]);

export type ColumnInfo = {
  name: string;
  data_type: string;
  udt_name: string;
  is_nullable: boolean;
  column_default: string | null;
  is_identity: boolean;
  is_primary_key: boolean;
};

export const getTableColumns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { table: string }) => {
    if (!ALLOWED_TABLES.has(d.table)) throw new Error("Invalid table");
    return d;
  })
  .handler(async ({ data, context }): Promise<{ columns: ColumnInfo[] }> => {
    const { data: cols, error } = await (context.supabase.rpc as any)("admin_get_columns", { _table: data.table });
    if (error) throw new Error(error.message);
    return { columns: (cols ?? []) as ColumnInfo[] };
  });

export type TableStat = {
  table_name: string;
  row_estimate: number;
  total_bytes: number;
  total_size: string;
};

export const getTableStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ stats: TableStat[] }> => {
    const { data, error } = await (context.supabase.rpc as any)("admin_table_stats");
    if (error) throw new Error(error.message);
    return { stats: (data ?? []) as TableStat[] };
  });

export type SqlResult = { columns: string[]; rows: any[] };

export const runReadOnlySql = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { sql: string }) => {
    if (typeof d.sql !== "string" || !d.sql.trim()) throw new Error("Query vacía");
    if (d.sql.length > 5000) throw new Error("Query demasiado larga");
    const lowered = d.sql.trim().toLowerCase();
    if (!lowered.startsWith("select") && !lowered.startsWith("with")) {
      throw new Error("Solo se permiten consultas SELECT o WITH");
    }
    return d;
  })
  .handler(async ({ data, context }): Promise<SqlResult> => {
    const { data: rows, error } = await (context.supabase.rpc as any)("admin_run_select", { _sql: data.sql });
    if (error) throw new Error(error.message);
    const arr = (rows ?? []) as any[];
    const columns = arr.length ? Object.keys(arr[0]) : [];
    return { columns, rows: arr };
  });

