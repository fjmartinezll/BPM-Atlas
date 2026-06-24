import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
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
const ROLE_LABEL: Record<string, string> = {
  administrador: "Administrador",
  dueno_proceso: "Dueño de proceso",
  participante: "Participante",
  auditor: "Auditor",
};

export function TenantAutojoinPanel() {
  const { tenant, isLoading } = useActiveTenant();
  const qc = useQueryClient();
  const updateFn = useServerFn(updateTenantAutoJoin);
  const t = tenant as any;
  const [domain, setDomain] = useState<string>(t?.email_domain ?? "");
  const [enabled, setEnabled] = useState<boolean>(!!t?.auto_join_enabled);
  const [role, setRole] = useState<AppRole>((t?.auto_join_role as AppRole) ?? "participante");

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
      toast.success("Configuración actualizada");
      qc.invalidateQueries({ queryKey: ["my-tenant"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Error"),
  });

  if (isLoading) return <div className="text-sm text-muted-foreground">Cargando…</div>;
  if (!tenant) return <div className="text-sm text-muted-foreground">Sin tenant asignado.</div>;

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2"><Globe className="h-4 w-4" /> Auto-unión por dominio</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Cuando alguien se registre con un email del dominio que indiques aquí, podrá unirse
          automáticamente a este tenant o quedará como solicitud pendiente para que la apruebes.
        </p>
        <div>
          <Label>Dominio del email corporativo</Label>
          <Input placeholder="ejemplo: acme.com" value={domain} onChange={(e) => setDomain(e.target.value)} />
          <p className="text-xs text-muted-foreground mt-1">Sin "@". Deja vacío para desactivar la detección por dominio.</p>
        </div>
        <div className="flex items-center justify-between rounded-md border p-3">
          <div>
            <div className="text-sm font-medium">Permitir auto-unión inmediata</div>
            <div className="text-xs text-muted-foreground">
              Si está desactivado, los registros entrantes quedan como solicitudes pendientes.
            </div>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} disabled={!domain.trim()} />
        </div>
        <div>
          <Label>Rol por defecto al unirse</Label>
          <Select value={role} onValueChange={(v) => setRole(v as AppRole)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {JOIN_ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => mu.mutate()} disabled={mu.isPending}>Guardar</Button>
      </CardContent>
    </Card>
  );
}
