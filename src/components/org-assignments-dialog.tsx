import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { STALE, queryKeys } from "@/lib/query-keys";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useClient } from "@/lib/client-context";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, UserCheck } from "lucide-react";
import { CrudDialogShell } from "@/components/crud-dialog-shell";
import { DeleteButton } from "@/components/delete-button";

type Assignment = {
  id: string;
  position_id: string;
  member_id: string;
  start_date: string;
  end_date: string | null;
  is_primary: boolean;
  member_name?: string;
};

type Member = {
  id: string;
  full_name: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  positionId: string;
  positionName: string;
  entityId: string;
};

export function OrgAssignmentsDialog({ open, onOpenChange, positionId, positionName, entityId }: Props) {
  const { canEdit } = useAuth();
  const { withTenant } = useClient();
  const qc = useQueryClient();
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [isPrimary, setIsPrimary] = useState(false);

  const assignments = useQuery({
    queryKey: queryKeys.org.assignments(positionId),
    staleTime: STALE.REFERENCE,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("org_position_assignments")
        .select("id, position_id, member_id, start_date, end_date, is_primary")
        .eq("position_id", positionId);
      if (error) throw error;
      const rows = (data ?? []) as Assignment[];
      if (rows.length === 0) return rows;
      const memberIds = [...new Set(rows.map((r) => r.member_id))];
      const { data: members } = await supabase
        .from("org_members")
        .select("id, full_name")
        .in("id", memberIds);
      const memberMap = new Map((members ?? []).map((m: Member) => [m.id, m.full_name]));
      return rows.map((r) => ({ ...r, member_name: memberMap.get(r.member_id) ?? "—" }));
    },
    enabled: open && !!positionId,
  });

  const availableMembers = useQuery({
    queryKey: ["org-members-available", entityId],
    staleTime: STALE.REFERENCE,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("org_members")
        .select("id, full_name")
        .eq("entity_id", entityId)
        .order("full_name");
      if (error) throw error;
      return (data ?? []) as Member[];
    },
    enabled: open && !!entityId,
  });

  const resetForm = () => {
    setSelectedMemberId("");
    setIsPrimary(false);
  };

  const assign = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!canEdit) { toast.error("Sin permisos"); return; }
    if (!selectedMemberId) { toast.error("Selecciona un miembro"); return; }

    const alreadyAssigned = (assignments.data ?? []).some((a) => a.member_id === selectedMemberId && !a.end_date);
    if (alreadyAssigned) { toast.error("Ese miembro ya está asignado a este cargo"); return; }

    const payload = withTenant({
      position_id: positionId,
      member_id: selectedMemberId,
      start_date: new Date().toISOString().slice(0, 10),
      is_primary: isPrimary,
    });
    const { error } = await supabase.from("org_position_assignments").insert(payload);
    if (error) { toast.error(error.message); return; }
    toast.success("Asignado");
    resetForm();
    qc.invalidateQueries({ queryKey: queryKeys.org.assignments(positionId) });
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("org_position_assignments").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Asignación eliminada");
    qc.invalidateQueries({ queryKey: queryKeys.org.assignments(positionId) });
  };

  const assignedIds = new Set((assignments.data ?? []).map((a) => a.member_id));

  return (
    <CrudDialogShell
      open={open}
      onOpenChange={(o) => { onOpenChange(o); if (!o) resetForm(); }}
      title={`Asignaciones · ${positionName}`}
      icon={<UserCheck className="h-4 w-4" />}
    >
      <div className="rounded-lg border bg-card">
        <ul className="max-h-[360px] divide-y overflow-auto">
          {(assignments.data ?? []).map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-2 px-3 py-2">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span className="text-sm">{a.member_name}</span>
                {a.is_primary && <span className="text-[10px] font-semibold uppercase text-primary">Principal</span>}
                <span className="text-xs text-muted-foreground">
                  ({a.start_date}{a.end_date ? ` → ${a.end_date}` : " → presente"})
                </span>
              </div>
              {canEdit && (
                <DeleteButton
                  name={a.member_name ?? "—"}
                  onDelete={() => remove(a.id)}
                  title="¿Desasignar?"
                  description={`${a.member_name} dejará de estar en este cargo.`}
                  aria-label="Desasignar"
                />
              )}
            </li>
          ))}
          {!assignments.isLoading && (assignments.data ?? []).length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-muted-foreground">Sin personas asignadas a este cargo.</li>
          )}
        </ul>
      </div>

      {canEdit && (
        <form onSubmit={assign} className="space-y-3 rounded-lg border bg-muted/30 p-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Asignar miembro
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Miembro</Label>
            <Select value={selectedMemberId} onValueChange={setSelectedMemberId}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar..." />
              </SelectTrigger>
              <SelectContent>
                {(availableMembers.data ?? [])
                  .filter((m) => !assignedIds.has(m.id))
                  .map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={isPrimary} onChange={(e) => setIsPrimary(e.target.checked)} />
            Cargo principal
          </label>
          <Button type="submit" size="sm" className="w-full">
            <Plus className="mr-1 h-3.5 w-3.5" /> Asignar
          </Button>
        </form>
      )}
    </CrudDialogShell>
  );
}
