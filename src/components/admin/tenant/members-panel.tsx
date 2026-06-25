import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { KeyRound, MailCheck, ShieldAlert, Trash2, Search } from "lucide-react";
import {
  listTenantMembers,
  setUserRoleInTenant,
  removeUserFromTenant,
  sendPasswordResetForUser,
  resendEmailVerification,
  type TenantMember,
} from "@/lib/tenant-admin.functions";
import { STALE } from "@/lib/query-keys";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useActiveTenant } from "./use-active-tenant";

type AppRole = "administrador" | "dueno_proceso" | "participante" | "auditor";
const ALL_ROLES: AppRole[] = ["administrador", "dueno_proceso", "participante", "auditor"];
const roleLabel = (t: (k: string) => string, r: AppRole) => {
  const map: Record<AppRole, string> = {
    administrador: t("adminMembers.roleAdmin"),
    dueno_proceso: t("adminMembers.roleProcessOwner"),
    participante: t("adminMembers.roleParticipant"),
    auditor: t("adminMembers.roleAuditor"),
  };
  return map[r];
};
export function TenantMembersPanel() {
  const { t } = useTranslation();
  const { tenant } = useActiveTenant();
  const tenantId = tenant?.id;
  const qc = useQueryClient();
  const { user } = useAuth();
  const listFn = useServerFn(listTenantMembers);
  const setRoleFn = useServerFn(setUserRoleInTenant);
  const removeFn = useServerFn(removeUserFromTenant);
  const resetFn = useServerFn(sendPasswordResetForUser);
  const verifyFn = useServerFn(resendEmailVerification);

  const q = useQuery({
    queryKey: ["tenant-members", tenantId],
    staleTime: STALE.REFERENCE,
    enabled: !!tenantId,
    queryFn: () => listFn({ data: { clientId: tenantId! } }),
  });

  const setRoleMu = useMutation({
    mutationFn: (v: { userId: string; role: AppRole }) =>
      setRoleFn({ data: { clientId: tenantId!, userId: v.userId, role: v.role } }),
    onSuccess: () => {
      toast.success(t("adminMembers.roleUpdated"));
      qc.invalidateQueries({ queryKey: ["tenant-members", tenantId] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Error"),
  });

  const removeMu = useMutation({
    mutationFn: (userId: string) => removeFn({ data: { clientId: tenantId!, userId } }),
    onSuccess: () => {
      toast.success(t("adminMembers.userRemoved"));
      qc.invalidateQueries({ queryKey: ["tenant-members", tenantId] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Error"),
  });

  const resetMu = useMutation({
    mutationFn: (userId: string) => resetFn({ data: { clientId: tenantId!, userId } }),
    onSuccess: () => toast.success(t("adminMembers.resetSent")),
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Error"),
  });

  const verifyMu = useMutation({
    mutationFn: (userId: string) => verifyFn({ data: { clientId: tenantId!, userId } }),
    onSuccess: (res: any) =>
      res?.alreadyVerified
        ? toast.info(t("adminMembers.alreadyVerified"))
        : toast.success(t("adminMembers.verificationSent")),
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Error"),
  });

  if (!tenantId) return <div className="text-sm text-muted-foreground">{t("adminMembers.noTenant")}</div>;

  const members: TenantMember[] = q.data ?? [];

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | AppRole | "none">("all");

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return members.filter((m) => {
      if (s) {
        const hay = `${m.email ?? ""} ${m.full_name ?? ""}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      if (roleFilter === "all") return true;
      if (roleFilter === "none") return !m.role;
      return m.role === roleFilter;
    });
  }, [members, search, roleFilter]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: members.length, none: 0 };
    ALL_ROLES.forEach((r) => (c[r] = 0));
    members.forEach((m) => {
      if (!m.role) c.none++;
      else c[m.role] = (c[m.role] ?? 0) + 1;
    });
    return c;
  }, [members]);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-base">
            {t("adminMembers.title")}
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {t("adminMembers.ofCount", { filtered: filtered.length, total: members.length })}
            </span>
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("adminMembers.searchPlaceholder")}
                className="pl-8 h-9 w-64"
              />
            </div>
            <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v as typeof roleFilter)}>
              <SelectTrigger className="h-9 w-52 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("adminMembers.allRoles", { count: counts.all })}</SelectItem>
                <SelectItem value="none">{t("adminMembers.noRoleFilter", { count: counts.none })}</SelectItem>
                {ALL_ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {roleLabel(t, r)} ({counts[r] ?? 0})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {q.isLoading && <div className="text-sm text-muted-foreground">{t("common.loading")}</div>}
          {!q.isLoading && members.length === 0 && (
            <div className="text-sm text-muted-foreground">
              {t("adminMembers.noMembers")}
            </div>
          )}
          {!q.isLoading && members.length > 0 && filtered.length === 0 && (
            <div className="text-sm text-muted-foreground">{t("adminMembers.noFilterResults")}</div>
          )}
          {filtered.map((m) => {
            const isSelf = m.user_id === user?.id;
            return (
              <div key={m.user_id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">
                    {m.full_name || m.email || m.user_id}
                    {isSelf && <Badge variant="outline" className="ml-2 text-[10px]">{t("adminMembers.you")}</Badge>}
                  </div>
                  {m.email && <div className="text-xs text-muted-foreground truncate">{m.email}</div>}
                </div>

                <div className="flex items-center gap-2">
                  <Select
                    value={m.role ?? ""}
                    onValueChange={(v) => setRoleMu.mutate({ userId: m.user_id, role: v as AppRole })}
                    disabled={setRoleMu.isPending}
                  >
                    <SelectTrigger className="h-8 w-44 text-xs">
                      <SelectValue placeholder={t("adminMembers.selectNoRole")} />
                    </SelectTrigger>
                    <SelectContent>
                      {ALL_ROLES.map((r) => <SelectItem key={r} value={r}>{roleLabel(t, r)}</SelectItem>)}
                    </SelectContent>
                  </Select>

                  <Button size="sm" variant="ghost" title={t("adminMembers.resetPasswordTitle")}
                    onClick={() => resetMu.mutate(m.user_id)} disabled={resetMu.isPending || !m.email}>
                    <KeyRound className="h-3.5 w-3.5" />
                  </Button>

                  <Button size="sm" variant="ghost" title={t("adminMembers.resendVerificationTitle")}
                    onClick={() => verifyMu.mutate(m.user_id)} disabled={verifyMu.isPending || !m.email}>
                    <MailCheck className="h-3.5 w-3.5" />
                  </Button>

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" variant="ghost" title={t("adminMembers.removeTitleShort")} disabled={removeMu.isPending || isSelf}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t("adminMembers.removeTitle", { name: m.full_name || m.email })}</AlertDialogTitle>
                        <AlertDialogDescription>
                          {t("adminMembers.removeDesc")}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{t("actions.cancel")}</AlertDialogCancel>
                        <AlertDialogAction onClick={() => removeMu.mutate(m.user_id)}>{t("adminMembers.removeAction")}</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            );
          })}

          <div className="flex items-start gap-2 rounded-md border border-dashed p-3 text-xs text-muted-foreground">
            <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              {t("adminMembers.securityNote")}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
