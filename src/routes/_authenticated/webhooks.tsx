import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Webhook, Play, Save, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import {
  listWebhookIntegrations,
  updateWebhookIntegration,
  triggerWebhook,
  type WebhookIntegrationRow,
} from "@/lib/webhooks.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/webhooks")({
  component: WebhooksPage,
});

function WebhooksPage() {
  const listFn = useServerFn(listWebhookIntegrations);
  const q = useQuery({ queryKey: ["webhook-integrations"], queryFn: () => listFn() });

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Webhook className="h-6 w-6" /> Webhooks de tareas ejecutables
        </h1>
        <p className="text-sm text-muted-foreground">
          Conecta cada elemento ejecutable con un workflow externo (n8n, Make, Zapier). La
          aplicación hará POST al webhook cuando se dispare la tarea.
        </p>
      </div>

      {q.isLoading && <div className="text-sm">Cargando…</div>}
      {q.data?.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No hay integraciones para el cliente actual. Crea elementos ejecutables en el
            modelador y vuelve aquí.
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {(q.data ?? []).map((row) => (
          <WebhookCard key={row.id} row={row} />
        ))}
      </div>
    </div>
  );
}

function WebhookCard({ row }: { row: WebhookIntegrationRow }) {
  const queryClient = useQueryClient();
  const updateFn = useServerFn(updateWebhookIntegration);
  const triggerFn = useServerFn(triggerWebhook);

  const [url, setUrl] = useState(row.webhook_url ?? "");
  const [secret, setSecret] = useState(row.webhook_secret ?? "");
  const [tpl, setTpl] = useState(row.payload_template ?? "");
  const [lastResult, setLastResult] = useState<{
    ok: boolean;
    status: number;
    latency_ms: number;
    response: string;
  } | null>(null);

  const saveMu = useMutation({
    mutationFn: () =>
      updateFn({
        data: {
          id: row.id,
          webhook_url: url || null,
          webhook_secret: secret || null,
          payload_template: tpl || null,
        },
      }),
    onSuccess: () => {
      toast.success("Guardado");
      queryClient.invalidateQueries({ queryKey: ["webhook-integrations"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Error"),
  });

  const runMu = useMutation({
    mutationFn: () => triggerFn({ data: { id: row.id } }),
    onSuccess: (r) => {
      setLastResult(r);
      if (r.ok) toast.success(`Webhook OK (${r.status}, ${r.latency_ms}ms)`);
      else toast.error(`Webhook fallo (${r.status})`);
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Error"),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <span className="truncate">{row.element_name ?? "Elemento sin nombre"}</span>
          {row.element_kind && (
            <Badge variant="outline" className="text-[10px]">
              {row.element_kind}
            </Badge>
          )}
          {row.provider && (
            <Badge variant="secondary" className="text-[10px]">
              {row.provider}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <Label className="text-xs">Webhook URL (n8n / Make / Zapier)</Label>
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://hook.example.com/abc123"
          />
        </div>
        <div>
          <Label className="text-xs">Secret (opcional · firma HMAC-SHA256)</Label>
          <Input
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="••••••••"
          />
        </div>
        <div>
          <Label className="text-xs">Payload template JSON (opcional)</Label>
          <Textarea
            value={tpl}
            onChange={(e) => setTpl(e.target.value)}
            rows={3}
            placeholder='{"campo":"valor"}'
            className="font-mono text-xs"
          />
        </div>

        <div className="flex gap-2">
          <Button size="sm" onClick={() => saveMu.mutate()} disabled={saveMu.isPending}>
            <Save className="h-3.5 w-3.5 mr-1" /> Guardar
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => runMu.mutate()}
            disabled={runMu.isPending || !url}
          >
            <Play className="h-3.5 w-3.5 mr-1" /> Probar
          </Button>
        </div>

        {lastResult && (
          <div
            className={`rounded-md border p-2 text-xs ${
              lastResult.ok
                ? "border-emerald-500/40 bg-emerald-500/5"
                : "border-destructive/40 bg-destructive/5"
            }`}
          >
            <div className="flex items-center gap-1 font-medium">
              {lastResult.ok ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              ) : (
                <XCircle className="h-3.5 w-3.5 text-destructive" />
              )}
              HTTP {lastResult.status} · {lastResult.latency_ms} ms
            </div>
            {lastResult.response && (
              <pre className="mt-1 whitespace-pre-wrap break-all opacity-80">
                {lastResult.response}
              </pre>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
