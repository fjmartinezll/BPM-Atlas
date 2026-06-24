import { useEffect, useMemo, useState } from "react";
import {
  ReactFlow, Background, Controls, MiniMap,
  BaseEdge, EdgeLabelRenderer, getBezierPath,
  Handle, Position, MarkerType,
  type Edge, type Node, type NodeProps, type EdgeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  CirclePlay, CirclePause, CircleStop, Square as SquareIcon,
  Layers, Diamond, Building2, Columns3,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

type RunState = "current" | "completed" | "pending";

const STATE_LABEL: Record<RunState, string> = {
  current: "Actual",
  completed: "Completado",
  pending: "Pendiente",
};
const STATE_BADGE: Record<RunState, string> = {
  current: "bg-rose-500/20 text-rose-700 dark:text-rose-300 border-rose-500/40",
  completed: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/40",
  pending: "bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/40",
};

const KIND_META: Record<string, { label: string; icon: typeof CirclePlay; color: string }> = {
  start:        { label: "Inicio",        icon: CirclePlay,  color: "oklch(0.78 0.16 145)" },
  intermediate: { label: "Intermedio",    icon: CirclePause, color: "oklch(0.78 0.14 80)" },
  end:          { label: "Fin",           icon: CircleStop,  color: "oklch(0.68 0.21 25)" },
  task:         { label: "Tarea",         icon: SquareIcon,  color: "oklch(0.68 0.13 250)" },
  subprocess:   { label: "Subproceso",    icon: Layers,      color: "oklch(0.62 0.12 290)" },
  gateway:      { label: "Decisión",      icon: Diamond,     color: "#f97316" },
  pool:         { label: "Entidad",       icon: Building2,   color: "#0ea5e9" },
  lane:         { label: "Calle",         icon: Columns3,    color: "#64748b" },
};

const inHandle: React.CSSProperties = { background: "#fff", border: "1.5px solid #111", width: 8, height: 8 };
const outHandle: React.CSSProperties = { background: "#000", border: "1.5px solid #111", width: 8, height: 8 };

function stateColors(runState?: RunState) {
  if (runState === "current") return { bg: "bg-rose-500/25", ring: "ring-2 ring-rose-500", border: "#e11d48", fill: "#fecdd3" };
  if (runState === "completed") return { bg: "bg-emerald-500/25", ring: "", border: "#10b981", fill: "#a7f3d0" };
  if (runState === "pending") return { bg: "bg-amber-500/15", ring: "", border: "#d97706", fill: "#fde68a" };
  return { bg: "bg-card", ring: "", border: "#94a3b8", fill: "#ffffff" };
}

// Invisible handles covering every id used by the modeler (bpmn + generic),
// each declared as both source and target so any saved sourceHandle/targetHandle resolves.
const HIDDEN_HANDLE: React.CSSProperties = { width: 1, height: 1, minWidth: 1, minHeight: 1, background: "transparent", border: "none", opacity: 0, pointerEvents: "none" };
const ALL_IDS: Array<{ id: string; pos: Position }> = [
  // bpmn 8 ids
  { id: "t-t", pos: Position.Top }, { id: "t-s", pos: Position.Top },
  { id: "l-t", pos: Position.Left }, { id: "l-s", pos: Position.Left },
  { id: "r-t", pos: Position.Right }, { id: "r-s", pos: Position.Right },
  { id: "b-t", pos: Position.Bottom }, { id: "b-s", pos: Position.Bottom },
  // generic ids
  { id: "t", pos: Position.Top }, { id: "l", pos: Position.Left },
  { id: "r", pos: Position.Right }, { id: "b", pos: Position.Bottom },
];
function AllHandles() {
  return (
    <>
      {ALL_IDS.map((h) => (
        <span key={h.id}>
          <Handle id={h.id} type="source" position={h.pos} style={HIDDEN_HANDLE} isConnectable={false} />
          <Handle id={h.id} type="target" position={h.pos} style={HIDDEN_HANDLE} isConnectable={false} />
        </span>
      ))}
    </>
  );
}

// ---------- Token chip overlay near a node ----------
type TokenInfo = { id: string; status: string; entered_at?: string | null; exited_at?: string | null; wake_at?: string | null };
function NodeTokenChips({ tokens }: { tokens?: TokenInfo[] }) {
  if (!tokens || tokens.length === 0) return null;
  const active = tokens.filter((t) => t.status !== "completed" && t.status !== "failed");
  const shown = active.length ? active : tokens.slice(-1);
  return (
    <div
      className="absolute right-full top-1/2 z-20 mr-1 flex -translate-y-1/2 flex-col items-end gap-1 pointer-events-none"
      style={{ minWidth: "max-content" }}
    >
      {shown.map((t) => (
        <span
          key={t.id}
          className={`rounded-full border px-1.5 py-0.5 text-[9px] font-medium shadow-sm ${TOKEN_STATE_BADGE[t.status] ?? "bg-muted"}`}
          title={`Token ${t.id.slice(0, 8)} · ${t.status}${t.wake_at ? ` · despierta ${new Date(t.wake_at).toLocaleString()}` : ""}`}
        >
          ● {t.status}
        </span>
      ))}
      {tokens.length > shown.length && (
        <span className="rounded-full border bg-background/90 px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">
          +{tokens.length - shown.length}
        </span>
      )}
    </div>
  );
}

// ---------- BPMN read-only node (events, tasks, gateways) ----------
function BpmnView({ data }: NodeProps) {
  const d = data as { kind?: string; label?: string; color?: string; runState?: RunState; tokensForNode?: TokenInfo[] };
  const kind = d.kind ?? "task";
  const meta = KIND_META[kind] ?? KIND_META.task;
  const Icon = meta.icon;
  const color = d.color ?? meta.color;
  const st = stateColors(d.runState);
  const isEvent = kind === "start" || kind === "end" || kind === "intermediate";
  const isGateway = kind === "gateway";

  if (isGateway) {
    return (
      <div className="relative h-full w-full" style={{ minWidth: 80, minHeight: 80 }}>
        <AllHandles />
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full pointer-events-none">
          <polygon
            points="50,3 97,50 50,97 3,50"
            fill={st.fill}
            stroke={d.runState === "current" ? "#e11d48" : color}
            strokeWidth={d.runState === "current" ? 3 : 2}
            strokeLinejoin="miter"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <div className="absolute inset-0 grid place-items-center">
          <div className="flex flex-col items-center gap-0.5 px-2 text-center">
            <Icon className="h-4 w-4" style={{ color }} />
            <span className="text-[10px] font-medium leading-tight truncate max-w-[80%]">{d.label ?? ""}</span>
          </div>
        </div>
        <NodeTokenChips tokens={d.tokensForNode} />
      </div>
    );
  }

  return (
    <div className="relative h-full w-full" style={{ minWidth: isEvent ? 80 : 110, minHeight: 40 }}>
      <AllHandles />
      <div
        className={`flex h-full w-full flex-col items-center justify-center gap-0.5 px-3 py-1.5 text-xs font-medium shadow-sm text-card-foreground border-2 ${st.bg} ${st.ring}`}
        style={{ borderColor: d.runState === "current" ? "#e11d48" : color, borderRadius: isEvent ? 999 : 8 }}
      >
        <div className="flex items-center gap-1.5">
          <Icon className="h-3.5 w-3.5 shrink-0" style={{ color }} />
          <span className="truncate">{d.label ?? ""}</span>
        </div>
      </div>
      <NodeTokenChips tokens={d.tokensForNode} />
    </div>
  );
}

// ---------- Pool / Lane (entidad / calle) ----------
function PoolView({ data }: NodeProps) {
  const d = data as { kind?: string; label?: string; paletteLabel?: string; role?: string };
  const kind = d.kind ?? "pool";
  const meta = KIND_META[kind] ?? KIND_META.pool;
  const Icon = meta.icon;
  const isLane = kind === "lane";
  return (
    <div className="relative h-full w-full">
      <AllHandles />
      <div className="flex h-full w-full flex-col rounded-md border-2 bg-card/40 text-card-foreground shadow-sm overflow-hidden" style={{ borderColor: meta.color }}>
        <div className="flex items-center gap-2 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-white" style={{ background: meta.color }}>
          <Icon className="h-3 w-3" />
          <span>{d.paletteLabel ?? meta.label}</span>
        </div>
        <div className="flex flex-1 flex-col gap-0.5 p-2">
          <span className="text-sm font-semibold truncate">{d.label || "—"}</span>
          {isLane && d.role && <span className="text-[10px] text-muted-foreground">Rol: {d.role}</span>}
        </div>
      </div>
    </div>
  );
}

// ---------- Generic colored rectangle ----------
function GenericView({ data }: NodeProps) {
  const d = data as { label?: string; color?: string; paletteLabel?: string };
  const color = d.color ?? "#3b82f6";
  return (
    <div className="relative h-full w-full">
      <AllHandles />
      <div className="flex h-full w-full flex-col rounded-md border-2 bg-card text-card-foreground shadow-sm overflow-hidden" style={{ borderColor: color }}>
        {d.paletteLabel && (
          <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-white truncate" style={{ background: color }}>
            {d.paletteLabel}
          </div>
        )}
        <div className="flex flex-1 items-center justify-center p-2 text-center text-xs font-medium break-words whitespace-pre-line">
          {d.label || "—"}
        </div>
      </div>
    </div>
  );
}

// ---------- Labeled edge (flujo / cardinality) ----------
function LabeledEdgeView({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, style, data, label }: EdgeProps) {
  const [edgePath, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  const d = data as { cardinality?: string; description?: string } | undefined;
  const txt = (label as string | undefined) ?? d?.cardinality ?? d?.description;
  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={style} />
      {txt && (
        <EdgeLabelRenderer>
          <div
            style={{ position: "absolute", transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
            className="pointer-events-none rounded-md border bg-card px-2 py-0.5 text-[10px] font-medium text-foreground shadow"
          >
            {txt}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

const nodeTypes = { bpmn: BpmnView, pool: PoolView, generic: GenericView, dataEntity: GenericView };
const edgeTypes = { labeled: LabeledEdgeView, default: LabeledEdgeView };

function fmt(s?: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleString();
}

function relativeTime(s?: string | null): string {
  if (!s) return "—";
  const diff = Date.now() - new Date(s).getTime();
  if (Number.isNaN(diff)) return "—";
  const sec = Math.round(diff / 1000);
  if (sec < 60) return `hace ${sec}s`;
  const min = Math.round(sec / 60);
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return `hace ${d} d`;
}

const TOKEN_STATE_BADGE: Record<string, string> = {
  active: "bg-rose-500/20 text-rose-700 dark:text-rose-300 border-rose-500/40",
  waiting_human: "bg-amber-500/20 text-amber-800 dark:text-amber-300 border-amber-500/40",
  waiting_timer: "bg-sky-500/20 text-sky-700 dark:text-sky-300 border-sky-500/40",
  waiting_service: "bg-violet-500/20 text-violet-700 dark:text-violet-300 border-violet-500/40",
  completed: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/40",
  failed: "bg-zinc-700/20 text-zinc-800 dark:text-zinc-200 border-zinc-700/40",
};

const TOKEN_STATE_DESC: Record<string, string> = {
  active: "Listo para avanzar al siguiente nodo",
  waiting_human: "Esperando que un usuario complete la tarea",
  waiting_timer: "Esperando a que se cumpla un temporizador",
  waiting_service: "Esperando respuesta de un servicio",
  completed: "Token que ya atravesó el nodo",
  failed: "Token detenido por un error",
};


export interface InstanceDiagramPanelProps {
  definition: { nodes?: any[]; edges?: any[] } | null | undefined;
  tokens: Array<{ id: string; node_id: string; status: string; entered_at?: string | null; exited_at?: string | null; wake_at?: string | null }>;
  tasks: Array<{ id: string; node_id: string; status: string; task_kind?: string; lane_role?: string | null; error?: string | null }>;
  events: Array<{ id: string; node_id: string | null; event_type: string; created_at: string; payload?: any }>;
}

export function InstanceDiagramPanel({ definition, tokens, tasks, events }: InstanceDiagramPanelProps) {
  const runStateMap = useMemo(() => {
    const map = new Map<string, RunState>();
    const currentStatuses = new Set(["active", "waiting_human", "waiting_timer", "waiting_service"]);
    for (const t of tokens) if (currentStatuses.has(t.status)) map.set(t.node_id, "current");
    for (const t of tokens) if (t.status === "completed" && !map.has(t.node_id)) map.set(t.node_id, "completed");
    for (const e of events) {
      if (e.event_type === "token_exited" && e.node_id && !map.has(e.node_id)) {
        map.set(e.node_id, "completed");
      }
    }
    return map;
  }, [tokens, events]);

  const rawNodes = (definition?.nodes ?? []) as Node[];
  const rawEdges = (definition?.edges ?? []) as Edge[];

  const tokensByNode = useMemo(() => {
    const m = new Map<string, TokenInfo[]>();
    for (const t of tokens) {
      const arr = m.get(t.node_id) ?? [];
      arr.push(t);
      m.set(t.node_id, arr);
    }
    return m;
  }, [tokens]);

  const nodes = useMemo<Node[]>(() => rawNodes.map((n) => {
    const st = runStateMap.get(n.id) ?? "pending";
    const isPool = n.type === "pool";
    const zIndex = isPool ? ((n.data as any)?.kind === "pool" ? -2 : -1) : 0;
    return {
      ...n,
      data: {
        ...(n.data ?? {}),
        runState: n.type === "bpmn" ? st : undefined,
        tokensForNode: n.type === "bpmn" ? tokensByNode.get(n.id) : undefined,
      },
      draggable: false,
      selectable: true,
      zIndex,
    } as Node;
  }), [rawNodes, runStateMap, tokensByNode]);

  const edges = useMemo<Edge[]>(() => rawEdges.map((e) => ({
    ...e,
    type: "labeled",
    markerEnd: { type: MarkerType.ArrowClosed, color: "#9ca3af" },
    style: { stroke: "#9ca3af", strokeWidth: 1.75 },
  })), [rawEdges]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => { setSelectedId(null); }, [definition]);

  const selectedNode = rawNodes.find((n) => n.id === selectedId) ?? null;
  const selectedKind = (selectedNode?.data as any)?.kind as string | undefined;
  const selectedState: RunState | null = selectedNode && selectedNode.type === "bpmn"
    ? (runStateMap.get(selectedNode.id) ?? "pending") : null;
  const selectedTokens = tokens.filter((t) => t.node_id === selectedId);
  const selectedTasks = tasks.filter((t) => t.node_id === selectedId);
  const selectedEvents = events.filter((e) => e.node_id === selectedId).slice(-10).reverse();

  const nodeLabelMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const n of rawNodes) {
      const lbl = (n.data as any)?.label as string | undefined;
      if (lbl) m.set(n.id, lbl);
    }
    return m;
  }, [rawNodes]);

  const lastEventByNode = useMemo(() => {
    const m = new Map<string, { event_type: string; created_at: string }>();
    for (const e of events) {
      if (!e.node_id) continue;
      const prev = m.get(e.node_id);
      if (!prev || new Date(e.created_at).getTime() > new Date(prev.created_at).getTime()) {
        m.set(e.node_id, { event_type: e.event_type, created_at: e.created_at });
      }
    }
    return m;
  }, [events]);

  const sortedTokens = useMemo(() => {
    const rank = (s: string) => (s === "completed" || s === "failed" ? 1 : 0);
    return [...tokens].sort((a, b) => {
      const r = rank(a.status) - rank(b.status);
      if (r !== 0) return r;
      const at = new Date(a.exited_at ?? a.entered_at ?? 0).getTime();
      const bt = new Date(b.exited_at ?? b.entered_at ?? 0).getTime();
      return bt - at;
    });
  }, [tokens]);


  return (
    <div className="flex h-[70vh] gap-3 rounded-md border bg-background">
      <div className="relative flex-1 min-w-0">
        <ReactFlow
          nodes={nodes.map((n) => ({ ...n, selected: n.id === selectedId }))}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable
          onNodeClick={(_, node) => setSelectedId(node.id)}
          onPaneClick={() => setSelectedId(null)}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={16} />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable />
        </ReactFlow>
        <div className="absolute left-2 top-2 z-10 max-w-[280px] rounded-md border bg-background/95 p-2 text-[10px] shadow-sm space-y-1.5">
          <div>
            <div className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">Estados del nodo</div>
            <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1">
              <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm border border-amber-500 bg-amber-500/15" />Pendiente</span>
              <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm border border-rose-500 bg-rose-500/25" />Actual</span>
              <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm border border-emerald-500 bg-emerald-500/25" />Completado</span>
            </div>
          </div>
          <div className="border-t pt-1.5">
            <div className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">Estados de token</div>
            <div className="mt-1 flex flex-wrap gap-1">
              {Object.entries(TOKEN_STATE_BADGE).map(([key, cls]) => (
                <span key={key} className={`rounded-full border px-1.5 py-0.5 text-[9px] ${cls}`} title={TOKEN_STATE_DESC[key]}>
                  {key}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <aside className="w-80 shrink-0 flex flex-col border-l text-xs">
        {/* Lista de TODOS los tokens de la instancia */}
        <section className="border-b p-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Tokens de la instancia
            </div>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium">{tokens.length}</span>
          </div>
          {tokens.length === 0 ? (
            <p className="text-muted-foreground">Sin tokens en esta instancia.</p>
          ) : (
            <ul className="max-h-[28vh] space-y-1 overflow-y-auto pr-1">
              {sortedTokens.map((t) => {
                const lbl = nodeLabelMap.get(t.node_id) ?? t.node_id;
                const lastEv = lastEventByNode.get(t.node_id);
                const isCurrent = t.status !== "completed" && t.status !== "failed";
                const timeBase = isCurrent ? t.entered_at : t.exited_at ?? t.entered_at;
                const timeLabel = isCurrent
                  ? `Entró ${relativeTime(timeBase)}`
                  : `Salió ${relativeTime(timeBase)}`;
                return (
                  <li
                    key={t.id}
                    className={`cursor-pointer rounded border p-1.5 transition-colors hover:bg-muted/50 ${selectedId === t.node_id ? "ring-1 ring-primary" : ""}`}
                    onClick={() => setSelectedId(t.node_id)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium" title={lbl}>{lbl}</div>
                        <div className="font-mono text-[9px] text-muted-foreground" title={t.node_id}>
                          #{t.node_id.slice(0, 8)}
                        </div>
                      </div>
                      <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-medium ${TOKEN_STATE_BADGE[t.status] ?? "bg-muted"}`}>
                        {t.status}
                      </span>
                    </div>
                    <div className="mt-1 text-[10px] text-muted-foreground">
                      {timeLabel}
                      {t.wake_at && <> · Despierta: {fmt(t.wake_at)}</>}
                    </div>
                    {lastEv && (
                      <div className="text-[10px] text-muted-foreground">
                        Última acción: <span className="font-medium text-foreground/80">{lastEv.event_type}</span> · {relativeTime(lastEv.created_at)}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Detalle del nodo seleccionado */}
        <div className="flex-1 overflow-y-auto p-3">
        {!selectedNode ? (
          <p className="text-muted-foreground">Selecciona un nodo del diagrama o un token de la lista para ver su información.</p>
        ) : (
          <div className="space-y-3">
            <div>
              <div className="text-[10px] uppercase text-muted-foreground">Nodo</div>
              <div className="text-sm font-semibold">{(selectedNode.data as any)?.label ?? selectedNode.id}</div>
              <div className="mt-1 flex flex-wrap gap-1">
                {selectedKind && <Badge variant="outline">{KIND_META[selectedKind]?.label ?? selectedKind}</Badge>}
                {selectedState && (
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATE_BADGE[selectedState]}`}>
                    {STATE_LABEL[selectedState]}
                  </span>
                )}
              </div>
              {(selectedNode.data as any)?.description && (
                <p className="mt-2 text-[11px] text-muted-foreground">{(selectedNode.data as any).description}</p>
              )}
            </div>

            <section>
              <div className="text-[10px] uppercase text-muted-foreground">Tokens ({selectedTokens.length})</div>
              {selectedTokens.length === 0 && <p className="text-muted-foreground">—</p>}
              <ul className="space-y-1">
                {selectedTokens.map((t) => (
                  <li key={t.id} className="rounded border p-1.5">
                    <div className="flex justify-between"><span>{t.status}</span></div>
                    <div className="text-[10px] text-muted-foreground">
                      Entró: {fmt(t.entered_at)}
                      {t.exited_at && <> · Salió: {fmt(t.exited_at)}</>}
                      {t.wake_at && <> · Despierta: {fmt(t.wake_at)}</>}
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <div className="text-[10px] uppercase text-muted-foreground">Tareas ({selectedTasks.length})</div>
              {selectedTasks.length === 0 && <p className="text-muted-foreground">—</p>}
              <ul className="space-y-1">
                {selectedTasks.map((t) => (
                  <li key={t.id} className="rounded border p-1.5">
                    <div className="flex justify-between">
                      <span>{t.task_kind ?? "task"}</span>
                      <span>{t.status}</span>
                    </div>
                    {t.lane_role && <div className="text-[10px] text-muted-foreground">Rol: {t.lane_role}</div>}
                    {t.error && <div className="text-[10px] text-rose-600">{t.error}</div>}
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <div className="text-[10px] uppercase text-muted-foreground">Eventos recientes</div>
              {selectedEvents.length === 0 && <p className="text-muted-foreground">—</p>}
              <ul className="space-y-1">
                {selectedEvents.map((e) => (
                  <li key={e.id} className="rounded border p-1.5">
                    <div className="flex justify-between">
                      <span className="font-medium">{e.event_type}</span>
                      <span className="text-[10px] text-muted-foreground">{fmt(e.created_at)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        )}
        </div>
      </aside>

    </div>
  );
}
