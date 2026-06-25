import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { UserCheck, UserX } from "lucide-react";
import { listJoinRequests, resolveJoinRequest } from "@/lib/tenant-admin.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useActiveTenant } from "./use-active-tenant";

export function TenantRequestsPanel() {
  const { t } = useTranslation();
  const { tenant } = useActiveTenant();
  const tenantId = tenant?.id;
  const qc = useQueryClient();
  const listFn = useServerFn(listJoinRequests);
  const resolveFn = useServerFn(resolveJoinRequest);

  const q = useQuery({
    queryKey: ["tenant-join-requests", tenantId],
    enabled: !!tenantId,
    queryFn: () => listFn({ data: { clientId: tenantId! } }),
  });

  const muRef = useMutation({
    mutationFn: (v: { id: string; approve: boolean }) =>
      resolveFn({ data: { clientId: tenantId!, requestId: v.id, approve: v.approve } }),
    onSuccess: () => {
      toast.success(t("adminRequests.requestUpdated"));
      qc.invalidateQueries({ queryKey: ["tenant-join-requests", tenantId] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Error"),
  });

  if (!tenantId) return <div className="text-sm text-muted-foreground">{t("adminRequests.noTenant")}</div>;

  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <CardTitle className="text-base">{t("adminRequests.title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {(q.data ?? []).length === 0 && <div className="text-sm text-muted-foreground">{t("adminRequests.empty")}</div>}
        {(q.data ?? []).map((r: any) => (
          <div key={r.id} className="flex items-center justify-between rounded-md border px-3 py-2">
            <div className="text-sm">{r.email}</div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => muRef.mutate({ id: r.id, approve: true })} disabled={muRef.isPending}>
                <UserCheck className="h-3.5 w-3.5 mr-1" /> {t("adminRequests.approve")}
              </Button>
              <Button size="sm" variant="outline" onClick={() => muRef.mutate({ id: r.id, approve: false })} disabled={muRef.isPending}>
                <UserX className="h-3.5 w-3.5 mr-1" /> {t("adminRequests.reject")}
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
