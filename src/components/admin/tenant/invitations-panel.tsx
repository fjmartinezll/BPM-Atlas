import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
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
const roleInviteLabel = (t: (k: string) => string, r: string) => {
  const map: Record<string, string> = {
    administrador: t("adminMembers.roleAdmin"),
    dueno_proceso: t("adminMembers.roleProcessOwner"),
    participante: t("adminMembers.roleParticipant"),
    auditor: t("adminMembers.roleAuditor"),
  };
  return map[r] ?? r;
};
const invitationStateLabel = (t: (k: string) => string, state: string) => {
  const map: Record<string, string> = {
    aceptada: t("adminInvitations.stateAccepted"),
    revocada: t("adminInvitations.stateRevoked"),
    caducada: t("adminInvitations.stateExpired"),
    pendiente: t("adminInvitations.statePending"),
    accepted: t("adminInvitations.stateAccepted"),
    revoked: t("adminInvitations.stateRevoked"),
    expired: t("adminInvitations.stateExpired"),
    pending: t("adminInvitations.statePending"),
  };
  return map[state] ?? state;
};

export function TenantInvitationsPanel() {
  const { t } = useTranslation();
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
      toast.success(t("adminInvitations.invitationSent"));
      setEmail("");
      qc.invalidateQueries({ queryKey: ["tenant-invitations", tenantId] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Error"),
  });

  const revokeMu = useMutation({
    mutationFn: (id: string) => revokeFn({ data: { clientId: tenantId!, invitationId: id } }),
    onSuccess: () => {
      toast.success(t("adminInvitations.invitationRevoked"));
      qc.invalidateQueries({ queryKey: ["tenant-invitations", tenantId] });
    },
  });

  if (!tenantId) return <div className="text-sm text-muted-foreground">{t("adminInvitations.noTenant")}</div>;

  return (
    <div className="space-y-4 max-w-3xl">
      <Card>
        <CardHeader><CardTitle className="text-base">{t("adminInvitations.titleCreate")}</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <Label>{t("adminInvitations.emailLabel")}</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("adminInvitations.emailPlaceholder")} />
          </div>
          <div className="w-48">
            <Label>{t("adminInvitations.roleLabel")}</Label>
            <Select value={role} onValueChange={(v) => setRole(v as AppRole)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {INVITE_ROLES.map((r) => <SelectItem key={r} value={r}>{roleInviteLabel(t, r)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={() => createMu.mutate()} disabled={!email.trim() || createMu.isPending}>
            <Send className="h-4 w-4 mr-1.5" /> {t("adminInvitations.sendButton")}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">{t("adminInvitations.titleList")}</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {(q.data ?? []).length === 0 && <div className="text-sm text-muted-foreground">{t("adminInvitations.emptyList")}</div>}
          {(q.data ?? []).map((inv: any) => {
            const expired = new Date(inv.expires_at).getTime() < Date.now();
            const state = inv.accepted_at ? "aceptada" : inv.revoked_at ? "revocada" : expired ? "caducada" : "pendiente";
            return (
              <div key={inv.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{inv.email}</div>
                  <div className="text-xs text-muted-foreground">
                    {roleInviteLabel(t, inv.role) || inv.role} · <Badge variant="outline" className="text-[10px]">{invitationStateLabel(t, state)}</Badge>
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
