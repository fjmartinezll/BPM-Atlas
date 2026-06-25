import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { STALE, queryKeys } from "@/lib/query-keys";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useClient } from "@/lib/client-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Plus, Pencil, ListChecks } from "lucide-react";
import { CrudDialogShell } from "@/components/crud-dialog-shell";
import { DeleteButton } from "@/components/delete-button";

type Responsibility = {
  id: string;
  position_id: string;
  name: string;
  label: Record<string, string>;
  description: Record<string, string>;
  sort_order: number;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  positionId: string;
  positionName: string;
};

export function OrgResponsibilitiesDialog({ open, onOpenChange, positionId, positionName }: Props) {
  const { canEdit, language } = useAuth();
  const { withTenant } = useClient();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Responsibility | null>(null);
  const [form, setForm] = useState({ name: "", label: "", description: "", sort_order: 0 });

  const responsibilities = useQuery({
    queryKey: queryKeys.org.responsibilities(positionId),
    staleTime: STALE.REFERENCE,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("org_responsibilities")
        .select("id, position_id, name, label, description, sort_order")
        .eq("position_id", positionId)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as Responsibility[];
    },
    enabled: open && !!positionId,
  });

  const resetForm = () => {
    setEditing(null);
    setForm({ name: "", label: "", description: "", sort_order: (responsibilities.data?.length ?? 0) });
  };

  const startEdit = (r: Responsibility) => {
    setEditing(r);
    setForm({
      name: r.name,
      label: r.label?.[language] || "",
      description: r.description?.[language] || "",
      sort_order: r.sort_order,
    });
  };

  const save = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!canEdit) { toast.error("Sin permisos"); return; }
    if (!form.name.trim()) { toast.error("Nombre requerido"); return; }

    if (editing) {
      const existing = editing;
      const mergedLabel = { ...existing.label, [language]: form.label.trim() };
      const mergedDesc = { ...existing.description, [language]: form.description.trim() };
      const { error } = await supabase
        .from("org_responsibilities")
        .update({ name: form.name.trim(), label: mergedLabel, description: mergedDesc, sort_order: Number(form.sort_order) || 0 })
        .eq("id", editing.id);
      if (error) { toast.error(error.message); return; }
    } else {
      const payload = withTenant({
        position_id: positionId,
        name: form.name.trim(),
        label: { [language]: form.label.trim() },
        description: { [language]: form.description.trim() },
        sort_order: Number(form.sort_order) || 0,
      });
      const { error } = await supabase.from("org_responsibilities").insert(payload);
      if (error) { toast.error(error.message); return; }
    }

    toast.success("Guardado");
    resetForm();
    qc.invalidateQueries({ queryKey: queryKeys.org.responsibilities(positionId) });
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("org_responsibilities").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Eliminado");
    if (editing?.id === id) resetForm();
    qc.invalidateQueries({ queryKey: queryKeys.org.responsibilities(positionId) });
  };

  return (
    <CrudDialogShell
      open={open}
      onOpenChange={(o) => { onOpenChange(o); if (!o) resetForm(); }}
      title={`Responsabilidades · ${positionName}`}
      icon={<ListChecks className="h-4 w-4" />}
    >
      <div className="rounded-lg border bg-card">
        <ul className="max-h-[360px] divide-y overflow-auto">
          {(responsibilities.data ?? []).map((r) => (
            <li key={r.id} className="flex items-start justify-between gap-2 px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground tabular-nums">{r.sort_order}</span>
                  <span className="text-sm font-medium truncate">{r.name}</span>
                </div>
                {r.label?.[language] && <p className="mt-0.5 text-xs text-muted-foreground">{r.label[language]}</p>}
                {r.description?.[language] && <p className="text-xs text-muted-foreground">{r.description[language]}</p>}
              </div>
              {canEdit && (
                <div className="flex gap-0.5">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(r)} aria-label="Editar responsabilidad">
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <DeleteButton name={r.name} onDelete={() => remove(r.id)} aria-label="Eliminar responsabilidad" />
                </div>
              )}
            </li>
          ))}
          {!responsibilities.isLoading && (responsibilities.data ?? []).length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-muted-foreground">Sin responsabilidades.</li>
          )}
        </ul>
      </div>

      {canEdit && (
        <form onSubmit={save} className="space-y-3 rounded-lg border bg-muted/30 p-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {editing ? "Editar responsabilidad" : "Nueva responsabilidad"}
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Nombre</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ej: Aprobar presupuesto" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Etiqueta ({language})</Label>
            <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Descripción ({language})</Label>
            <Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Orden</Label>
            <Input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} />
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
