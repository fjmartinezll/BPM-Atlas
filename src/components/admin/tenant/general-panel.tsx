import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { upsertClient, type ClientRow } from "@/lib/clients.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useActiveTenant } from "./use-active-tenant";

export function TenantGeneralPanel() {
  const { tenant, isLoading } = useActiveTenant();
  const qc = useQueryClient();
  const upsertFn = useServerFn(upsertClient);
  const [form, setForm] = useState<Partial<ClientRow>>({});

  useEffect(() => {
    if (tenant) setForm(tenant);
  }, [tenant?.id]);

  const upsertMu = useMutation({
    mutationFn: (payload: Partial<ClientRow>) =>
      upsertFn({
        data: {
          id: payload.id,
          name: payload.name ?? "",
          code: payload.code ?? null,
          notes: payload.notes ?? null,
          active: payload.active ?? true,
        },
      }),
    onSuccess: () => {
      toast.success("Tenant actualizado");
      qc.invalidateQueries({ queryKey: ["my-tenant"] });
      qc.invalidateQueries({ queryKey: ["my-clients"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Error"),
  });

  if (isLoading) return <div className="text-sm text-muted-foreground">Cargando…</div>;
  if (!tenant) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          No tienes ningún tenant asignado. Contacta con el soporte de la plataforma.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Ficha del tenant</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 max-w-xl">
        <div>
          <Label>Nombre *</Label>
          <Input value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <Label>Código corto</Label>
          <Input value={form.code ?? ""} onChange={(e) => setForm({ ...form, code: e.target.value || null })} />
        </div>
        <div>
          <Label>Notas</Label>
          <Textarea value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value || null })} rows={3} />
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={form.active ?? true} onCheckedChange={(c) => setForm({ ...form, active: c })} />
          <Label>Activo</Label>
        </div>
        <div className="pt-2">
          <Button onClick={() => upsertMu.mutate(form)} disabled={upsertMu.isPending || !form.name?.trim()}>
            Guardar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
