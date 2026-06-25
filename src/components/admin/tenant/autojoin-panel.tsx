import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Globe } from "lucide-react";
import { updateTenantAutoJoin } from "@/lib/tenant-admin.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useActiveTenant } from "./use-active-tenant";

type AppRole = "administrador" | "dueno_proceso" | "participante" | "auditor";
const JOIN_ROLES: AppRole[] = ["participante", "auditor", "dueno_proceso"];
const roleJoinLabel = (t: (k: string) => string, r: string) => {
  const map: Record<string, string> = {
    administrador: t("adminMembers.roleAdmin"),
    dueno_proceso: t("adminMembers.roleProcessOwner"),
    participante: t("adminMembers.roleParticipant"),
    auditor: t("adminMembers.roleAuditor"),
  };
  return map[r] ?? r;
};

export function TenantAutojoinPanel() {
  const { t } = useTranslation();
  const { tenant, isLoading } = useActiveTenant();
  const qc = useQueryClient();
  const updateFn = useServerFn(updateTenantAutoJoin);
  const tenantData = tenant as any;
  const [domain, setDomain] = useState<string>(tenantData?.email_domain ?? "");
  const [enabled, setEnabled] = useState<boolean>(!!tenantData?.auto_join_enabled);
  const [role, setRole] = useState<AppRole>((tenantData?.auto_join_role as AppRole) ?? "participante");

  const mu = useMutation({
    mutationFn: () =>
      updateFn({
        data: {
          clientId: tenant!.id,
          email_domain: domain.trim() || null,
          auto_join_enabled: enabled,
          auto_join_role: role,
        },
      }),
    onSuccess: () => {
      toast.success(t("adminAutojoin.configUpdated"));
      qc.invalidateQueries({ queryKey: ["my-tenant"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Error"),
  });

  if (isLoading) return <div className="text-sm text-muted-foreground">{t("common.loading")}</div>;
  if (!tenant) return <div className="text-sm text-muted-foreground">{t("adminAutojoin.noTenant")}</div>;

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2"><Globe className="h-4 w-4" /> {t("adminAutojoin.title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {t("adminAutojoin.description")}
        </p>
        <div>
          <Label>{t("adminAutojoin.domainLabel")}</Label>
          <Input placeholder={t("adminAutojoin.domainPlaceholder")} value={domain} onChange={(e) => setDomain(e.target.value)} />
          <p className="text-xs text-muted-foreground mt-1">{t("adminAutojoin.domainHint")}</p>
        </div>
        <div className="flex items-center justify-between rounded-md border p-3">
          <div>
            <div className="text-sm font-medium">{t("adminAutojoin.immediateJoin")}</div>
            <div className="text-xs text-muted-foreground">
              {t("adminAutojoin.immediateJoinHint")}
            </div>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} disabled={!domain.trim()} />
        </div>
        <div>
          <Label>{t("adminAutojoin.defaultRoleLabel")}</Label>
          <Select value={role} onValueChange={(v) => setRole(v as AppRole)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {JOIN_ROLES.map((r) => <SelectItem key={r} value={r}>{roleJoinLabel(t, r)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => mu.mutate()} disabled={mu.isPending}>{t("adminAutojoin.saveButton")}</Button>
      </CardContent>
    </Card>
  );
}
