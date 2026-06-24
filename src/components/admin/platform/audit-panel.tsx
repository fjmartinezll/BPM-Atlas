import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { listTenantAuditLog } from "@/lib/tenant-admin.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { History, Globe, Building2 } from "lucide-react";
import { useActiveTenant } from "../tenant/use-active-tenant";

type GlobalRow = {
  id: string; actor_id: string | null; entity_table: string;
  entity_id: string | null; action: string; created_at: string; diff: unknown;
};

const TABLE_LABEL: Record<string, string> = {
  clients: "Tenant", user_roles: "Roles", user_clients: "Miembros",
  tenant_invitations: "Invitaciones", tenant_join_requests: "Solicitudes",
};

function TenantScope() {
  const { tenant } = useActiveTenant();
  const tenantId = tenant?.id;
  const listFn = useServerFn(listTenantAuditLog);
  const q = useQuery({
    queryKey: ["tenant-audit", tenantId],
    enabled: !!tenantId,
    queryFn: () => listFn({ data: { clientId: tenantId!, limit: 100 } }),
  });
  if (!tenantId) return <div className="text-sm text-muted-foreground">Sin tenant asignado.</div>;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2"><Building2 className="h-4 w-4" /> Cambios del tenant activo</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {q.isLoading && <div className="text-sm text-muted-foreground">Cargando…</div>}
        {!q.isLoading && (q.data ?? []).length === 0 && (
          <div className="text-sm text-muted-foreground">Sin actividad registrada.</div>
        )}
        {(q.data ?? []).map((row: any) => (
          <div key={row.id} className="flex items-center justify-between gap-3 rounded border px-3 py-1.5 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <Badge variant="outline" className="text-[10px]">{TABLE_LABEL[row.entity_table] || row.entity_table}</Badge>
              <span className="text-muted-foreground">{row.action}</span>
              <span className="truncate font-mono text-[10px] opacity-60">{row.entity_id}</span>
            </div>
            <span className="text-muted-foreground shrink-0">{new Date(row.created_at).toLocaleString()}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function GlobalScope() {
  const q = useQuery({
    queryKey: ["changelog-global"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).from("change_log")
        .select("*").order("created_at", { ascending: false }).limit(500);
      if (error) throw error;
      return (data ?? []) as GlobalRow[];
    },
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2"><Globe className="h-4 w-4" /> Últimos 500 cambios globales</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ul className="divide-y">
          {(q.data ?? []).map((r) => (
            <li key={r.id} className="flex items-start gap-4 px-4 py-3">
              <Badge
                variant={r.action === "DELETE" ? "destructive" : r.action === "INSERT" ? "default" : "secondary"}
                className="shrink-0"
              >
                {r.action}
              </Badge>
              <div className="min-w-0 flex-1">
                <div className="text-sm">
                  <span className="font-mono text-xs text-muted-foreground">{r.entity_table}</span>{" · "}
                  <span className="font-mono text-[10px] text-muted-foreground">{r.entity_id?.slice(0, 8)}</span>
                </div>
                <div className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</div>
              </div>
            </li>
          ))}
          {!q.isLoading && (q.data ?? []).length === 0 && (
            <li className="px-4 py-6 text-sm text-muted-foreground">Sin cambios registrados.</li>
          )}
        </ul>
      </CardContent>
    </Card>
  );
}

export function PlatformAuditPanel() {
  const [scope, setScope] = useState<"tenant" | "global">("tenant");
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <History className="h-5 w-5 text-muted-foreground" />
        <Tabs value={scope} onValueChange={(v) => setScope(v as any)}>
          <TabsList>
            <TabsTrigger value="tenant">Tenant activo</TabsTrigger>
            <TabsTrigger value="global">Todos los tenants</TabsTrigger>
          </TabsList>
          <TabsContent value="tenant" className="mt-4"><TenantScope /></TabsContent>
          <TabsContent value="global" className="mt-4"><GlobalScope /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
