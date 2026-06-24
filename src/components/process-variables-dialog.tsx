import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Trash2, Copy } from "lucide-react";
import type { VarType, VarsScope } from "@/lib/bpm";
import { VAR_TYPES } from "@/lib/field-types";

interface Row {
  id?: string;
  name: string;
  label: string;
  description: string;
  var_type: VarType;
}

function scopeKey(s: VarsScope) {
  return [s.clientId, s.environment, s.entityId];
}

export function ProcessVariablesDialog({
  open, onOpenChange, scope,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  scope: VarsScope;
}) {
  const qc = useQueryClient();
  const [rows, setRows] = useState<Row[] | null>(null);

  useQuery({
    queryKey: ["process-variables", ...scopeKey(scope), open],
    enabled: open && !!scope.clientId,
    queryFn: async () => {
      let q = supabase
        .from("process_variables")
        .select("*")
        .eq("client_id", scope.clientId!)
        .eq("environment", scope.environment);
      q = scope.entityId ? q.eq("entity_id", scope.entityId) : q.is("entity_id", null);
      const { data, error } = await q.order("name");
      if (error) throw error;
      setRows((data ?? []).map((r) => ({
        id: r.id, name: r.name, label: r.label ?? "",
        description: ((r as unknown as { description?: string | null }).description ?? "") as string,
        var_type: r.var_type as VarType,
      })));
      return data ?? [];
    },
  });

  const list = rows ?? [];
  const update = (i: number, patch: Partial<Row>) => setRows(list.map((r, j) => j === i ? { ...r, ...patch } : r));
  const remove = (i: number) => setRows(list.filter((_, j) => j !== i));
  const add = () => setRows([...list, { name: "", label: "", description: "", var_type: "text" }]);
  const duplicate = (i: number) => {
    const src = list[i];
    setRows([...list, { ...src, id: undefined, name: src.name + "_copia" }]);
  };

  const save = async () => {
    if (!scope.clientId) return toast.error("Falta el cliente activo");
    const names = new Set<string>();
    for (const r of list) {
      if (!r.name.trim()) return toast.error("Cada variable necesita un nombre");
      if (names.has(r.name)) return toast.error(`Nombre duplicado: ${r.name}`);
      names.add(r.name);
    }
    let exQ = supabase
      .from("process_variables").select("id")
      .eq("client_id", scope.clientId)
      .eq("environment", scope.environment);
    exQ = scope.entityId ? exQ.eq("entity_id", scope.entityId) : exQ.is("entity_id", null);
    const { data: existing } = await exQ;
    const keepIds = new Set(list.filter((r) => r.id).map((r) => r.id!));
    const toDelete = (existing ?? []).filter((r) => !keepIds.has(r.id)).map((r) => r.id);
    if (toDelete.length) {
      const { error } = await supabase.from("process_variables").delete().in("id", toDelete);
      if (error) return toast.error(error.message);
    }
    for (const r of list) {
      const payload = {
        client_id: scope.clientId,
        environment: scope.environment,
        entity_id: scope.entityId,
        owner_kind: null,
        owner_id: null,
        name: r.name.trim(), label: r.label.trim() || r.name.trim(),
        description: r.description?.trim() || null,
        var_type: r.var_type,
      } as unknown as { name: string; var_type: string };
      const q = r.id
        ? supabase.from("process_variables").update(payload).eq("id", r.id)
        : supabase.from("process_variables").insert(payload);
      const { error } = await q;
      if (error) return toast.error(error.message);
    }
    toast.success("Variables guardadas");
    qc.invalidateQueries({ queryKey: ["process-variables"] });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Catálogo de variables</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground -mt-2">
          Catálogo compartido por todos los procesos y subprocesos del mismo
          cliente, entorno y entidad. La obligatoriedad y el valor por defecto
          se configuran en cada nodo, dentro de su sección de entradas.
        </p>
        <div className="max-h-[60vh] space-y-1 overflow-auto">
          {/* Add button aligned above Actions */}
          <div className="flex justify-end px-2">
            <Button type="button" variant="outline" size="sm" onClick={add}>
              <Plus className="mr-1 h-3 w-3" /> Añadir variable
            </Button>
          </div>
          {/* Column headers */}
          <div className="grid grid-cols-12 items-center gap-2 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <div className="col-span-2">Nombre</div>
            <div className="col-span-2">Tipo</div>
            <div className="col-span-3">Etiqueta</div>
            <div className="col-span-4">Descripción</div>
            <div className="col-span-1 text-right">Acciones</div>
          </div>
          {list.length === 0 && <p className="text-sm italic text-muted-foreground px-2">Aún no hay variables.</p>}
          {list
            .map((r, i) => ({ r, i }))
            .sort((a, b) => {
              const typeCmp = a.r.var_type.localeCompare(b.r.var_type, undefined, { sensitivity: "base" });
              if (typeCmp !== 0) return typeCmp;
              return a.r.name.localeCompare(b.r.name, undefined, { sensitivity: "base" });
            })
            .map(({ r, i }) => (
            <div key={i} className="grid grid-cols-12 items-center gap-2 rounded border bg-muted/30 px-2 py-1 text-xs">
              <Input className="col-span-2 h-7 text-xs" placeholder="nombre" value={r.name} onChange={(e) => update(i, { name: e.target.value })} />
              <select className="col-span-2 h-7 rounded border bg-background px-1 text-xs" value={r.var_type}
                onChange={(e) => update(i, { var_type: e.target.value as VarType })}>
                {VAR_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <Input className="col-span-3 h-7 text-xs" placeholder="etiqueta" value={r.label} onChange={(e) => update(i, { label: e.target.value })} />
              <Input className="col-span-4 h-7 text-xs" placeholder="descripción" value={r.description} onChange={(e) => update(i, { description: e.target.value })} />
              <div className="col-span-1 flex items-center justify-end gap-1">
                <button type="button" onClick={() => duplicate(i)} className="text-muted-foreground hover:opacity-70" title="Duplicar">
                  <Copy className="h-3.5 w-3.5" />
                </button>
                <button type="button" onClick={() => remove(i)} className="text-destructive hover:opacity-70" title="Eliminar">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={save}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}