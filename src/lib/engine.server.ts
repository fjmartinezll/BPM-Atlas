// Helpers for engine.functions.ts. Kept in a separate module so the
// tss-serverfn-split transformer doesn't lose sibling references.

export type NodeKind = "start" | "intermediate" | "end" | "task" | "subprocess" | "gateway" | "pool" | "lane";

export interface DefNode {
  id: string;
  type?: string;
  parentId?: string;
  parentNode?: string;
  data?: {
    kind?: NodeKind;
    label?: string;
    role?: string;
    wfObject?: string;
    nodeType?: string;
    version?: string;
    timer?: number;
    [k: string]: unknown;
  };
}
export interface DefEdge {
  id: string;
  source: string;
  target: string;
  data?: { condition?: string; description?: string; [k: string]: unknown };
}

export async function ensureCanEdit(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase.from("user_roles").select("role").eq("user_id", ctx.userId);
  const ok = (data ?? []).some((r: { role: string }) => r.role === "administrador" || r.role === "dueno_proceso");
  if (!ok) throw new Error("Sin permisos para operar el motor de procesos");
}

export async function ensureCanEditInTenant(ctx: { supabase: any; userId: string; clientId: string }) {
  const { data: ok } = await ctx.supabase.rpc("can_edit_bpm_in_tenant", {
    _user_id: ctx.userId,
    _client_id: ctx.clientId,
  });
  if (!ok) throw new Error("Sin permisos para operar el motor en este tenant");
}

export function logEvent(supabase: any, params: {
  instance_id: string; token_id?: string | null; node_id?: string | null;
  event_type: string; actor_id?: string | null; payload?: Record<string, unknown>;
}) {
  return supabase.from("process_events_log").insert({
    instance_id: params.instance_id,
    token_id: params.token_id ?? null,
    node_id: params.node_id ?? null,
    event_type: params.event_type,
    actor_id: params.actor_id ?? null,
    payload: (params.payload ?? {}) as never,
  });
}

export function evalCondition(expr: string | undefined, vars: Record<string, unknown>): boolean {
  if (!expr) return false;
  const m = expr.match(/^\s*([A-Za-z_][\w.]*)\s*(==|!=)\s*(.+?)\s*$/);
  if (m) {
    const [, key, op, raw] = m;
    const v = key.split(".").reduce<any>((acc, k) => (acc == null ? acc : acc[k]), vars);
    let rhs: unknown = raw.replace(/^['"]|['"]$/g, "");
    if (raw === "true") rhs = true;
    else if (raw === "false") rhs = false;
    else if (!isNaN(Number(raw))) rhs = Number(raw);
    return op === "==" ? v == rhs : v != rhs; // eslint-disable-line eqeqeq
  }
  const v = expr.split(".").reduce<any>((acc, k) => (acc == null ? acc : acc[k]), vars);
  return Boolean(v);
}

// ---------- Typed rule evaluator ----------

type RuleOperand =
  | { kind: "var"; name: string }
  | { kind: "attr"; name: string; path: string }
  | { kind: "literal"; value: unknown };

type GatewayRule = {
  left?: RuleOperand;
  op?: string;
  right?: RuleOperand;
  connector?: "Y" | "O";
  field1?: string;
  field2?: string;
};

async function resolveOperand(
  supabase: any,
  op: RuleOperand | undefined,
  variables: Record<string, unknown>,
  varDefs: Map<string, { var_type: string; entity_id: string | null }>,
  entityCache: Map<string, Record<string, unknown> | null>,
): Promise<unknown> {
  if (!op) return undefined;
  if (op.kind === "literal") return op.value;
  if (op.kind === "var") return variables[op.name];
  if (op.kind === "attr") {
    const def = varDefs.get(op.name);
    const refId = variables[op.name];
    if (!def || def.var_type !== "entity" || typeof refId !== "string") return undefined;
    let row = entityCache.get(refId);
    if (row === undefined) {
      const { data } = await supabase.from("entities").select("*").eq("id", refId).maybeSingle();
      row = (data ?? null) as Record<string, unknown> | null;
      entityCache.set(refId, row);
    }
    return row ? row[op.path] : undefined;
  }
}

function compareValues(op: string, a: unknown, b: unknown): boolean {
  if (op === "vacío") return a == null || a === "";
  const num = (x: unknown) => (typeof x === "number" ? x : x == null ? NaN : Number(x));
  switch (op) {
    case "=":
    case "==":
      return a == b; // eslint-disable-line eqeqeq
    case "≠":
    case "!=":
      return a != b; // eslint-disable-line eqeqeq
    case "<": return num(a) < num(b);
    case "≤": return num(a) <= num(b);
    case ">": return num(a) > num(b);
    case "≥": return num(a) >= num(b);
    case "contiene":
      return String(a ?? "").toLowerCase().includes(String(b ?? "").toLowerCase());
    default: return false;
  }
}

export async function evalGatewayRules(
  supabase: any,
  rules: GatewayRule[] | undefined,
  variables: Record<string, unknown>,
  ownerKind: "process" | "subprocess" | null,
  ownerId: string | null,
): Promise<boolean> {
  if (!rules || rules.length === 0) return false;
  const varDefs = new Map<string, { var_type: string; entity_id: string | null }>();
  if (ownerKind && ownerId) {
    const { data } = await supabase
      .from("process_variables")
      .select("name,var_type,entity_id")
      .eq("owner_kind", ownerKind).eq("owner_id", ownerId);
    for (const v of data ?? []) varDefs.set(v.name, { var_type: v.var_type, entity_id: v.entity_id });
  }
  const entityCache = new Map<string, Record<string, unknown> | null>();
  let result = true;
  for (let i = 0; i < rules.length; i++) {
    const raw = rules[i];
    const left = raw.left ?? (raw.field1 != null ? { kind: "literal" as const, value: raw.field1 } : undefined);
    const right = raw.right ?? (raw.field2 != null ? { kind: "literal" as const, value: raw.field2 } : undefined);
    const a = await resolveOperand(supabase, left, variables, varDefs, entityCache);
    const b = await resolveOperand(supabase, right, variables, varDefs, entityCache);
    const ok = compareValues(raw.op ?? "=", a, b);
    if (i === 0) result = ok;
    else if (raw.connector === "O") result = result || ok;
    else result = result && ok;
  }
  return result;
}

export async function callWfObject(url: string, payload: unknown, timeoutMs = 15000) {
  const { assertSafePublicUrl } = await import("./safe-fetch.server");
  const safeUrl = await assertSafePublicUrl(url);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(safeUrl.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
      redirect: "error",
    });
    const text = await res.text();
    let body: unknown = text;
    try { body = JSON.parse(text); } catch { /* keep text */ }
    if (!res.ok) throw new Error(`WF ${res.status}: ${text.slice(0, 200)}`);
    return body;
  } finally {
    clearTimeout(t);
  }
}

export function outgoingEdges(edges: DefEdge[], nodeId: string) {
  return edges.filter((e) => e.source === nodeId);
}
export function findNode(nodes: DefNode[], id: string) {
  return nodes.find((n) => n.id === id);
}
export function laneRole(nodes: DefNode[], n: DefNode): string | null {
  const parentId = n.parentId || n.parentNode;
  if (!parentId) return null;
  const parent = nodes.find((x) => x.id === parentId);
  if (!parent) return null;
  const role = (parent.data?.role as string | undefined) ?? null;
  return role && role.trim() ? role.trim() : null;
}

export async function advance(supabase: any, instanceId: string, actorId: string | null) {
  const { data: inst, error: instErr } = await supabase
    .from("process_instances").select("*, process_definitions(*)").eq("id", instanceId).single();
  if (instErr || !inst) throw new Error(instErr?.message ?? "Instancia no encontrada");
  if (inst.status === "paused") return { stopped: "paused" };
  if (["completed", "aborted", "error"].includes(inst.status)) return { stopped: inst.status };

  const def = inst.process_definitions as { nodes: DefNode[]; edges: DefEdge[]; diagram_id?: string | null };
  const nodes = (def.nodes ?? []) as DefNode[];
  const edges = (def.edges ?? []) as DefEdge[];
  const variables: Record<string, unknown> = { ...(inst.variables ?? {}) };

  // Resolve owner (process/subprocess) so gateway rules can read typed variable defs.
  let ownerKind: "process" | "subprocess" | null = null;
  let ownerId: string | null = null;
  if (def.diagram_id) {
    const { data: dg } = await supabase
      .from("process_diagrams")
      .select("id,diagram_type")
      .eq("id", def.diagram_id).maybeSingle();
    if (dg) {
      ownerId = dg.id;
      ownerKind = dg.diagram_type === "subprocesos" ? "subprocess"
                : dg.diagram_type === "procesos" ? "process" : null;
    }
  }

  const { data: waitingToks } = await supabase
    .from("process_tokens").select("*")
    .eq("instance_id", instanceId).in("status", ["waiting_human", "waiting_timer"]);
  for (const wt of waitingToks ?? []) {
    if (wt.status === "waiting_human") {
      const { data: pend } = await supabase
        .from("process_tasks").select("id")
        .eq("instance_id", instanceId).eq("token_id", wt.id).eq("status", "pending");
      for (const pt of pend ?? []) {
        await supabase.from("process_tasks").update({
          status: "completed",
          completed_at: new Date().toISOString(),
          result: { advanced: true, actor_id: actorId } as never,
        }).eq("id", pt.id);
        await logEvent(supabase, { instance_id: instanceId, token_id: wt.id, node_id: wt.node_id, event_type: "task_completed", actor_id: actorId, payload: { task_id: pt.id, via: "advance" } });
      }
    } else if (wt.status === "waiting_timer") {
      await logEvent(supabase, { instance_id: instanceId, token_id: wt.id, node_id: wt.node_id, event_type: "timer_fired", actor_id: actorId, payload: { via: "advance" } });
    }
    await supabase.from("process_tokens").update({ status: "active", wake_at: null }).eq("id", wt.id);
  }
  if ((waitingToks?.length ?? 0) > 0) {
    await supabase.from("process_instances").update({ status: "running" }).eq("id", instanceId);
  }

  for (let step = 0; step < 200; step++) {
    const { data: actives } = await supabase
      .from("process_tokens").select("*")
      .eq("instance_id", instanceId).eq("status", "active").limit(1);
    const tok = actives?.[0];
    if (!tok) break;

    const node = findNode(nodes, tok.node_id);
    if (!node) {
      await supabase.from("process_tokens").update({ status: "failed", exited_at: new Date().toISOString() }).eq("id", tok.id);
      await logEvent(supabase, { instance_id: instanceId, token_id: tok.id, node_id: tok.node_id, event_type: "error", payload: { reason: "node_not_found" } });
      await supabase.from("process_instances").update({ status: "error", error_message: `Nodo no encontrado: ${tok.node_id}`, ended_at: new Date().toISOString() }).eq("id", instanceId);
      return { stopped: "error" };
    }
    const kind = node.data?.kind ?? "task";
    const wf = (node.data?.wfObject as string | undefined)?.trim();

    const completeTokenAndFanOut = async (nextNodeIds: string[]) => {
      await supabase.from("process_tokens").update({ status: "completed", exited_at: new Date().toISOString() }).eq("id", tok.id);
      await logEvent(supabase, { instance_id: instanceId, token_id: tok.id, node_id: tok.node_id, event_type: "token_exited" });
      for (const nid of nextNodeIds) {
        const { data: newTok } = await supabase.from("process_tokens").insert({ instance_id: instanceId, node_id: nid, status: "active" }).select("id").single();
        await logEvent(supabase, { instance_id: instanceId, token_id: newTok?.id, node_id: nid, event_type: "token_entered" });
      }
    };

    if (kind === "start" || kind === "intermediate") {
      if (kind === "intermediate" && typeof node.data?.timer === "number" && node.data.timer > 0) {
        const wakeAt = new Date(Date.now() + node.data.timer * 1000).toISOString();
        await supabase.from("process_tokens").update({ status: "waiting_timer", wake_at: wakeAt }).eq("id", tok.id);
        await logEvent(supabase, { instance_id: instanceId, token_id: tok.id, node_id: tok.node_id, event_type: "timer_scheduled", payload: { wake_at: wakeAt } });
        await supabase.from("process_instances").update({ status: "waiting" }).eq("id", instanceId);
        return { stopped: "waiting_timer" };
      }
      const outs = outgoingEdges(edges, node.id);
      if (outs.length === 0) {
        await completeTokenAndFanOut([]);
      } else {
        await completeTokenAndFanOut(outs.map((e) => e.target));
      }
      continue;
    }

    if (kind === "end") {
      await supabase.from("process_tokens").update({ status: "completed", exited_at: new Date().toISOString() }).eq("id", tok.id);
      await logEvent(supabase, { instance_id: instanceId, token_id: tok.id, node_id: tok.node_id, event_type: "token_exited" });
      const { count } = await supabase.from("process_tokens").select("id", { count: "exact", head: true })
        .eq("instance_id", instanceId).in("status", ["active", "waiting_human", "waiting_timer", "waiting_service"]);
      if (!count || count === 0) {
        await supabase.from("process_instances").update({ status: "completed", ended_at: new Date().toISOString(), variables: variables as never }).eq("id", instanceId);
        await logEvent(supabase, { instance_id: instanceId, event_type: "instance_completed" });
        return { stopped: "completed" };
      }
      continue;
    }

    if (kind === "gateway") {
      const outs = outgoingEdges(edges, node.id);
      let nextIds: string[] = [];
      if (wf) {
        try {
          const res = (await callWfObject(wf, { variables, node_id: node.id })) as { next_node_id?: string; next?: string[]; variables?: Record<string, unknown> };
          if (res?.variables) Object.assign(variables, res.variables);
          if (Array.isArray(res?.next)) nextIds = res.next;
          else if (res?.next_node_id) nextIds = [res.next_node_id];
        } catch (e: unknown) {
          await supabase.from("process_tokens").update({ status: "failed" }).eq("id", tok.id);
          await supabase.from("process_instances").update({ status: "error", error_message: (e as Error).message, ended_at: new Date().toISOString() }).eq("id", instanceId);
          await logEvent(supabase, { instance_id: instanceId, token_id: tok.id, node_id: node.id, event_type: "error", payload: { error: (e as Error).message } });
          return { stopped: "error" };
        }
      } else {
        const rules = (node.data?.rules as GatewayRule[] | undefined) ?? undefined;
        const branch: "true" | "false" = (rules && rules.length > 0)
          ? (await evalGatewayRules(supabase, rules, variables, ownerKind, ownerId) ? "true" : "false")
          : "true";
        const match = outs.find((e) => (e.data as { branch?: string } | undefined)?.branch === branch)
          ?? outs.find((e) => evalCondition(e.data?.condition, variables));
        nextIds = match ? [match.target] : outs[0] ? [outs[0].target] : [];
      }
      await completeTokenAndFanOut(nextIds);
      continue;
    }

    if (kind === "task" || kind === "subprocess") {
      // Resolve task execution mode from node's typeId/subtypeId names.
      // Names containing "sistema/automá/servicio/system" → system (auto).
      // Otherwise (incl. "humana" or no type) → human task.
      let mode: "human" | "system" = "human";
      if (kind === "task") {
        const typeId = (node.data as { typeId?: string } | undefined)?.typeId ?? null;
        const subtypeId = (node.data as { subtypeId?: string } | undefined)?.subtypeId ?? null;
        const names: string[] = [];
        if (typeId) {
          const { data: t } = await supabase.from("node_types").select("name").eq("id", typeId).maybeSingle();
          if (t?.name) names.push(String(t.name));
        }
        if (subtypeId) {
          const { data: s } = await supabase.from("node_subtypes").select("name").eq("id", subtypeId).maybeSingle();
          if (s?.name) names.push(String(s.name));
        }
        const joined = names.join(" ").toLowerCase();
        if (/sistema|autom[aá]|servicio|system/.test(joined)) mode = "system";
      }

      if (wf) {
        const { data: t } = await supabase.from("process_tasks").insert({
          instance_id: instanceId, token_id: tok.id, node_id: node.id, node_kind: kind,
          task_kind: "service", wf_object: wf, status: "in_progress",
          payload: { variables } as never, started_at: new Date().toISOString(),
        }).select("id").single();
        await logEvent(supabase, { instance_id: instanceId, token_id: tok.id, node_id: node.id, event_type: "wf_called", payload: { url: wf } });
        try {
          const res = (await callWfObject(wf, { variables, node_id: node.id, instance_id: instanceId })) as Record<string, unknown> | unknown;
          if (res && typeof res === "object" && "variables" in res && (res as any).variables) {
            Object.assign(variables, (res as any).variables);
          }
          await supabase.from("process_tasks").update({ status: "completed", result: res as never, completed_at: new Date().toISOString() }).eq("id", t!.id);
          await logEvent(supabase, { instance_id: instanceId, token_id: tok.id, node_id: node.id, event_type: "wf_response", payload: { ok: true } });
          const outs = outgoingEdges(edges, node.id);
          await completeTokenAndFanOut(outs.map((e) => e.target));
        } catch (e: unknown) {
          await supabase.from("process_tasks").update({ status: "failed", error: (e as Error).message, completed_at: new Date().toISOString() }).eq("id", t!.id);
          await supabase.from("process_tokens").update({ status: "failed" }).eq("id", tok.id);
          await supabase.from("process_instances").update({ status: "error", error_message: (e as Error).message, ended_at: new Date().toISOString() }).eq("id", instanceId);
          await logEvent(supabase, { instance_id: instanceId, token_id: tok.id, node_id: node.id, event_type: "task_failed", payload: { error: (e as Error).message } });
          return { stopped: "error" };
        }
        continue;
      } else if (mode === "system") {
        const nowTs = new Date().toISOString();
        const { data: t } = await supabase.from("process_tasks").insert({
          instance_id: instanceId, token_id: tok.id, node_id: node.id, node_kind: kind,
          task_kind: "system", status: "completed",
          payload: { variables } as never, result: {} as never,
          started_at: nowTs, completed_at: nowTs,
        }).select("id").single();
        await logEvent(supabase, { instance_id: instanceId, token_id: tok.id, node_id: node.id, event_type: "task_auto_completed", payload: { task_id: t?.id } });
        const outs = outgoingEdges(edges, node.id);
        await completeTokenAndFanOut(outs.map((e) => e.target));
        continue;
      } else {
        const role = laneRole(nodes, node);
        await supabase.from("process_tokens").update({ status: "waiting_human" }).eq("id", tok.id);
        const { data: t } = await supabase.from("process_tasks").insert({
          instance_id: instanceId, token_id: tok.id, node_id: node.id, node_kind: kind,
          task_kind: "human", lane_role: role, status: "pending", payload: { variables } as never,
        }).select("id").single();
        await logEvent(supabase, { instance_id: instanceId, token_id: tok.id, node_id: node.id, event_type: "task_created", payload: { task_id: t?.id, lane_role: role } });
        await supabase.from("process_instances").update({ status: "waiting" }).eq("id", instanceId);
        return { stopped: "waiting_human" };
      }
    }


    await completeTokenAndFanOut(outgoingEdges(edges, node.id).map((e) => e.target));
  }

  await supabase.from("process_instances").update({ variables: variables as never }).eq("id", instanceId);

  const { count: anyWaiting } = await supabase.from("process_tokens").select("id", { count: "exact", head: true })
    .eq("instance_id", instanceId).in("status", ["waiting_human", "waiting_timer", "waiting_service"]);
  if (anyWaiting && anyWaiting > 0) {
    await supabase.from("process_instances").update({ status: "waiting" }).eq("id", instanceId);
  }
  return { ok: true, actor: actorId };
}
