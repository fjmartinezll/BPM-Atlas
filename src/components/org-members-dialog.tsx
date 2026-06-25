import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { STALE, queryKeys } from "@/lib/query-keys";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useClient } from "@/lib/client-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Plus, Pencil, Users, User } from "lucide-react";
import { CrudDialogShell } from "@/components/crud-dialog-shell";
import { DeleteButton } from "@/components/delete-button";

type Member = {
  id: string;
  entity_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  language: string;
  user_id: string | null;
  created_at: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityId: string;
  entityName: string;
};

export function OrgMembersDialog({ open, onOpenChange, entityId, entityName }: Props) {
  const { canEdit } = useAuth();
  const { withTenant } = useClient();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Member | null>(null);
  const [form, setForm] = useState({ full_name: "", email: "", phone: "" });

  const members = useQuery({
    queryKey: queryKeys.org.members(entityId),
    staleTime: STALE.REFERENCE,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("org_members")
        .select("id, entity_id, full_name, email, phone, language, user_id, created_at")
        .eq("entity_id", entityId)
        .order("full_name");
      if (error) throw error;
      return (data ?? []) as Member[];
    },
    enabled: open && !!entityId,
  });

  const resetForm = () => {
    setEditing(null);
    setForm({ full_name: "", email: "", phone: "" });
  };

  const startEdit = (m: Member) => {
    setEditing(m);
    setForm({ full_name: m.full_name, email: m.email ?? "", phone: m.phone ?? "" });
  };

  const save = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!canEdit) { toast.error("Sin permisos"); return; }
    if (!form.full_name.trim()) { toast.error("Nombre requerido"); return; }
    const payload = withTenant({
      entity_id: entityId,
      full_name: form.full_name.trim(),
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
    });
    const { error } = editing
      ? await supabase.from("org_members").update(payload).eq("id", editing.id)
      : await supabase.from("org_members").insert(payload);
    if (error) { toast.error(error.message); return; }
    toast.success("Guardado");
    resetForm();
    qc.invalidateQueries({ queryKey: queryKeys.org.members(entityId) });
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("org_members").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Eliminado");
    if (editing?.id === id) resetForm();
    qc.invalidateQueries({ queryKey: queryKeys.org.members(entityId) });
  };

  return (
    <CrudDialogShell
      open={open}
      onOpenChange={(o) => { onOpenChange(o); if (!o) resetForm(); }}
      title={`Miembros · ${entityName}`}
      icon={<Users className="h-4 w-4" />}
    >
      <div className="rounded-lg border bg-card">
        <ul className="max-h-[360px] divide-y overflow-auto">
          {(members.data ?? []).map((m) => (
            <li key={m.id} className="flex items-start justify-between gap-2 px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <User className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-sm font-medium truncate">{m.full_name}</span>
                </div>
                {m.email && <p className="mt-0.5 text-xs text-muted-foreground">{m.email}</p>}
                {m.phone && <p className="text-xs text-muted-foreground">{m.phone}</p>}
              </div>
              {canEdit && (
                <div className="flex gap-0.5">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(m)} aria-label="Editar miembro">
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <DeleteButton name={m.full_name} onDelete={() => remove(m.id)} aria-label="Eliminar miembro" />
                </div>
              )}
            </li>
          ))}
          {!members.isLoading && (members.data ?? []).length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-muted-foreground">Sin miembros.</li>
          )}
        </ul>
      </div>

      {canEdit && (
        <form onSubmit={save} className="space-y-3 rounded-lg border bg-muted/30 p-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {editing ? "Editar miembro" : "Nuevo miembro"}
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Nombre completo</Label>
            <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="Ej: Juan Pérez" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Email</Label>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Teléfono</Label>
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
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
