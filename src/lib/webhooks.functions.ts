import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type WebhookIntegrationRow = {
  id: string;
  executable_element_id: string;
  provider: string | null;
  external_ref: string | null;
  url: string | null;
  notes: string | null;
  webhook_url: string | null;
  webhook_secret: string | null;
  payload_template: string | null;
  element_name: string | null;
  element_kind: string | null;
};

/** Lista las integraciones del cliente actual. RLS filtra por client_id. */
export const listWebhookIntegrations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<WebhookIntegrationRow[]> => {
    const { supabase } = context;
    const { data, error } = await (supabase
      .from("executable_element_integrations") as any)
      .select(
        "id, executable_element_id, provider, external_ref, url, notes, webhook_url, webhook_secret, payload_template, executable_elements(name, kind)",
      )
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return ((data ?? []) as any[]).map((r: any) => ({
      id: r.id,
      executable_element_id: r.executable_element_id,
      provider: r.provider,
      external_ref: r.external_ref,
      url: r.url,
      notes: r.notes,
      webhook_url: r.webhook_url,
      webhook_secret: r.webhook_secret,
      payload_template:
        r.payload_template == null
          ? null
          : typeof r.payload_template === "string"
            ? r.payload_template
            : JSON.stringify(r.payload_template),
      element_name: r.executable_elements?.name ?? null,
      element_kind: r.executable_elements?.kind ?? null,
    }));
  });

const updateSchema = z.object({
  id: z.string().uuid(),
  webhook_url: z.string().nullable().optional(),
  webhook_secret: z.string().nullable().optional(),
  payload_template: z.string().nullable().optional(),
});

export const updateWebhookIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => updateSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const patch: {
      webhook_url?: string | null;
      webhook_secret?: string | null;
      payload_template?: unknown | null;
    } = {};
    if (data.webhook_url !== undefined) patch.webhook_url = data.webhook_url || null;
    if (data.webhook_secret !== undefined) patch.webhook_secret = data.webhook_secret || null;
    if (data.payload_template !== undefined) {
      if (!data.payload_template) patch.payload_template = null;
      else {
        try {
          patch.payload_template = JSON.parse(data.payload_template);
        } catch {
          throw new Error("payload_template no es JSON válido");
        }
      }
    }
    const { error } = await supabase
      .from("executable_element_integrations")
      .update(patch as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const triggerSchema = z.object({
  id: z.string().uuid(),
  payload: z.record(z.unknown()).optional(),
});

/**
 * Ejecuta el webhook configurado. POST JSON al endpoint externo (n8n/Make/Zapier).
 * Si hay webhook_secret, añade cabecera x-webhook-signature con HMAC-SHA256.
 */
export const triggerWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => triggerSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await (supabase
      .from("executable_element_integrations") as any)
      .select("webhook_url, webhook_secret, payload_template, executable_element_id")
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);
    const r = row as any;
    if (!r?.webhook_url) throw new Error("Esta integración no tiene webhook_url configurada");

    const payload = {
      integration_id: data.id,
      executable_element_id: r.executable_element_id,
      triggered_by: userId,
      triggered_at: new Date().toISOString(),
      template: r.payload_template ?? null,
      ...(data.payload ?? {}),
    };
    const body = JSON.stringify(payload);

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (r.webhook_secret) {
      const { createHmac } = await import("crypto");
      const sig = createHmac("sha256", r.webhook_secret).update(body).digest("hex");
      headers["x-webhook-signature"] = sig;
    }

    const started = Date.now();
    try {
      const { assertSafePublicUrl } = await import("./safe-fetch.server");
      const safeUrl = await assertSafePublicUrl(r.webhook_url);
      const resp = await fetch(safeUrl.toString(), {
        method: "POST",
        headers,
        body,
        redirect: "error",
      });
      const latency = Date.now() - started;
      const text = await resp.text().catch(() => "");
      return {
        ok: resp.ok,
        status: resp.status,
        latency_ms: latency,
        response: text.slice(0, 500),
      };
    } catch (e) {
      return {
        ok: false,
        status: 0,
        latency_ms: Date.now() - started,
        response: e instanceof Error ? e.message : String(e),
      };
    }
  });
