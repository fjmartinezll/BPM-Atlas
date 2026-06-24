import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Pencil, Plus, Trash2, Users } from "lucide-react";

type Position = {
  id: string;
  entity_id: string;
  name: string;
  description: string | null;
  sort_order: number;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityId: string;
  entityName: string;
};

export function EntityPositionsDialog({ open, onOpenChange, entityId, entityName }: Props) {
  const { canEdit } = useAuth();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Position | null>(null);
  const [form, setForm] = useState({ name: "", description: "", sort_order: 0 });

  const positions = useQuery({
    queryKey: ["entity-positions", entityId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("entity_positions")
        .select("*")
        .eq("entity_id", entityId)
        .order("sort_order")
        .order("name");
      if (error) throw error;
      return (data ?? []) as Position[];
    },
    enabled: open && !!entityId,
  });

  const resetForm = () => {
    setEditing(null);
    setForm({ name: "", description: "", sort_order: (positions.data?.length ?? 0) });
  };

  const startEdit = (p: Position) => {
    setEditing(p);
    setForm({ name: p.name, description: p.description ?? "", sort_order: p.sort_order });
  };

  const save = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!canEdit) { toast.error("Sin permisos"); return; }
    if (!form.name.trim()) { toast.error("Nombre requerido"); return; }
    const payload = {
      entity_id: entityId,
      name: form.name.trim(),
      description: form.description.trim() || null,
      sort_order: Number(form.sort_order) || 0,
    };
    const { error } = editing
      ? await supabase.from("entity_positions").update(payload).eq("id", editing.id)
      : await supabase.from("entity_positions").insert(payload);
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
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) resetForm(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-4 w-4" /> Cargos · {entityName}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-[1fr_280px]">
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
                  {canEdit && (
                    <div className="flex gap-0.5">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(p)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7"><Trash2 className="h-3.5 w-3.5" /></Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>¿Eliminar cargo?</AlertDialogTitle>
                            <AlertDialogDescription>«{p.name}» se eliminará permanentemente.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => remove(p.id)}>Eliminar</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  )}
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
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
