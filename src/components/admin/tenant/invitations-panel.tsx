import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Send, Trash2 } from "lucide-react";
import {
  listTenantInvitations,
  createTenantInvitation,
  revokeTenantInvitation,
} from "@/lib/tenant-admin.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useActiveTenant } from "./use-active-tenant";

type AppRole = "administrador" | "dueno_proceso" | "participante" | "auditor";
const INVITE_ROLES: AppRole[] = ["administrador", "dueno_proceso", "participante", "auditor"];
const ROLE_LABEL: Record<string, string> = {
  administrador: "Administrador",
  dueno_proceso: "Dueño de proceso",
  participante: "Participante",
  auditor: "Auditor",
};

export function TenantInvitationsPanel() {
  const { tenant } = useActiveTenant();
  const tenantId = tenant?.id;
  const qc = useQueryClient();
  const listFn = useServerFn(listTenantInvitations);
  const createFn = useServerFn(createTenantInvitation);
  const revokeFn = useServerFn(revokeTenantInvitation);

  const q = useQuery({
    queryKey: ["tenant-invitations", tenantId],
    enabled: !!tenantId,
    queryFn: () => listFn({ data: { clientId: tenantId! } }),
  });

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AppRole>("participante");

  const createMu = useMutation({
    mutationFn: () => createFn({ data: { clientId: tenantId!, email, role } }),
    onSuccess: () => {
      toast.success("Invitación enviada");
      setEmail("");
      qc.invalidateQueries({ queryKey: ["tenant-invitations", tenantId] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Error"),
  });

  const revokeMu = useMutation({
    mutationFn: (id: string) => revokeFn({ data: { clientId: tenantId!, invitationId: id } }),
    onSuccess: () => {
      toast.success("Invitación revocada");
      qc.invalidateQueries({ queryKey: ["tenant-invitations", tenantId] });
    },
  });

  if (!tenantId) return <div className="text-sm text-muted-foreground">Sin tenant asignado.</div>;

  return (
    <div className="space-y-4 max-w-3xl">
      <Card>
        <CardHeader><CardTitle className="text-base">Invitar a un nuevo miembro</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nombre@empresa.com" />
          </div>
          <div className="w-48">
            <Label>Rol</Label>
            <Select value={role} onValueChange={(v) => setRole(v as AppRole)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {INVITE_ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={() => createMu.mutate()} disabled={!email.trim() || createMu.isPending}>
            <Send className="h-4 w-4 mr-1.5" /> Enviar
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Invitaciones</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {(q.data ?? []).length === 0 && <div className="text-sm text-muted-foreground">Sin invitaciones aún.</div>}
          {(q.data ?? []).map((inv: any) => {
            const expired = new Date(inv.expires_at).getTime() < Date.now();
            const state = inv.accepted_at ? "aceptada" : inv.revoked_at ? "revocada" : expired ? "caducada" : "pendiente";
            return (
              <div key={inv.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{inv.email}</div>
                  <div className="text-xs text-muted-foreground">
                    {ROLE_LABEL[inv.role] || inv.role} · <Badge variant="outline" className="text-[10px]">{state}</Badge>
                  </div>
                </div>
                {state === "pendiente" && (
                  <Button size="sm" variant="ghost" onClick={() => revokeMu.mutate(inv.id)} disabled={revokeMu.isPending}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
