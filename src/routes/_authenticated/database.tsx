import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { getTableColumns, getTableStats, runReadOnlySql, type ColumnInfo, type TableStat, type SqlResult } from "@/lib/db-admin.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Pencil, Trash2, Plus, RefreshCw, Info, Play, Database } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DbSchemaDiagram } from "@/components/db-schema-diagram";

const TABLES = [
  "macroprocesses", "processes", "subprocesses", "executable_elements",
  "subprocess_elements", "executable_element_integrations",
  "entities", "entity_process_links",
  "process_diagrams", "process_indicators", "process_risks", "process_documents",
  "profiles", "user_roles", "change_log",
] as const;
type TableName = typeof TABLES[number];

// Columns that are managed by the DB or shouldn't be edited in the form.
const SYSTEM_COLS = new Set(["created_at", "updated_at"]);

function isJsonType(c: ColumnInfo) {
  return c.data_type === "jsonb" || c.data_type === "json" || c.udt_name === "jsonb" || c.udt_name === "json";
}
function isArrayType(c: ColumnInfo) {
  return c.data_type === "ARRAY";
}
function isBoolType(c: ColumnInfo) {
  return c.data_type === "boolean";
}
function isNumericType(c: ColumnInfo) {
  return ["integer", "bigint", "smallint", "numeric", "double precision", "real"].includes(c.data_type);
}
function isTimestampType(c: ColumnInfo) {
  return c.data_type.startsWith("timestamp") || c.data_type === "date";
}

function emptyValueFor(c: ColumnInfo): any {
  if (c.column_default !== null) return undefined; // let DB default apply
  if (c.is_nullable) return null;
  if (isBoolType(c)) return false;
  if (isNumericType(c)) return 0;
  if (isJsonType(c)) return null;
  if (isArrayType(c)) return [];
  return "";
}

function toInputString(v: any): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v, null, 2);
  return String(v);
}

function parseValue(c: ColumnInfo, raw: string | boolean | null): any {
  if (typeof raw === "boolean") return raw;
  if (raw === null || raw === "") return c.is_nullable ? null : (isNumericType(c) ? 0 : isBoolType(c) ? false : "");
  if (isNumericType(c)) {
    const n = Number(raw);
    if (Number.isNaN(n)) throw new Error(`"${c.name}" debe ser numérico`);
    return n;
  }
  if (isJsonType(c) || isArrayType(c)) {
    try { return JSON.parse(String(raw)); }
    catch { throw new Error(`"${c.name}" debe ser JSON válido`); }
  }
  return String(raw);
}

function Page() {
  const { isAdmin, loading } = useAuth();
  const fetchCols = useServerFn(getTableColumns);

  const [table, setTable] = useState<TableName>("macroprocesses");
  const [columns, setColumns] = useState<ColumnInfo[]>([]);
  const [rows, setRows] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null); // null = new
  const [form, setForm] = useState<Record<string, any>>({});

  const pkCols = useMemo(() => columns.filter((c) => c.is_primary_key).map((c) => c.name), [columns]);

  const load = useCallback(async () => {
    setBusy(true); setError(null);
    setColumns([]); setRows([]);
    try {
      const colsRes = await fetchCols({ data: { table } });
      setColumns(colsRes.columns);
      const rowsRes = await supabase.from(table as any).select("*").limit(500);
      if (rowsRes.error) {
        setError(rowsRes.error.message);
        setRows([]);
      } else {
        setRows(rowsRes.data ?? []);
      }
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally { setBusy(false); }
  }, [table, fetchCols]);

  useEffect(() => { if (isAdmin) void load(); }, [isAdmin, load]);

  const openNew = async () => {
    let cols = columns;
    if (!cols.length) {
      try {
        const res = await fetchCols({ data: { table } });
        cols = res.columns;
        setColumns(cols);
      } catch (e: any) {
        toast.error(e.message ?? String(e));
        return;
      }
    }
    const f: Record<string, any> = {};
    for (const c of cols) {
      if (SYSTEM_COLS.has(c.name)) continue;
      if (c.is_identity) continue;
      const ev = emptyValueFor(c);
      if (ev !== undefined) f[c.name] = ev;
    }
    setEditing(null); setForm(f); setDialogOpen(true);
  };
  const openEdit = (row: any) => {
    const f: Record<string, any> = {};
    for (const c of columns) f[c.name] = row[c.name];
    setEditing(row); setForm(f); setDialogOpen(true);
  };

  const save = async () => {
    try {
      const payload: Record<string, any> = {};
      for (const c of columns) {
        if (SYSTEM_COLS.has(c.name)) continue;
        if (!editing && c.is_identity) continue;
        if (editing && pkCols.includes(c.name)) continue; // don't update PKs
        if (!(c.name in form)) continue;
        const v = form[c.name];
        if (v === undefined) continue;
        // Skip empty optional fields on create so DB defaults kick in
        if (!editing && (v === "" || v === null) && c.column_default !== null) continue;
        payload[c.name] = isBoolType(c) ? Boolean(v) : parseValue(c, v as any);
      }

      if (editing) {
        let q = supabase.from(table as any).update(payload);
        for (const pk of pkCols) q = q.eq(pk, editing[pk]);
        const { error } = await q;
        if (error) throw new Error(error.message);
        toast.success("Registro actualizado");
      } else {
        const { error } = await supabase.from(table as any).insert(payload);
        if (error) throw new Error(error.message);
        toast.success("Registro creado");
      }
      setDialogOpen(false);
      void load();
    } catch (e: any) {
      toast.error(e.message ?? String(e));
    }
  };

  const remove = async (row: any) => {
    if (!pkCols.length) { toast.error("Esta tabla no tiene clave primaria; no se puede borrar."); return; }
    if (!confirm("¿Borrar este registro? Esta acción no se puede deshacer.")) return;
    try {
      let q = supabase.from(table as any).delete();
      for (const pk of pkCols) q = q.eq(pk, row[pk]);
      const { error } = await q;
      if (error) throw new Error(error.message);
      toast.success("Registro borrado");
      void load();
    } catch (e: any) {
      toast.error(e.message ?? String(e));
    }
  };

  const filteredRows = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter((r) => Object.values(r).some((v) => toInputString(v).toLowerCase().includes(q)));
  }, [rows, search]);

  if (loading) return <div className="p-6">Cargando…</div>;
  if (!isAdmin) return <div className="p-6">Solo los administradores pueden gestionar la base de datos.</div>;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Mantenimiento de base de datos</h1>
          <p className="text-sm text-muted-foreground">Consulta, crea, edita y borra registros, explora el modelo relacional o ejecuta consultas SQL de solo lectura.</p>
        </div>
        <BackendInfoButton />
      </div>

      <Tabs defaultValue="editor" className="space-y-4">
        <TabsList>
          <TabsTrigger value="editor">Editor de registros</TabsTrigger>
          <TabsTrigger value="schema">Diagrama de relaciones</TabsTrigger>
          <TabsTrigger value="sql">Esquema (SQL)</TabsTrigger>
        </TabsList>

        <TabsContent value="schema" className="space-y-4">
          <DbSchemaDiagram />
        </TabsContent>

        <TabsContent value="sql" className="space-y-4">
          <SchemaSqlPanel />
        </TabsContent>


        <TabsContent value="editor" className="space-y-4">
      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={busy}>
          <RefreshCw className="h-4 w-4 mr-1" /> Recargar
        </Button>
        <Button size="sm" onClick={() => void openNew()} disabled={busy}>
          <Plus className="h-4 w-4 mr-1" /> Nuevo registro
        </Button>
      </div>



      <div className="flex flex-wrap gap-2">
        {TABLES.map((t) => (
          <Button key={t} size="sm" variant={t === table ? "default" : "outline"} onClick={() => setTable(t)}>
            {t}
          </Button>
        ))}
      </div>

      <Input
        placeholder="Filtrar filas…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />

      <Card className="p-0 overflow-auto">
        {busy ? (
          <div className="p-4">Cargando…</div>
        ) : error ? (
          <div className="p-4 text-destructive">{error}</div>
        ) : !columns.length ? (
          <div className="p-4 text-muted-foreground">Sin columnas.</div>
        ) : (
          <table className="text-xs w-full">
            <thead className="bg-muted/50 sticky top-0">
              <tr className="border-b">
                <th className="p-2 text-left w-24">Acciones</th>
                {columns.map((c) => (
                  <th key={c.name} className="text-left p-2 font-medium whitespace-nowrap">
                    {c.name}
                    {c.is_primary_key && <span className="ml-1 text-primary">★</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((r, i) => (
                <tr key={i} className="border-b align-top hover:bg-muted/30">
                  <td className="p-2">
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(r)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => void remove(r)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                  {columns.map((c) => (
                    <td key={c.name} className="p-2 max-w-[280px] truncate">
                      {toInputString(r[c.name])}
                    </td>
                  ))}
                </tr>
              ))}
              {!filteredRows.length && (
                <tr><td colSpan={columns.length + 1} className="p-4 text-muted-foreground text-center">Sin filas.</td></tr>
              )}
            </tbody>
          </table>
        )}
      </Card>
      <div className="text-xs text-muted-foreground">{filteredRows.length} de {rows.length} fila(s) · máx. 500</div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar registro" : "Nuevo registro"} · {table}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {columns.map((c) => {
              if (SYSTEM_COLS.has(c.name)) return null;
              const isPk = c.is_primary_key;
              const disabled = !!editing && isPk;
              const hideOnCreate = !editing && c.is_identity;
              if (hideOnCreate) return null;
              const value = form[c.name];

              return (
                <div key={c.name} className="space-y-1">
                  <Label className="text-xs">
                    {c.name}
                    <span className="ml-1 text-muted-foreground font-normal">
                      ({c.udt_name}{c.is_nullable ? "" : " · requerido"}{isPk ? " · PK" : ""})
                    </span>
                  </Label>
                  {isBoolType(c) ? (
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={!!value}
                        disabled={disabled}
                        onCheckedChange={(v) => setForm((f) => ({ ...f, [c.name]: !!v }))}
                      />
                      <span className="text-xs text-muted-foreground">{value ? "true" : "false"}</span>
                    </div>
                  ) : isJsonType(c) || isArrayType(c) ? (
                    <Textarea
                      rows={4}
                      disabled={disabled}
                      value={toInputString(value)}
                      onChange={(e) => setForm((f) => ({ ...f, [c.name]: e.target.value }))}
                      placeholder={isArrayType(c) ? '["valor1","valor2"]' : '{"clave":"valor"}'}
                      className="font-mono text-xs"
                    />
                  ) : isTimestampType(c) ? (
                    <Input
                      type="text"
                      disabled={disabled}
                      value={toInputString(value)}
                      onChange={(e) => setForm((f) => ({ ...f, [c.name]: e.target.value }))}
                      placeholder="YYYY-MM-DD HH:MM:SS o vacío"
                    />
                  ) : (
                    <Input
                      type={isNumericType(c) ? "number" : "text"}
                      disabled={disabled}
                      value={toInputString(value)}
                      onChange={(e) => setForm((f) => ({ ...f, [c.name]: e.target.value }))}
                    />
                  )}
                </div>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={() => void save()}>{editing ? "Guardar cambios" : "Crear"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function BackendInfoButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Info className="h-4 w-4 mr-1" /> ¿Cómo acceder al backend?
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Backend de la aplicación</DialogTitle>
            <DialogDescription>
              Esta aplicación funciona sobre <strong>Lovable Cloud</strong>, el backend gestionado de Lovable.
              No necesitas una cuenta externa: base de datos, autenticación, almacenamiento y secretos se administran desde el propio panel de Lovable.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="rounded-md border p-3 space-y-1">
              <p className="font-medium flex items-center gap-2"><Database className="h-4 w-4" /> Ver tablas, políticas y usuarios</p>
              <p className="text-muted-foreground">
                Abre el panel lateral de Lovable y entra en <strong>Cloud</strong> para inspeccionar tablas, políticas RLS, usuarios autenticados, archivos y logs.
              </p>
            </div>
            <div className="rounded-md border p-3 space-y-1">
              <p className="font-medium">Cambios de esquema (nuevas tablas, columnas, índices, RLS)</p>
              <p className="text-muted-foreground">
                Pídelos en el chat de Lovable. Se aplicarán como migraciones versionadas y revisables, no editando la base de datos directamente.
              </p>
            </div>
            <div className="rounded-md border p-3 space-y-1">
              <p className="font-medium">Inspección rápida desde aquí</p>
              <p className="text-muted-foreground">
                Usa la pestaña <strong>Esquema (SQL)</strong> para listar tablas con su tamaño y ejecutar consultas <code>SELECT</code> en modo solo lectura.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function SchemaSqlPanel() {
  const fetchStats = useServerFn(getTableStats);
  const fetchCols = useServerFn(getTableColumns);
  const runSql = useServerFn(runReadOnlySql);
  const [stats, setStats] = useState<TableStat[]>([]);
  const [loadingStats, setLoadingStats] = useState(false);
  const [builderTable, setBuilderTable] = useState<TableName>("macroprocesses");
  const [builderCols, setBuilderCols] = useState<ColumnInfo[]>([]);
  const [selectedCols, setSelectedCols] = useState<Set<string>>(new Set());
  const [loadingCols, setLoadingCols] = useState(false);
  const [limit, setLimit] = useState<number>(20);
  const [sql, setSql] = useState("SELECT * FROM macroprocesses LIMIT 20;");
  const [result, setResult] = useState<SqlResult | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const loadStats = useCallback(async () => {
    setLoadingStats(true);
    try {
      const res = await fetchStats({});
      setStats(res.stats);
    } catch (e: any) {
      toast.error(e.message ?? String(e));
    } finally {
      setLoadingStats(false);
    }
  }, [fetchStats]);

  useEffect(() => { void loadStats(); }, [loadStats]);

  // Preload schema of the builder table whenever it changes
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingCols(true);
      try {
        const res = await fetchCols({ data: { table: builderTable } });
        if (cancelled) return;
        setBuilderCols(res.columns);
        setSelectedCols(new Set(res.columns.map((c) => c.name)));
      } catch (e: any) {
        if (!cancelled) toast.error(e.message ?? String(e));
      } finally {
        if (!cancelled) setLoadingCols(false);
      }
    })();
    return () => { cancelled = true; };
  }, [builderTable, fetchCols]);

  // Rebuild SQL when selection/limit/table changes
  useEffect(() => {
    const cols = builderCols.filter((c) => selectedCols.has(c.name)).map((c) => `"${c.name}"`);
    const colList = cols.length ? cols.join(", ") : "*";
    setSql(`SELECT ${colList} FROM ${builderTable} LIMIT ${limit};`);
  }, [builderTable, builderCols, selectedCols, limit]);

  const toggleCol = (name: string) => {
    setSelectedCols((prev) => {
      const n = new Set(prev);
      if (n.has(name)) n.delete(name); else n.add(name);
      return n;
    });
  };
  const selectAll = () => setSelectedCols(new Set(builderCols.map((c) => c.name)));
  const selectNone = () => setSelectedCols(new Set());

  const execute = async () => {
    setRunning(true); setRunError(null); setResult(null);
    try {
      const res = await runSql({ data: { sql } });
      setResult(res);
    } catch (e: any) {
      setRunError(e.message ?? String(e));
    } finally {
      setRunning(false);
    }
  };


  return (
    <div className="space-y-6">
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-medium">Tablas del esquema <code>public</code></h3>
            <p className="text-xs text-muted-foreground">Tamaño total en disco y estimación de filas (puede no ser exacto si la tabla no ha sido analizada recientemente).</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => void loadStats()} disabled={loadingStats}>
            <RefreshCw className="h-4 w-4 mr-1" /> Recargar
          </Button>
        </div>
        <div className="overflow-auto">
          <table className="text-xs w-full">
            <thead className="bg-muted/50">
              <tr className="border-b">
                <th className="text-left p-2">Tabla</th>
                <th className="text-right p-2">Filas (est.)</th>
                <th className="text-right p-2">Tamaño</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((s) => (
                <tr key={s.table_name} className="border-b hover:bg-muted/30">
                  <td className="p-2 font-mono">{s.table_name}</td>
                  <td className="p-2 text-right">{Number(s.row_estimate).toLocaleString()}</td>
                  <td className="p-2 text-right">{s.total_size}</td>
                </tr>
              ))}
              {!stats.length && !loadingStats && (
                <tr><td colSpan={3} className="p-4 text-center text-muted-foreground">Sin datos.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <div>
          <h3 className="font-medium">Ejecutar consulta SQL (solo lectura)</h3>
          <p className="text-xs text-muted-foreground">
            Solo se permiten <code>SELECT</code> y <code>WITH</code>. Resultados limitados a 500 filas. Para cambios de datos usa el editor de registros; para cambios de esquema, pídelos en el chat de Lovable.
          </p>
        </div>

        <div className="rounded-md border p-3 space-y-3 bg-muted/20">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Tabla</Label>
              <select
                className="h-9 rounded-md border bg-background px-2 text-xs"
                value={builderTable}
                onChange={(e) => setBuilderTable(e.target.value as TableName)}
              >
                {TABLES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">LIMIT</Label>
              <Input
                type="number"
                min={1}
                max={500}
                value={limit}
                onChange={(e) => setLimit(Math.max(1, Math.min(500, Number(e.target.value) || 1)))}
                className="h-9 w-24 text-xs"
              />
            </div>
            <div className="flex gap-2 ml-auto">
              <Button size="sm" variant="outline" onClick={selectAll} disabled={loadingCols}>Todas</Button>
              <Button size="sm" variant="outline" onClick={selectNone} disabled={loadingCols}>Ninguna</Button>
            </div>
          </div>
          <div>
            <Label className="text-xs mb-1 block">Columnas ({selectedCols.size}/{builderCols.length})</Label>
            {loadingCols ? (
              <div className="text-xs text-muted-foreground">Cargando esquema…</div>
            ) : (
              <div className="flex flex-wrap gap-x-4 gap-y-2 max-h-40 overflow-auto">
                {builderCols.map((c) => (
                  <label key={c.name} className="flex items-center gap-2 text-xs cursor-pointer">
                    <Checkbox
                      checked={selectedCols.has(c.name)}
                      onCheckedChange={() => toggleCol(c.name)}
                    />
                    <span className="font-mono">{c.name}</span>
                    <span className="text-muted-foreground">({c.udt_name}{c.is_primary_key ? " · PK" : ""})</span>
                  </label>
                ))}
                {!builderCols.length && <div className="text-xs text-muted-foreground">Sin columnas.</div>}
              </div>
            )}
          </div>
        </div>

        <Textarea
          value={sql}
          onChange={(e) => setSql(e.target.value)}
          rows={5}
          className="font-mono text-xs"
          placeholder="SELECT * FROM processes LIMIT 10;"
        />
        <div className="flex justify-end">
          <Button size="sm" onClick={() => void execute()} disabled={running || !sql.trim()}>
            <Play className="h-4 w-4 mr-1" /> Ejecutar
          </Button>
        </div>
        {runError && <div className="text-sm text-destructive">{runError}</div>}
        {result && (
          <div className="overflow-auto border rounded-md">
            <table className="text-xs w-full">
              <thead className="bg-muted/50 sticky top-0">
                <tr className="border-b">
                  {result.columns.map((c) => (
                    <th key={c} className="text-left p-2 font-medium whitespace-nowrap">{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.map((r, i) => (
                  <tr key={i} className="border-b align-top hover:bg-muted/30">
                    {result.columns.map((c) => (
                      <td key={c} className="p-2 max-w-[280px] truncate">{toInputString(r[c])}</td>
                    ))}
                  </tr>
                ))}
                {!result.rows.length && (
                  <tr><td colSpan={result.columns.length || 1} className="p-4 text-center text-muted-foreground">Sin resultados.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        {result && <div className="text-xs text-muted-foreground">{result.rows.length} fila(s)</div>}
      </Card>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/database")({
  component: Page,
});

