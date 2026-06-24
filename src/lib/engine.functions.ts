import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertTenantAccess } from "@/lib/tenant-admin.guards";
import {
  type DefNode,
  type DefEdge,
  ensureCanEdit,
  logEvent,
  advance,
} from "./engine.server";

// ---------- server functions ----------
export const publishDefinition = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    diagramId: z.string().uuid(),
    nodes: z.array(z.any()).optional(),
    edges: z.array(z.any()).optional(),
    entityId: z.string().uuid().nullish(),
    clientId: z.string().uuid().nullish(),
    environment: z.enum(["produccion", "pruebas"]).nullish(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureCanEdit(context);
    if (data.clientId) {
      await assertTenantAccess(context.supabase, context.userId, data.clientId);
    }
    const { supabase, userId } = context;
    const { data: diag, error } = await supabase
      .from("process_diagrams")
      .select("id, name, nodes, edges, parent_table, parent_id, entity_id, client_id, environment")
      .eq("id", data.diagramId).single();
    if (error || !diag) throw new Error(error?.message ?? "Diagrama no encontrado");

    // Make sure the diagram is associated with the active sidebar selection
    // (entity, tenant, environment). Diagram is the source of truth used by
    // the engine listings to group by entity/client/environment.
    const diagPatch: { entity_id?: string; client_id?: string; environment?: "produccion" | "pruebas" } = {};
    if (data.entityId && diag.entity_id !== data.entityId) diagPatch.entity_id = data.entityId;
    if (data.clientId && !diag.client_id) diagPatch.client_id = data.clientId;
    if (data.environment && !diag.environment) diagPatch.environment = data.environment;
    if (Object.keys(diagPatch).length) {
      const { error: uErr } = await supabase
        .from("process_diagrams").update(diagPatch).eq("id", diag.id);
      if (uErr) throw new Error(uErr.message);
    }


    const effectiveClientId = diagPatch.client_id ?? diag.client_id ?? data.clientId ?? null;
    const effectiveEnv = diagPatch.environment ?? diag.environment ?? data.environment ?? null;


    const { data: last } = await supabase
      .from("process_definitions").select("version")
      .eq("diagram_id", diag.id).order("version", { ascending: false }).limit(1).maybeSingle();
    const nextVersion = (last?.version ?? 0) + 1;

    const publishedNodes = data.nodes ?? diag.nodes ?? [];
    const publishedEdges = data.edges ?? diag.edges ?? [];

    // New definitions are created as "inactive": the user must explicitly
    // activate them from the engine view. Previous active versions are left
    // untouched so a publish doesn't silently disable a running version.
    const { data: ins, error: insErr } = await supabase.from("process_definitions").insert({
      diagram_id: diag.id,
      process_id: diag.parent_table === "processes" ? diag.parent_id : null,
      version: nextVersion,
      name: diag.name ?? "Sin nombre",
      nodes: publishedNodes as never,
      edges: publishedEdges as never,
      status: "inactive",
      published_by: userId,
      client_id: effectiveClientId,
      environment: effectiveEnv,
    }).select("id, version").single();
    if (insErr) throw new Error(insErr.message);
    return ins;
  });




export const listDefinitions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      clientId: z.string().uuid().optional(),
      environment: z.enum(["produccion", "pruebas"]).optional(),
      entityId: z.string().uuid().optional(),
    }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.clientId) {
      await assertTenantAccess(supabase, userId, data.clientId);
    }
    let diagIds: string[] | null = null;
    if (data.entityId) {
      let dq = supabase.from("process_diagrams").select("id").eq("entity_id", data.entityId);
      if (data.clientId) dq = dq.eq("client_id", data.clientId);
      const { data: drows, error: derr } = await dq;
      if (derr) throw new Error(derr.message);
      diagIds = (drows ?? []).map((r) => r.id as string);
      if (diagIds.length === 0) return [];
    }
    let q = supabase
      .from("process_definitions")
      .select("id, name, version, status, published_at, published_by, diagram_id")
      .order("published_at", { ascending: false });
    if (data.clientId) q = q.eq("client_id", data.clientId);
    if (data.environment) q = q.eq("environment", data.environment);
    if (diagIds) q = q.in("diagram_id", diagIds);
    const { data: defs, error } = await q;
    if (error) throw new Error(error.message);
    // Instance counts (active + total ever)
    const ids = (defs ?? []).map((d) => d.id);
    const counts: Record<string, number> = {};
    const totals: Record<string, number> = {};
    if (ids.length) {
      let iq = supabase.from("process_instances")
        .select("definition_id, status").in("definition_id", ids);
      if (data.clientId) iq = iq.eq("client_id", data.clientId);
      if (data.environment) iq = iq.eq("environment", data.environment);
      const { data: rows } = await iq;
      for (const r of rows ?? []) {
        totals[r.definition_id] = (totals[r.definition_id] ?? 0) + 1;
        if (["running", "waiting", "paused"].includes(r.status)) {
          counts[r.definition_id] = (counts[r.definition_id] ?? 0) + 1;
        }
      }
    }
    return (defs ?? []).map((d) => ({
      ...d,
      active_instances: counts[d.id] ?? 0,
      total_instances: totals[d.id] ?? 0,
    }));
  });


export const getDefinitionInputs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ definitionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: def, error } = await supabase
      .from("process_definitions")
      .select("id, diagram_id, nodes")
      .eq("id", data.definitionId).single();
    if (error || !def) throw new Error(error?.message ?? "Definición no encontrada");

    // Detect the start node's type name (e.g. "Evento de inicio Manual").
    const nodes = ((def.nodes ?? []) as unknown) as DefNode[];
    const startNode = nodes.find((n) => n.data?.kind === "start");
    let startTypeName: string | null = null;
    const startTypeId = (startNode?.data as { typeId?: string } | undefined)?.typeId ?? null;
    if (startTypeId) {
      const { data: t } = await supabase.from("node_types").select("name").eq("id", startTypeId).maybeSingle();
      startTypeName = t?.name ?? null;
    }

    if (!def.diagram_id) return { variables: [], entities: [] as Array<{ id: string; name: string }>, startTypeName };
    const { data: dg } = await supabase.from("process_diagrams")
      .select("id, diagram_type, client_id, environment, entity_id").eq("id", def.diagram_id).maybeSingle();
    if (!dg) return { variables: [], entities: [], startTypeName };

    // Inputs declared on the start node itself (data.inputs + data.inputMeta)
    const startData = (startNode?.data ?? {}) as { inputs?: string[]; inputMeta?: Record<string, { required?: boolean; defaultValue?: unknown }> };
    const declaredInputNames = Array.isArray(startData.inputs) ? startData.inputs : [];
    const inputMeta = startData.inputMeta ?? {};

    // Variables live in the shared catalog scoped by (client, environment, entity);
    // owner_kind/owner_id are null for catalog rows. Match the same scope here so
    // we recover the declared var_type instead of falling back to "string".
    let varsQ = supabase.from("process_variables")
      .select("id,name,label,var_type,entity_id")
      .eq("client_id", dg.client_id!)
      .eq("environment", dg.environment!);
    varsQ = dg.entity_id ? varsQ.eq("entity_id", dg.entity_id) : varsQ.is("entity_id", null);
    const { data: catalogVars } = await varsQ.order("name");


    // Project only the variables actually declared as inputs by the start node,
    // enriching them with is_input/default_value from inputMeta. Engine UI keeps
    // the old shape (`is_input` = required, `default_value` = per-node default).
    const catalogByName = new Map((catalogVars ?? []).map((v) => [v.name, v]));
    const variables = declaredInputNames.map((name) => {
      const meta = inputMeta[name] ?? {};
      const cat = catalogByName.get(name);
      if (cat) {
        return {
          ...cat,
          is_input: !!meta.required,
          default_value: meta.defaultValue ?? null,
        };
      }
      // Orphan declared input (not in catalog): expose as a string field so
      // the user can still provide a value instead of getting a server 500.
      return {
        id: `orphan:${name}`,
        name,
        label: name,
        var_type: "string" as const,
        entity_id: null as string | null,
        is_input: !!meta.required,
        default_value: meta.defaultValue ?? null,
      };
    });

    const entityIds = Array.from(new Set(variables.map((v) => v.entity_id).filter(Boolean) as string[]));
    let entities: Array<{ id: string; name: string }> = [];
    if (entityIds.length) {
      const { data: ents } = await supabase.from("entities")
        .select("id, name").in("id", entityIds);
      entities = ents ?? [];
    }
    return { variables, entities, startTypeName };
  });

export const setDefinitionStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), status: z.enum(["active", "inactive", "archived"]) }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureCanEdit(context);
    const { error } = await context.supabase.from("process_definitions").update({ status: data.status }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteDefinition = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureCanEdit(context);
    const { supabase } = context;
    const { data: def, error: dErr } = await supabase
      .from("process_definitions").select("id, status").eq("id", data.id).single();
    if (dErr || !def) throw new Error(dErr?.message ?? "Plantilla no encontrada");
    if (def.status === "active") throw new Error("No se puede borrar una plantilla activa");
    const { count, error: cErr } = await supabase
      .from("process_instances")
      .select("id", { count: "exact", head: true })
      .eq("definition_id", data.id);
    if (cErr) throw new Error(cErr.message);
    if ((count ?? 0) > 0) throw new Error("No se puede borrar: la plantilla tiene instancias ejecutadas");
    const { error: delErr } = await supabase.from("process_definitions").delete().eq("id", data.id);
    if (delErr) throw new Error(delErr.message);
    return { ok: true };
  });

export const startInstance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ definitionId: z.string().uuid(), variables: z.record(z.string(), z.unknown()).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureCanEdit(context);
    const { supabase, userId } = context;
    const { data: def, error } = await supabase.from("process_definitions").select("*").eq("id", data.definitionId).single();
    if (error || !def) throw new Error(error?.message ?? "Definición no encontrada");
    if (def.status !== "active") throw new Error("La definición no está activa");
    const nodes = ((def.nodes ?? []) as unknown) as DefNode[];
    const startNode = nodes.find((n) => n.data?.kind === "start");
    if (!startNode) throw new Error("La definición no tiene un nodo 'evento de inicio'");

    // Validate declared inputs of the START NODE (per-node binding) rather
    // than a global catalog flag. Required/default live in startNode.data.
    let initVars: Record<string, unknown> = { ...(data.variables ?? {}) };
    const startData = (startNode.data ?? {}) as { inputs?: string[]; inputMeta?: Record<string, { required?: boolean; defaultValue?: unknown }> };
    const declaredInputs = Array.isArray(startData.inputs) ? startData.inputs : [];
    const inputMeta = startData.inputMeta ?? {};
    for (const name of declaredInputs) {
      const meta = inputMeta[name] ?? {};
      if (meta.required && (initVars[name] == null || initVars[name] === "")) {
        throw new Error(`Falta la variable de entrada "${name}"`);
      }
      if (!(name in initVars) && meta.defaultValue !== undefined && meta.defaultValue !== null) {
        initVars[name] = meta.defaultValue;
      }
    }

    // Resolve client/environment from the diagram (source of truth) so the
    // instance is always grouped under the right tenant/entity/environment,
    // even if the definition was published before those fields existed.
    let effClient: string | null = (def as { client_id?: string | null }).client_id ?? null;
    let effEnv: "produccion" | "pruebas" | null = (def as { environment?: "produccion" | "pruebas" | null }).environment ?? null;
    if ((!effClient || !effEnv) && (def as { diagram_id?: string }).diagram_id) {
      const { data: dg } = await supabase
        .from("process_diagrams")
        .select("client_id, environment")
        .eq("id", (def as { diagram_id: string }).diagram_id).maybeSingle();
      effClient = effClient ?? (dg?.client_id ?? null);
      effEnv = effEnv ?? ((dg?.environment as "produccion" | "pruebas" | null) ?? null);
      // Backfill the definition so future listings/instances are consistent.
      const patch: { client_id?: string; environment?: "produccion" | "pruebas" } = {};
      if (!((def as { client_id?: string | null }).client_id) && effClient) patch.client_id = effClient;
      if (!((def as { environment?: string | null }).environment) && effEnv) patch.environment = effEnv;
      if (Object.keys(patch).length) {
        await supabase.from("process_definitions").update(patch as never).eq("id", def.id);
      }
    }

    const { data: inst, error: iErr } = await supabase.from("process_instances").insert({
      definition_id: def.id, status: "running", variables: initVars as never, started_by: userId,
      client_id: effClient,
      environment: effEnv ?? undefined,
    }).select("id").single();
    if (iErr) throw new Error(iErr.message);
    await logEvent(supabase, { instance_id: inst!.id, event_type: "instance_started", actor_id: userId, payload: { variables: initVars } });
    await supabase.from("process_tokens").insert({ instance_id: inst!.id, node_id: startNode.id, status: "active" });

    await advance(supabase, inst!.id, userId);
    return { id: inst!.id };
  });

export const advanceInstance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ instanceId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureCanEdit(context);
    return advance(context.supabase, data.instanceId, context.userId);
  });

export const pauseInstance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ instanceId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureCanEdit(context);
    await context.supabase.from("process_instances").update({ status: "paused" }).eq("id", data.instanceId);
    await logEvent(context.supabase, { instance_id: data.instanceId, event_type: "instance_paused", actor_id: context.userId });
    return { ok: true };
  });

export const resumeInstance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ instanceId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureCanEdit(context);
    await context.supabase.from("process_instances").update({ status: "running" }).eq("id", data.instanceId);
    await logEvent(context.supabase, { instance_id: data.instanceId, event_type: "instance_resumed", actor_id: context.userId });
    return advance(context.supabase, data.instanceId, context.userId);
  });

export const abortInstance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ instanceId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureCanEdit(context);
    const ts = new Date().toISOString();
    await context.supabase.from("process_instances").update({ status: "aborted", ended_at: ts }).eq("id", data.instanceId);
    await context.supabase.from("process_tokens").update({ status: "failed", exited_at: ts })
      .eq("instance_id", data.instanceId).in("status", ["active", "waiting_human", "waiting_timer", "waiting_service"]);
    await context.supabase.from("process_tasks").update({ status: "cancelled", completed_at: ts })
      .eq("instance_id", data.instanceId).in("status", ["pending", "in_progress"]);
    await logEvent(context.supabase, { instance_id: data.instanceId, event_type: "instance_aborted", actor_id: context.userId });
    return { ok: true };
  });

export const completeTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ taskId: z.string().uuid(), result: z.record(z.string(), z.unknown()).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: task, error } = await supabase.from("process_tasks").select("*").eq("id", data.taskId).single();
    if (error || !task) throw new Error(error?.message ?? "Tarea no encontrada");
    if (task.status !== "pending" && task.status !== "in_progress") throw new Error("La tarea no está pendiente");

    await supabase.from("process_tasks").update({
      status: "completed", result: (data.result ?? {}) as never, completed_at: new Date().toISOString(),
      assignee_id: task.assignee_id ?? userId,
    }).eq("id", task.id);
    await logEvent(supabase, { instance_id: task.instance_id, token_id: task.token_id, node_id: task.node_id, event_type: "task_completed", actor_id: userId, payload: { result: data.result ?? {} } });

    // merge result into variables, filtered by declared outputs on the node (if any)
    if (data.result && Object.keys(data.result).length) {
      const { data: instRow } = await supabase
        .from("process_instances")
        .select("variables, process_definitions(nodes)")
        .eq("id", task.instance_id).single();
      const prev = (instRow?.variables ?? {}) as Record<string, unknown>;
      const allNodes = (((instRow as any)?.process_definitions?.nodes ?? []) as DefNode[]);
      const taskNode = allNodes.find((n) => n.id === task.node_id);
      const declared = (taskNode?.data as { outputs?: string[] } | undefined)?.outputs;
      const filtered: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(data.result)) {
        if (!declared || declared.length === 0 || declared.includes(k)) filtered[k] = v;
      }
      const merged = { ...prev, ...filtered } as Record<string, unknown>;
      await supabase.from("process_instances").update({ variables: merged as never }).eq("id", task.instance_id);
    }

    // Move the token forward: mark current token as completed and create
    // new active tokens at the outgoing edges of the current node. Without
    // this fan-out, advance() would see an active token still on a human
    // task node and immediately re-create another pending task there,
    // leaving the process stuck on the same node.
    if (task.token_id) {
      const ts = new Date().toISOString();
      await supabase.from("process_tokens")
        .update({ status: "completed", exited_at: ts })
        .eq("id", task.token_id);
      await logEvent(supabase, { instance_id: task.instance_id, token_id: task.token_id, node_id: task.node_id, event_type: "token_exited", actor_id: userId });

      const { data: defRow } = await supabase
        .from("process_instances")
        .select("process_definitions(edges)")
        .eq("id", task.instance_id).single();
      const edges = ((defRow as any)?.process_definitions?.edges ?? []) as DefEdge[];
      const nextIds = edges.filter((e) => e.source === task.node_id).map((e) => e.target);
      for (const nid of nextIds) {
        const { data: newTok } = await supabase
          .from("process_tokens")
          .insert({ instance_id: task.instance_id, node_id: nid, status: "active" })
          .select("id").single();
        await logEvent(supabase, { instance_id: task.instance_id, token_id: newTok?.id, node_id: nid, event_type: "token_entered", actor_id: userId });
      }
    }
    return advance(supabase, task.instance_id, userId);
  });

export const claimTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ taskId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("process_tasks").update({ assignee_id: context.userId, status: "in_progress", started_at: new Date().toISOString() }).eq("id", data.taskId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listInstances = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    status: z.string().optional(),
    definitionId: z.string().uuid().optional(),
    clientId: z.string().uuid().optional(),
    environment: z.enum(["produccion", "pruebas"]).optional(),
    entityId: z.string().uuid().optional(),
  }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.clientId) {
      await assertTenantAccess(supabase, userId, data.clientId);
    }
    let defIds: string[] | null = null;
    if (data.entityId) {
      let dq = supabase.from("process_diagrams").select("id").eq("entity_id", data.entityId);
      if (data.clientId) dq = dq.eq("client_id", data.clientId);
      const { data: drows, error: derr } = await dq;
      if (derr) throw new Error(derr.message);
      const diagIds = (drows ?? []).map((r) => r.id as string);
      if (diagIds.length === 0) return [];
      const { data: defs, error: e2 } = await supabase.from("process_definitions")
        .select("id").in("diagram_id", diagIds);
      if (e2) throw new Error(e2.message);
      defIds = (defs ?? []).map((r) => r.id as string);
      if (defIds.length === 0) return [];
    }
    let q = supabase.from("process_instances")
      .select("id, status, started_at, ended_at, started_by, definition_id, process_definitions(name, version)")
      .order("started_at", { ascending: false }).limit(200);
    if (data.status) q = q.eq("status", data.status);
    if (data.definitionId) q = q.eq("definition_id", data.definitionId);
    if (data.clientId) q = q.eq("client_id", data.clientId);
    if (data.environment) q = q.eq("environment", data.environment);
    if (defIds) q = q.in("definition_id", defIds);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getInstanceDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ instanceId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const [inst, toks, tasks, evs] = await Promise.all([
      supabase.from("process_instances").select("*, process_definitions(name, version, nodes, edges)").eq("id", data.instanceId).single(),
      supabase.from("process_tokens").select("*").eq("instance_id", data.instanceId).order("entered_at", { ascending: true }),
      supabase.from("process_tasks").select("*").eq("instance_id", data.instanceId).order("created_at", { ascending: true }),
      supabase.from("process_events_log").select("*").eq("instance_id", data.instanceId).order("created_at", { ascending: false }).limit(500),
    ]);
    if (inst.error) throw new Error(inst.error.message);
    return { instance: inst.data, tokens: toks.data ?? [], tasks: tasks.data ?? [], events: evs.data ?? [] };
  });

export const tickTimers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureCanEdit(context);
    const { supabase, userId } = context;
    const { data: due } = await supabase.from("process_tokens").select("id, instance_id")
      .eq("status", "waiting_timer").lte("wake_at", new Date().toISOString());
    let fired = 0;
    for (const t of due ?? []) {
      await supabase.from("process_tokens").update({ status: "active" }).eq("id", t.id);
      await logEvent(supabase, { instance_id: t.instance_id, token_id: t.id, event_type: "timer_fired" });
      await supabase.from("process_instances").update({ status: "running" }).eq("id", t.instance_id);
      await advance(supabase, t.instance_id, userId);
      fired++;
    }
    return { fired };
  });
