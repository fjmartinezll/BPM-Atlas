import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { getTableColumns, type ColumnInfo } from "@/lib/db-admin.functions";
import { Pencil, Trash2, Plus, Save, X } from "lucide-react";

const ALLOWED = new Set([
  "macroprocesses", "processes", "subprocesses", "executable_elements",
  "subprocess_elements", "executable_element_integrations",
  "entities", "entity_process_links",
  "process_diagrams", "process_indicators", "process_risks", "process_documents",
]);

type FieldDef = { name: string; fk?: string; fkField?: string };
type TableMeta = {
  id: string;
  title: string;
  color: string;
  fields: FieldDef[];
};

const SKIP_COLS = new Set(["id", "created_at", "updated_at"]);

function labelOf(row: Record<string, any>): string {
  return (row.name ?? row.code ?? row.title ?? row.description ?? row.id ?? "").toString();
}

export function EntityMaintenanceDialog({
  open,
  onOpenChange,
  table,
  allTables,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  table: TableMeta;
  allTables: TableMeta[];
}) {
  const qc = useQueryClient();
  const fetchCols = useServerFn(getTableColumns);
  const allowed = ALLOWED.has(table.id);

  const [editing, setEditing] = useState<Record<string, any> | null>(null);
  const [form, setForm] = useState<Record<string, any>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setEditing(null);
      setForm({});
      setError(null);
    }
  }, [open, table.id]);

  const colsQ = useQuery({
    queryKey: ["maint-cols", table.id],
    enabled: open && allowed,
    queryFn: () => fetchCols({ data: { table: table.id } }),
  });
  const columns: ColumnInfo[] = colsQ.data?.columns ?? [];

  const rowsQ = useQuery({
    queryKey: ["maint-rows", table.id],
    enabled: open && allowed,
    queryFn: async () => {
      const { data, error } = await supabase.from(table.id as any).select("*").limit(200);
      if (error) throw new Error(error.message);
      return (data ?? []) as Array<Record<string, any>>;
    },
  });

  // Fetch FK option lists
  const fkMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const f of table.fields) if (f.fk && allTables.find((t) => t.id === f.fk)) m[f.name] = f.fk!;
    return m;
  }, [table, allTables]);

  const fkOptionsQ = useQuery({
    queryKey: ["maint-fk-opts", table.id, Object.keys(fkMap).join(",")],
    enabled: open && allowed && Object.keys(fkMap).length > 0,
    queryFn: async () => {
      const out: Record<string, Array<{ id: string; label: string }>> = {};
      await Promise.all(
        Array.from(new Set(Object.values(fkMap))).map(async (t) => {
          const { data } = await supabase.from(t as any).select("*").limit(500);
          out[t] = ((data ?? []) as any[]).map((r) => ({ id: String(r.id), label: labelOf(r) || String(r.id) }));
        }),
      );
      return out;
    },
  });

  const editable = useMemo(
    () => columns.filter((c) => !SKIP_COLS.has(c.name) && !c.is_identity),
    [columns],
  );

  const startNew = () => {
    setEditing({});
    const init: Record<string, any> = {};
    for (const c of editable) init[c.name] = c.column_default ? undefined : "";
    setForm(init);
    setError(null);
  };

  const startEdit = (row: Record<string, any>) => {
    setEditing(row);
    const init: Record<string, any> = {};
    for (const c of editable) init[c.name] = row[c.name] ?? "";
    setForm(init);
    setError(null);
  };

  const saveMut = useMutation({
    mutationFn: async () => {
      // Build payload: omit empty strings for nullable / default cols
      const payload: Record<string, any> = {};
      for (const c of editable) {
        let v = form[c.name];
        if (v === "" || v === undefined) {
          if (c.is_nullable || c.column_default) continue;
          throw new Error(`El campo "${c.name}" es obligatorio`);
        }
        if (c.data_type === "integer" || c.data_type === "bigint" || c.data_type === "numeric" || c.data_type === "double precision") {
          const n = Number(v);
          if (Number.isNaN(n)) throw new Error(`"${c.name}" debe ser numérico`);
          v = n;
        } else if (c.data_type === "boolean") {
          v = v === true || v === "true";
        } else if (c.udt_name === "jsonb" || c.udt_name === "json") {
          if (typeof v === "string" && v.trim()) {
            try { v = JSON.parse(v); } catch { throw new Error(`"${c.name}" debe ser JSON válido`); }
          }
        }
        payload[c.name] = v;
      }
      if (editing && editing.id) {
        const { error } = await supabase.from(table.id as any).update(payload).eq("id", editing.id);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase.from(table.id as any).insert(payload as any);
        if (error) throw new Error(error.message);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["maint-rows", table.id] });
      qc.invalidateQueries({ queryKey: ["er-entities-rows", table.id] });
      qc.invalidateQueries({ queryKey: ["er-entities-counts"] });
      setEditing(null);
      setForm({});
      setError(null);
    },
    onError: (e: Error) => setError(e.message),
  });

  const delMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from(table.id as any).delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["maint-rows", table.id] });
      qc.invalidateQueries({ queryKey: ["er-entities-rows", table.id] });
      qc.invalidateQueries({ queryKey: ["er-entities-counts"] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const renderField = (c: ColumnInfo) => {
    const value = form[c.name] ?? "";
    const setV = (v: any) => setForm((p) => ({ ...p, [c.name]: v }));
    const fkTarget = fkMap[c.name];
    if (fkTarget) {
      const opts = fkOptionsQ.data?.[fkTarget] ?? [];
      return (
        <select
          className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
          value={value}
          onChange={(e) => setV(e.target.value)}
        >
          <option value="">— sin seleccionar —</option>
          {opts.map((o) => (
            <option key={o.id} value={o.id}>{o.label}</option>
          ))}
        </select>
      );
    }
    if (c.data_type === "boolean") {
      return (
        <input type="checkbox" checked={!!value} onChange={(e) => setV(e.target.checked)} className="h-4 w-4" />
      );
    }
    if (c.udt_name === "jsonb" || c.udt_name === "json" || c.data_type === "text") {
      const isLong = c.data_type === "text" || c.udt_name?.includes("json");
      if (isLong) {
        const str = typeof value === "object" ? JSON.stringify(value, null, 2) : String(value ?? "");
        return <Textarea rows={3} value={str} onChange={(e) => setV(e.target.value)} />;
      }
    }
    if (c.data_type?.includes("timestamp")) {
      return <Input type="datetime-local" value={value ? String(value).slice(0, 16) : ""} onChange={(e) => setV(e.target.value)} />;
    }
    if (["integer", "bigint", "numeric", "double precision"].includes(c.data_type)) {
      return <Input type="number" value={value} onChange={(e) => setV(e.target.value)} />;
    }
    return <Input value={value} onChange={(e) => setV(e.target.value)} />;
  };

  const rows = rowsQ.data ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-mono" style={{ color: table.color }}>{table.title}</DialogTitle>
          <DialogDescription>
            Mantenimiento de datos. Los campos con clave foránea se validan contra la tabla relacionada.
          </DialogDescription>
        </DialogHeader>

        {!allowed && (
          <div className="text-sm text-muted-foreground p-4">
            Esta tabla no es editable desde el mantenimiento (catálogo o no autorizada).
          </div>
        )}

        {allowed && (
          <div className="flex-1 overflow-y-auto space-y-4">
            {error && <div className="rounded border border-destructive bg-destructive/10 text-destructive text-xs p-2">{error}</div>}

            {editing ? (
              <div className="rounded-md border p-3 space-y-3 bg-muted/30">
                <div className="font-semibold text-sm">{editing.id ? `Editar registro` : "Nuevo registro"}</div>
                <div className="grid grid-cols-2 gap-3">
                  {editable.map((c) => (
                    <div key={c.name} className="space-y-1">
                      <Label className="text-xs font-mono">
                        {c.name}
                        {!c.is_nullable && !c.column_default && <span className="text-destructive ml-0.5">*</span>}
                        <span className="ml-1 text-muted-foreground font-normal">({c.udt_name})</span>
                      </Label>
                      {renderField(c)}
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" size="sm" onClick={() => { setEditing(null); setError(null); }}>
                    <X className="h-3.5 w-3.5 mr-1" /> Cancelar
                  </Button>
                  <Button size="sm" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
                    <Save className="h-3.5 w-3.5 mr-1" /> {saveMut.isPending ? "Guardando…" : "Guardar"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex justify-end">
                <Button size="sm" onClick={startNew} disabled={colsQ.isLoading}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Nuevo
                </Button>
              </div>
            )}

            <div className="rounded-md border overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-muted">
                  <tr>
                    <th className="text-left px-2 py-1.5 font-mono">#</th>
                    <th className="text-left px-2 py-1.5">Resumen</th>
                    <th className="px-2 py-1.5 w-24"></th>
                  </tr>
                </thead>
                <tbody>
                  {rowsQ.isLoading && (
                    <tr><td colSpan={3} className="px-2 py-3 text-muted-foreground">Cargando…</td></tr>
                  )}
                  {!rowsQ.isLoading && rows.length === 0 && (
                    <tr><td colSpan={3} className="px-2 py-3 text-muted-foreground italic">Sin registros.</td></tr>
                  )}
                  {rows.map((r, i) => (
                    <tr key={r.id ?? i} className="border-t hover:bg-muted/40">
                      <td className="px-2 py-1.5 font-mono text-muted-foreground">{i + 1}</td>
                      <td className="px-2 py-1.5 font-mono truncate max-w-md">{labelOf(r) || "(sin etiqueta)"}</td>
                      <td className="px-2 py-1.5 text-right">
                        <Button variant="ghost" size="sm" onClick={() => startEdit(r)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (confirm(`¿Eliminar el registro "${labelOf(r) || r.id}"?`)) delMut.mutate(r.id);
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
