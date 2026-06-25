import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { STALE } from "@/lib/query-keys";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Pencil, Plus, Users, UserCheck, ListChecks } from "lucide-react";
import { CrudDialogShell } from "@/components/crud-dialog-shell";
import { DeleteButton } from "@/components/delete-button";

type Position = {
  id: string;
  entity_id: string;
  name: string;
  description: string | null;
  sort_order: number;
  parent_id: string | null;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityId: string;
  entityName: string;
  onOpenResponsibilities?: (positionId: string, positionName: string) => void;
  onOpenAssignments?: (positionId: string, positionName: string) => void;
};

export function EntityPositionsDialog({ open, onOpenChange, entityId, entityName, onOpenResponsibilities, onOpenAssignments }: Props) {
  const { canEdit, language } = useAuth();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Position | null>(null);
  const [form, setForm] = useState({ name: "", description: "", sort_order: 0, parent_id: "" });

  const positions = useQuery({
    queryKey: ["entity-positions", entityId],
    staleTime: STALE.REFERENCE,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("entity_positions")
        .select("id, entity_id, name, description, sort_order, parent_id")
        .eq("entity_id", entityId)
        .order("sort_order")
        .order("name");
      if (error) throw error;
      const rows = (data ?? []) as Array<{ id: string; entity_id: string; name: string; description: Record<string, string>; sort_order: number; parent_id: string | null }>;
      return rows.map((r) => ({ ...r, description: r.description?.[language] ?? null }));
    },
    enabled: open && !!entityId,
  });

  const resetForm = () => {
    setEditing(null);
    setForm({ name: "", description: "", sort_order: (positions.data?.length ?? 0), parent_id: "" });
  };

  const startEdit = (p: Position) => {
    setEditing(p);
    setForm({ name: p.name, description: p.description ?? "", sort_order: p.sort_order, parent_id: p.parent_id ?? "" });
  };

  const save = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!canEdit) { toast.error("Sin permisos"); return; }
    if (!form.name.trim()) { toast.error("Nombre requerido"); return; }
    const desc = form.description.trim() || undefined;
    const descPayload: Record<string, string> = {};
    if (desc) descPayload[language] = desc;
    const base = {
      name: form.name.trim(),
      description: descPayload,
      sort_order: Number(form.sort_order) || 0,
      parent_id: form.parent_id || null,
    };
    const { error } = editing
      ? await supabase.from("entity_positions").update(base).eq("id", editing.id)
      : await supabase.from("entity_positions").insert({ entity_id: entityId, ...base });
    if (error) { toast.error(error.message); return; }
    toast.success("Guardado");
    resetForm();
    qc.invalidateQueries({ queryKey: ["entity-positions", entityId] });
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("entity_positions").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Eliminado");
    if (editing?.id === id) resetForm();
    qc.invalidateQueries({ queryKey: ["entity-positions", entityId] });
  };

  return (
    <CrudDialogShell
      open={open}
      onOpenChange={(o) => { onOpenChange(o); if (!o) resetForm(); }}
      title={`Cargos · ${entityName}`}
      icon={<Users className="h-4 w-4" />}
    >
      <div className="rounded-lg border bg-card">
        <ul className="max-h-[360px] divide-y overflow-auto">
          {(positions.data ?? []).map((p) => (
            <li key={p.id} className="flex items-start justify-between gap-2 px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground tabular-nums">{p.sort_order}</span>
                  <span className="text-sm font-medium truncate">{p.name}</span>
                </div>
                {p.description && <p className="mt-0.5 text-xs text-muted-foreground">{p.description}</p>}
              </div>
              <div className="flex gap-0.5">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onOpenAssignments?.(p.id, p.name)} aria-label="Personas">
                  <UserCheck className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onOpenResponsibilities?.(p.id, p.name)} aria-label="Responsabilidades">
                  <ListChecks className="h-3.5 w-3.5" />
                </Button>
                {canEdit && (
                  <>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(p)} aria-label="Editar cargo">
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <DeleteButton name={p.name} onDelete={() => remove(p.id)} aria-label="Eliminar cargo" />
                  </>
                )}
              </div>
            </li>
          ))}
          {!positions.isLoading && (positions.data ?? []).length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-muted-foreground">Sin cargos.</li>
          )}
        </ul>
      </div>

      {canEdit && (
        <form onSubmit={save} className="space-y-3 rounded-lg border bg-muted/30 p-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {editing ? "Editar cargo" : "Nuevo cargo"}
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Nombre</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ej: Director" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Descripción</Label>
            <Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Orden</Label>
            <Input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Cargo superior (padre)</Label>
            <select
              value={form.parent_id}
              onChange={(e) => setForm({ ...form, parent_id: e.target.value })}
              className="flex h-8 w-full rounded-md border border-input bg-transparent px-2 text-xs shadow-sm transition-colors"
            >
              <option value="">— Ninguno (raíz) —</option>
              {(positions.data ?? [])
                .filter((p) => p.id !== editing?.id)
                .map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
            </select>
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="sm" className="flex-1">
              {editing ? "Guardar" : <><Plus className="mr-1 h-3.5 w-3.5" /> Añadir</>}
            </Button>
            {editing && (
              <Button type="button" variant="outline" size="sm" onClick={resetForm}>Cancelar</Button>
            )}
          </div>
        </form>
      )}
    </CrudDialogShell>
  );
}
