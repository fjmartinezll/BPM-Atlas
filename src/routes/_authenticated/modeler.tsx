import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { createContext, Fragment, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import {
  ReactFlow, ReactFlowProvider, Background, Controls, MiniMap, addEdge, applyNodeChanges, applyEdgeChanges, useEdgesState, useNodesState,
  NodeResizer, getBezierPath, getSmoothStepPath, EdgeLabelRenderer, BaseEdge,
  useUpdateNodeInternals,
  type Connection, type Edge, type Node, type NodeProps, type EdgeProps, type EdgeChange,
  Handle, Position, MarkerType,
} from "@xyflow/react";

import "@xyflow/react/dist/style.css";
import { ErEdgeMarkers } from "@/components/er-edge-markers";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useClient } from "@/lib/client-context";
import { useSelectedEntity } from "@/lib/selected-entity";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  CirclePlay, CirclePause, CircleStop, Square, Layers, Diamond, Save, Trash2, GitBranch,
  Users, Box, FileText, Database, Network, User, Briefcase, Boxes, X,
  Zap, Workflow, Link as LinkIcon, Webhook, MousePointerClick, Plus,
  Building2, Columns3, Rocket, Copy, Loader2, FlaskConical, ChevronDown, Download,
  ShieldCheck, CheckCircle2, AlertTriangle, XCircle, Eraser, SquareDashed,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { publishDefinition, getInstanceDetail } from "@/lib/engine.functions";
import { listDiagramColumns, upsertColumn, listDiagramTables } from "@/lib/entity-fields.functions";

import { LEVELS, LEVEL_TO_I18N, type LevelKey, type GatewayRule, type VarsScope, migrateGatewayRule, formatGatewayRules as formatGatewayRulesBpm } from "@/lib/bpm";
import { ProcessVariablesDialog } from "@/components/process-variables-dialog";
import { ImportVariablesDialog } from "@/components/import-variables-dialog";
import { EntityFieldsDialog } from "@/components/entity-fields-dialog";
import { GatewayRulesEditor, TaskIOEditor } from "@/components/gateway-rules-editor";

type SearchT = { level?: LevelKey | ""; id?: string; type?: DiagramType | ""; definitionId?: string; instanceId?: string };

export const Route = createFileRoute("/_authenticated/modeler")({
  head: () => ({ meta: [{ title: "Modelador de Procesos — BPM Atlas" }] }),
  validateSearch: (s: Record<string, unknown>): SearchT => ({
    level: (typeof s.level === "string" && (LEVELS as readonly string[]).includes(s.level) ? (s.level as LevelKey) : "") as LevelKey | "",
    id: typeof s.id === "string" ? s.id : "",
    type: (typeof s.type === "string" && ["macroprocesos","procesos","workflows","datos"].includes(s.type) ? (s.type as DiagramType) : "") as DiagramType | "",
    definitionId: typeof s.definitionId === "string" ? s.definitionId : "",
    instanceId: typeof s.instanceId === "string" ? s.instanceId : "",
  }),
  component: ModelerPage,
});


// ---------- Diagram types ----------

type DiagramType =
  | "macroprocesos"
  | "procesos"
  | "workflows"
  | "datos";

const DIAGRAM_TYPES: { id: DiagramType; label: string }[] = [
  { id: "macroprocesos", label: "Mapas de Procesos" },
  { id: "procesos", label: "Procesos" },
  { id: "workflows", label: "Acciones Ejecutables" },
];

// Which diagram types require an explicit parent association
const PARENT_REQUIRED: Partial<Record<DiagramType, "macroprocesses" | "processes">> = {
  procesos: "macroprocesses",
  workflows: "processes",
};

// ---------- BPMN ----------

type BpmnKind = "start" | "intermediate" | "end" | "task" | "subprocess" | "gateway" | "pool" | "lane";

const KIND_META: Record<BpmnKind, { i18n?: string; label?: string; icon: typeof CirclePlay; color: string; eventPrefix?: boolean }> = {
  start: { i18n: "bpmn.startEvent", icon: CirclePlay, color: "oklch(0.78 0.16 145)", eventPrefix: true },
  intermediate: { i18n: "bpmn.intermediateEvent", icon: CirclePause, color: "oklch(0.78 0.14 80)", eventPrefix: true },
  end: { i18n: "bpmn.endEvent", icon: CircleStop, color: "oklch(0.68 0.21 25)", eventPrefix: true },
  task: { i18n: "bpmn.task", icon: Square, color: "oklch(0.68 0.13 250)" },
  subprocess: { i18n: "bpmn.subprocess", icon: Layers, color: "oklch(0.62 0.12 290)" },
  gateway: { i18n: "bpmn.gateway", icon: Diamond, color: "#f97316" },
  pool: { label: "Entidad", icon: Building2, color: "#0ea5e9" },
  lane: { label: "Calle", icon: Columns3, color: "#64748b" },
};

// Generic (rectangular, resizable, colorable) palettes
type GenericPaletteItem = {
  kind: string;
  label: string;
  initialLabel?: string;
  icon: typeof Square;
  color: string;
  container?: "band" | "side"; // band = horizontal full-width, side = vertical column
};

const GENERIC_PALETTES: Record<Exclude<DiagramType, "procesos" | "datos">, GenericPaletteItem[]> = {
  macroprocesos: [
    { kind: "macro.entradas",      label: "NECESIDADES DE CLIENTES\n", initialLabel: "NECESIDADES DE LOS CLIENTES", icon: User, color: "#64748b", container: "side" },
    { kind: "macro.control",       label: "PROCESOS DE CONTROL", icon: Layers,    color: "#0ea5e9", container: "band" },
    { kind: "macro.estrategico",   label: "PROCESOS ESTRATÉGICOS", icon: Briefcase, color: "#10b981", container: "band" },
    { kind: "macro.misional",      label: "PROCESOS  DE NEGOCIO", icon: Boxes,     color: "#d946ef", container: "band" },
    { kind: "macro.transversal",   label: "PROCESOS TRANSVERSALES", icon: Network,   color: "#8b5cf6", container: "band" },
    { kind: "macro.apoyo",         label: "PROCESOS DE APOYO",   icon: Users,     color: "#ec4899", container: "band" },
    { kind: "macro.salidas",       label: "CLIENTES SATISFECHOS\n", icon: User, color: "#64748b", container: "side" },
    { kind: "macro.macroproceso",  label: "Proceso",             icon: Layers,    color: "#6366f1" },
  ],
  workflows: [
    { kind: "wf.trigger", label: "Trigger", icon: Zap, color: "#eab308" },
    { kind: "wf.action", label: "Acción", icon: MousePointerClick, color: "#3b82f6" },
    { kind: "wf.condition", label: "Condición", icon: Diamond, color: "#f97316" },
    { kind: "wf.app", label: "App", icon: Box, color: "#22c55e" },
    { kind: "wf.webhook", label: "Webhook", icon: Webhook, color: "#a855f7" },
    { kind: "wf.n8n", label: "Nodo n8n", icon: Workflow, color: "#ec4899" },
  ],
};

const PROCESS_TYPE_LABELS = { estrategico: "Estratégico", clave: "Clave", soporte: "Soporte" } as const;
type ProcessType = keyof typeof PROCESS_TYPE_LABELS;

// (Tipología de nodos ahora se gestiona en la BD: node_types / node_subtypes)

const ROLE_OPTIONS = [
  { value: "administrador", label: "Administrador" },
  { value: "dueno_proceso", label: "Diseñador de Procesos" },
  { value: "participante", label: "Usuario" },
  { value: "auditor", label: "Auditor" },
];

// ---------- Handle styles ----------

const inHandleStyle: React.CSSProperties = { background: "#ffffff", border: "1.5px solid #111", width: 10, height: 10 };
const outHandleStyle: React.CSSProperties = { background: "#000000", border: "1.5px solid #111", width: 10, height: 10 };

// ---------- Subprocess inline preview ----------

const PREVIEW_HIDDEN_HANDLE: React.CSSProperties = { width: 1, height: 1, minWidth: 1, minHeight: 1, background: "transparent", border: "none", opacity: 0, pointerEvents: "none" };
const PREVIEW_HANDLE_IDS: Array<{ id: string; pos: Position }> = [
  { id: "t-t", pos: Position.Top }, { id: "t-s", pos: Position.Top },
  { id: "l-t", pos: Position.Left }, { id: "l-s", pos: Position.Left },
  { id: "r-t", pos: Position.Right }, { id: "r-s", pos: Position.Right },
  { id: "b-t", pos: Position.Bottom }, { id: "b-s", pos: Position.Bottom },
  { id: "t", pos: Position.Top }, { id: "l", pos: Position.Left },
  { id: "r", pos: Position.Right }, { id: "b", pos: Position.Bottom },
];
function PreviewAllHandles() {
  return (
    <>
      {PREVIEW_HANDLE_IDS.map((h) => (
        <span key={h.id}>
          <Handle id={h.id} type="source" position={h.pos} style={PREVIEW_HIDDEN_HANDLE} isConnectable={false} />
          <Handle id={h.id} type="target" position={h.pos} style={PREVIEW_HIDDEN_HANDLE} isConnectable={false} />
        </span>
      ))}
    </>
  );
}

function SubprocessPreviewNode({ data }: NodeProps) {
  const label = (data as { label?: string }).label ?? "";
  const kind = (data as { kind?: string }).kind as BpmnKind | "subContainer" | undefined;
  const description = (data as { description?: string }).description;

  const subprocessDiagramName = (data as { subprocessDiagramName?: string }).subprocessDiagramName;
  const isContainer = kind === "pool" || kind === "lane" || kind === "subContainer";
  const meta =
    kind && kind !== "subContainer" && (KIND_META as Record<string, { color: string; icon: typeof Square }>)[kind]
      ? (KIND_META as Record<string, { color: string; icon: typeof Square }>)[kind]
      : KIND_META.task;
  const color = (data as { color?: string }).color ?? meta.color;
  const Icon = meta.icon;
  const isEvent = kind === "start" || kind === "intermediate" || kind === "end";
  const isGateway = kind === "gateway";

  if (isContainer) {
    return (
      <div className="relative h-full w-full rounded border" style={{ borderColor: color, background: `${color}10` }}>
        <PreviewAllHandles />
        <div className="px-1 text-[7px] font-semibold text-white truncate" style={{ background: color }}>{label}</div>
      </div>
    );
  }
  if (isGateway) {
    return (
      <div className="relative h-full w-full grid place-items-center" title={description || undefined}>
        <PreviewAllHandles />
        <div
          className="absolute inset-2 bg-card border-2"
          style={{ borderColor: color, transform: "rotate(45deg)" }}
        />
        <span className="relative text-[7px] font-medium text-center px-1 truncate max-w-[80%]">{label}</span>
      </div>
    );
  }
  return (
    <div
      className="relative h-full w-full bg-card border-2 px-1 py-0.5 text-[7px] font-medium leading-tight flex flex-col items-center justify-center text-center gap-0.5"
      style={{ borderColor: color, borderRadius: isEvent ? 999 : 6 }}
      title={description || undefined}
    >
      <PreviewAllHandles />
      <div className="flex items-center justify-center gap-0.5 max-w-full">
        <Icon className="h-2 w-2 shrink-0" style={{ color }} />
        <span className="truncate">{label}</span>
      </div>
      {kind === "subprocess" && subprocessDiagramName && (
        <span className="text-[6px] font-semibold truncate max-w-full px-1 rounded" style={{ color, background: `${color}20` }}>
          {subprocessDiagramName}
        </span>
      )}
    </div>
  );
}


const subprocessPreviewNodeTypes = {
  bpmn: SubprocessPreviewNode,
  pool: SubprocessPreviewNode,
  generic: SubprocessPreviewNode,
  dataEntity: SubprocessPreviewNode,
};

function SubprocessPreview({ diagramId }: { diagramId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["subprocess-preview", diagramId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("process_diagrams")
        .select("name,nodes,edges")
        .eq("id", diagramId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  if (isLoading) return <div className="text-[9px] text-muted-foreground p-1">Cargando…</div>;
  if (!data) return <div className="text-[9px] text-muted-foreground p-1">Subproceso no encontrado</div>;
  const previewNodes = ((data.nodes as unknown as Node[]) ?? []).map((n) => ({
    ...n,
    draggable: false,
    selectable: false,
    connectable: false,
  }));
  const previewEdges = ((data.edges as unknown as Edge[]) ?? []).map((e) => ({
    ...e,
    type: undefined,
    markerEnd: { type: MarkerType.ArrowClosed, color: "#9ca3af" },
    style: { stroke: "#9ca3af", strokeWidth: 1 },
  }));
  return (
    <div className="h-full w-full nodrag nopan">
      <ReactFlowProvider>
        <ReactFlow
          nodes={previewNodes}
          edges={previewEdges}
          nodeTypes={subprocessPreviewNodeTypes}
          fitView
          fitViewOptions={{ padding: 0.1 }}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          panOnDrag={false}
          panOnScroll={false}
          zoomOnScroll={false}
          zoomOnPinch={false}
          zoomOnDoubleClick={false}
          preventScrolling={false}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={12} size={1} />
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  );
}


// ---------- Expand linked subprocesses into a flat diagram ----------
// Replaces each "subprocess" node with the contents of its linked diagram.
// Variables: predecessor.outputs → expanded start.inputs ; expanded end.outputs → successor.inputs.
async function expandSubprocessesRecursive(
  rootNodes: Node[],
  rootEdges: Edge[],
): Promise<{ nodes: Node[]; edges: Edge[] }> {
  let counter = 0;
  const visiting = new Set<string>();

  const loadDiagram = async (id: string) => {
    const { data, error } = await supabase
      .from("process_diagrams")
      .select("name,nodes,edges")
      .eq("id", id)
      .maybeSingle();
    if (error || !data) return null;
    return {
      name: (data.name as string) ?? "",
      nodes: ((data.nodes as unknown) as Node[]) ?? [],
      edges: ((data.edges as unknown) as Edge[]) ?? [],
    };
  };

  const expand = async (
    nodes: Node[],
    edges: Edge[],
  ): Promise<{ nodes: Node[]; edges: Edge[] }> => {
    let outNodes: Node[] = nodes.map((n) => ({ ...n, data: { ...n.data } }));
    let outEdges: Edge[] = edges.map((e) => ({ ...e }));

    while (true) {
      const idx = outNodes.findIndex((n) => {
        const d = n.data as { kind?: string; subprocessDiagramId?: string } | undefined;
        return d?.kind === "subprocess" && !!d?.subprocessDiagramId;
      });
      if (idx === -1) break;

      const sub = outNodes[idx];
      const sd = sub.data as { subprocessDiagramId: string; subprocessDiagramName?: string; label?: string };
      const linkedId = sd.subprocessDiagramId;
      const linkedName = sd.subprocessDiagramName || sd.label || linkedId.slice(0, 6);

      if (visiting.has(linkedId)) {
        throw new Error(`Ciclo detectado en subprocesos vinculados ("${linkedName}")`);
      }
      visiting.add(linkedId);
      const loaded = await loadDiagram(linkedId);
      if (!loaded) {
        visiting.delete(linkedId);
        throw new Error(`No se pudo cargar el subproceso vinculado "${linkedName}"`);
      }
      const inner = await expand(loaded.nodes, loaded.edges);
      visiting.delete(linkedId);

      counter += 1;
      const prefix = `sp${counter}_`;

      // Drop organizational containers (pool / lane / subContainer) from the
      // inner diagram. They only make sense inside the source diagram and
      // dragging them in produces overlapping shapes around real flow nodes.
      const isContainer = (n: Node) => {
        const k = (n.data as { kind?: string } | undefined)?.kind ?? "";
        return k === "pool" || k === "lane" || k === "subContainer";
      };
      const droppedIds = new Set(inner.nodes.filter(isContainer).map((n) => n.id));
      const flowInnerNodes = inner.nodes.filter((n) => !isContainer(n));
      const flowInnerEdges = inner.edges.filter(
        (e) => !droppedIds.has(e.source) && !droppedIds.has(e.target),
      );

      const idMap = new Map<string, string>();
      flowInnerNodes.forEach((n) => idMap.set(n.id, prefix + n.id));

      // Inner flow nodes inherit the placeholder's lane so they stay inside
      // the same swimlane as the subprocess they replace. Final positions are
      // assigned later by layoutExpanded(); we just give them a sensible seed.
      const subParentId = (sub as { parentId?: string }).parentId;
      const anchor = sub.position ?? { x: 0, y: 0 };

      const mappedNodes: Node[] = flowInnerNodes.map((n, i) => {
        const next: Node = {
          ...n,
          id: idMap.get(n.id)!,
          position: { x: anchor.x, y: anchor.y + i * 10 },
          data: { ...n.data },
        };
        if (subParentId) (next as { parentId?: string }).parentId = subParentId;
        else delete (next as { parentId?: string }).parentId;
        return next;
      });

      const mappedEdges: Edge[] = flowInnerEdges.map((e) => ({
        ...e,
        id: prefix + e.id,
        source: idMap.get(e.source) ?? e.source,
        target: idMap.get(e.target) ?? e.target,
      }));

      const startNode = mappedNodes.find((n) => (n.data as { kind?: string })?.kind === "start");
      const endNode = mappedNodes.find((n) => (n.data as { kind?: string })?.kind === "end");
      if (!startNode) throw new Error(`El subproceso "${linkedName}" no tiene nodo de Inicio`);
      if (!endNode) throw new Error(`El subproceso "${linkedName}" no tiene nodo de Fin`);

      const incoming = outEdges.filter((e) => e.target === sub.id);
      const outgoing = outEdges.filter((e) => e.source === sub.id);

      // Predecessor outputs → start inputs
      const predOutputs: string[] = [];
      incoming.forEach((e) => {
        const pred = outNodes.find((n) => n.id === e.source);
        const outs = (pred?.data as { outputs?: string[] } | undefined)?.outputs ?? [];
        outs.forEach((v) => { if (!predOutputs.includes(v)) predOutputs.push(v); });
      });
      if (predOutputs.length) {
        const existing = (startNode.data as { inputs?: string[] }).inputs ?? [];
        const merged = [...existing];
        predOutputs.forEach((v) => { if (!merged.includes(v)) merged.push(v); });
        (startNode.data as { inputs?: string[] }).inputs = merged;
      }

      // End outputs → successor inputs
      const endOutputs = (endNode.data as { outputs?: string[] } | undefined)?.outputs ?? [];
      const successorIds = new Set(outgoing.map((e) => e.target));
      if (endOutputs.length) {
        outNodes = outNodes.map((n) => {
          if (!successorIds.has(n.id)) return n;
          const existing = (n.data as { inputs?: string[] } | undefined)?.inputs ?? [];
          const merged = [...existing];
          endOutputs.forEach((v) => { if (!merged.includes(v)) merged.push(v); });
          return { ...n, data: { ...n.data, inputs: merged } };
        });
      }

      // Rewire edges around the placeholder
      const rewired: Edge[] = outEdges
        .filter((e) => e.source !== sub.id && e.target !== sub.id)
        .concat(
          incoming.map((e, i) => ({ ...e, id: `${e.id}__in_${prefix}${i}`, target: startNode.id })),
          outgoing.map((e, i) => ({ ...e, id: `${e.id}__out_${prefix}${i}`, source: endNode.id })),
          mappedEdges,
        );

      outNodes = [
        ...outNodes.slice(0, idx),
        ...outNodes.slice(idx + 1),
        ...mappedNodes,
      ];
      outEdges = rewired;
    }

    return { nodes: outNodes, edges: outEdges };
  };

  return expand(rootNodes, rootEdges);
}





// ---------- Tidy layout for the expanded diagram ----------
// Top→bottom layered layout: Y indicates execution order (topological depth),
// X groups nodes by their lane (parentId). Containers (pool/lane) are left
// untouched; only flow nodes are repositioned.
function layoutExpanded(nodes: Node[], edges: Edge[]): Node[] {
  const isContainer = (n: Node) => {
    const k = (n.data as { kind?: string } | undefined)?.kind ?? "";
    return k === "pool" || k === "lane" || k === "subContainer";
  };
  const flow = nodes.filter((n) => !isContainer(n));
  const flowIds = new Set(flow.map((n) => n.id));

  const incomingCount = new Map<string, number>();
  const outgoing = new Map<string, string[]>();
  edges.forEach((e) => {
    if (!flowIds.has(e.source) || !flowIds.has(e.target)) return;
    outgoing.set(e.source, [...(outgoing.get(e.source) ?? []), e.target]);
    incomingCount.set(e.target, (incomingCount.get(e.target) ?? 0) + 1);
  });

  // Longest-path depth from any root (no incoming edges) — order of execution.
  const depth = new Map<string, number>();
  const queue: string[] = [];
  flow.forEach((n) => {
    if (!incomingCount.get(n.id)) {
      depth.set(n.id, 0);
      queue.push(n.id);
    }
  });
  let guard = flow.length * 4 + 16;
  while (queue.length && guard-- > 0) {
    const id = queue.shift()!;
    const d = depth.get(id) ?? 0;
    (outgoing.get(id) ?? []).forEach((t) => {
      const nd = (depth.get(t) ?? -1);
      if (d + 1 > nd) {
        depth.set(t, d + 1);
        queue.push(t);
      }
    });
  }
  flow.forEach((n) => { if (!depth.has(n.id)) depth.set(n.id, 0); });

  // Group flow nodes by lane (parentId). Nodes outside lanes form a "__root__"
  // column. Inside each group, nodes at the same depth share a row.
  const groups = new Map<string, Node[]>();
  flow.forEach((n) => {
    const pid = (n as { parentId?: string }).parentId ?? "__root__";
    groups.set(pid, [...(groups.get(pid) ?? []), n]);
  });

  const ROW_GAP = 130;
  const COL_GAP = 200;
  const PAD_X = 60;
  const PAD_Y = 60;

  const newPos = new Map<string, { x: number; y: number }>();
  for (const [, group] of groups) {
    const byDepth = new Map<number, Node[]>();
    group.forEach((n) => {
      const d = depth.get(n.id) ?? 0;
      byDepth.set(d, [...(byDepth.get(d) ?? []), n]);
    });
    const depths = [...byDepth.keys()].sort((a, b) => a - b);
    depths.forEach((d) => {
      const arr = byDepth.get(d)!;
      arr.sort((a, b) => a.id.localeCompare(b.id));
      const totalW = (arr.length - 1) * COL_GAP;
      arr.forEach((n, i) => {
        newPos.set(n.id, {
          x: PAD_X + i * COL_GAP - totalW / 2 + (arr.length > 1 ? totalW / 2 : 0),
          y: PAD_Y + d * ROW_GAP,
        });
      });
    });
  }

  return nodes.map((n) => {
    const p = newPos.get(n.id);
    return p ? { ...n, position: p } : n;
  });
}


// ---------- BPMN node ----------



function BpmnNode({ id, data, selected }: NodeProps) {
  const kind = (data as { kind: BpmnKind }).kind;
  const label = (data as { label: string }).label;
  const customColor = (data as { color?: string }).color;
  const runState = (data as { runState?: "current" | "completed" | "pending" }).runState;
  const meta = KIND_META[kind];
  const color = customColor ?? meta.color;
  const Icon = meta.icon;
  const isStart = kind === "start";
  const isEnd = kind === "end";
  const isEvent = isStart || isEnd || kind === "intermediate";
  const isGateway = kind === "gateway";
  const stateBg =
    runState === "current" ? "bg-rose-500/25" :
    runState === "completed" ? "bg-emerald-500/25" :
    runState === "pending" ? "bg-amber-500/20" : "bg-card";
  const stateRing = runState === "current" ? "ring-2 ring-rose-500" : "";
  const polyFill =
    runState === "current" ? "#fecdd3" :
    runState === "completed" ? "#a7f3d0" :
    runState === "pending" ? "#fde68a" : "#ffffff";


  const dispatch = (patch: Record<string, unknown>) =>
    window.dispatchEvent(new CustomEvent("modeler-node-update", { detail: { id, patch } }));

  const description = (data as { description?: string }).description;
  const version = (data as { version?: string }).version;
  const nodeType = (data as { nodeType?: string }).nodeType;
  const metaLine = [version && `v${version}`, nodeType && `tipo ${nodeType}`].filter(Boolean).join(" · ");

  if (isGateway) {
    const rules = (data as { rules?: GatewayRule[] }).rules ?? [];
    const condition = formatGatewayRules(rules);
    return (
      <div className="relative h-full w-full" style={{ minWidth: 110, minHeight: 110 }}>
        <NodeResizer minWidth={110} minHeight={110} isVisible={selected} lineClassName="!hidden" handleClassName="!bg-primary !border-primary !h-2.5 !w-2.5" />
        <Handle id="t-t" type="target" position={Position.Top} style={inHandleStyle} />
        <Handle id="l-s" type="source" position={Position.Left} style={outHandleStyle} />
        <Handle id="r-s" type="source" position={Position.Right} style={outHandleStyle} />
        <Handle id="b-s" type="source" position={Position.Bottom} style={outHandleStyle} />
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full pointer-events-none">
          <polygon points="50,3 97,50 50,97 3,50" fill={polyFill} stroke={runState === "current" ? "#e11d48" : color} strokeWidth={runState === "current" ? 3 : 2} strokeLinejoin="miter" vectorEffect="non-scaling-stroke" />
        </svg>

        <div className="absolute inset-0 grid place-items-center">
          <div className="flex flex-col items-center gap-0.5 px-3 text-center" style={{ maxWidth: "75%" }}>
            <Icon className="h-4 w-4 shrink-0" style={{ color }} />
            <span className="text-[10px] font-medium leading-tight line-clamp-1">{label}</span>
            {condition ? (
              <span
                className="text-[9px] font-semibold leading-tight line-clamp-3 break-words"
                style={{ color }}
                title={`If ${condition}`}
              >
                If {condition}
              </span>
            ) : (
              <span className="text-[8px] italic text-muted-foreground leading-tight">sin regla</span>
            )}
            {metaLine && <span className="text-[8px] text-muted-foreground leading-tight">{metaLine}</span>}
          </div>
        </div>
        {selected && (
          <input
            type="color"
            value={color}
            onChange={(e) => dispatch({ color: e.target.value })}
            className="absolute -top-2 -right-2 h-5 w-5 cursor-pointer rounded border bg-background p-0"
            title="Color"
          />
        )}
      </div>
    );
  }

  return (
    <div className="relative h-full w-full" style={{ minWidth: isEvent ? 80 : 110, minHeight: 40 }}>
      <NodeResizer
        minWidth={isEvent ? 80 : 110}
        minHeight={40}
        isVisible={selected}
        lineClassName="!hidden"
        handleClassName="!bg-primary !border-primary !h-2.5 !w-2.5"
      />
      {isStart ? (
        <>
          <Handle id="t-t" type="target" position={Position.Top} style={inHandleStyle} />
          <Handle id="l-s" type="source" position={Position.Left} style={outHandleStyle} />
          <Handle id="r-s" type="source" position={Position.Right} style={outHandleStyle} />
          <Handle id="b-s" type="source" position={Position.Bottom} style={outHandleStyle} />
        </>
      ) : isEnd ? (
        <>
          <Handle id="t-t" type="target" position={Position.Top} style={inHandleStyle} />
          <Handle id="l-t" type="target" position={Position.Left} style={inHandleStyle} />
          <Handle id="r-t" type="target" position={Position.Right} style={inHandleStyle} />
          <Handle id="b-s" type="source" position={Position.Bottom} style={outHandleStyle} />
        </>
      ) : kind === "subprocess" ? (
        <>
          <Handle id="t-t" type="target" position={Position.Top} style={inHandleStyle} />
          <Handle id="l-t" type="target" position={Position.Left} style={inHandleStyle} />
          <Handle id="r-s" type="source" position={Position.Right} style={outHandleStyle} />
        </>
      
      ) : kind === "task" ? (
        <>
          <Handle id="t-t" type="target" position={Position.Top} style={inHandleStyle} />
          <Handle id="l-t" type="target" position={Position.Left} style={inHandleStyle} />
        </>
      ) : (
        <>
          <Handle id="t-t" type="target" position={Position.Top} style={inHandleStyle} />
          <Handle id="t-s" type="source" position={Position.Top} style={outHandleStyle} />
          <Handle id="l-t" type="target" position={Position.Left} style={inHandleStyle} />
          <Handle id="l-s" type="source" position={Position.Left} style={outHandleStyle} />
          <Handle id="r-t" type="target" position={Position.Right} style={inHandleStyle} />
          <Handle id="r-s" type="source" position={Position.Right} style={outHandleStyle} />
        </>
      )}
      {kind === "task" && (
        <Handle id="r-s" type="source" position={Position.Right} style={outHandleStyle} />
      )}
      <div
        className={`flex h-full w-full flex-col items-stretch gap-0.5 px-3 py-1.5 text-xs font-medium shadow-sm text-card-foreground border-2 ${stateBg} ${stateRing}`}
        style={{ borderColor: runState === "current" ? "#e11d48" : color, borderRadius: isEvent ? 999 : 8 }}

        title={description || undefined}
      >
        <div className="flex items-center justify-center gap-1.5">
          <Icon className="h-3.5 w-3.5 shrink-0" style={{ color }} />
          <span className="truncate">{label}</span>
          {kind === "subprocess" && (data as { subprocessDiagramId?: string }).subprocessDiagramId && (
            <button
              type="button"
              onPointerDownCapture={(e) => e.stopPropagation()}
              onMouseDownCapture={(e) => e.stopPropagation()}
              onClickCapture={(e) => {
                e.stopPropagation();
                e.preventDefault();
                dispatch({ expanded: !(data as { expanded?: boolean }).expanded });
              }}
              style={{ pointerEvents: "auto", zIndex: 50 }}
              className="ml-1 relative flex items-center justify-center w-7 h-7 rounded-lg bg-primary text-primary-foreground text-base font-bold hover:bg-primary/90 nodrag nopan shadow-md border-2 border-primary-foreground/30 transition-colors cursor-pointer"
              title={(data as { expanded?: boolean }).expanded ? "Colapsar" : "Expandir"}
            >
              {(data as { expanded?: boolean }).expanded ? "−" : "+"}
            </button>
          )}
        </div>
        {kind === "subprocess" && (data as { subprocessDiagramName?: string }).subprocessDiagramName && (
          <div className="flex justify-center">
            <span className="text-[10px] font-semibold text-primary leading-tight text-center truncate max-w-full px-2 py-0.5 bg-primary/15 rounded-md border border-primary/20">
              {(data as { subprocessDiagramName?: string }).subprocessDiagramName}
            </span>
          </div>
        )}
        {metaLine && <span className="text-[9px] text-muted-foreground leading-tight text-center">{metaLine}</span>}
        {kind === "subprocess" && (data as { expanded?: boolean }).expanded && (data as { subprocessDiagramId?: string }).subprocessDiagramId && (
          <div className="mt-1 flex-1 min-h-[80px] rounded border bg-background/50 overflow-hidden">
            <SubprocessPreview diagramId={(data as { subprocessDiagramId: string }).subprocessDiagramId} />
          </div>
        )}
      </div>

      {isStart ? (
        <Handle id="b-s" type="source" position={Position.Bottom} style={outHandleStyle} />
      ) : isEnd ? (
        <Handle id="b-s" type="source" position={Position.Bottom} style={outHandleStyle} />
      ) : kind === "subprocess" ? (
        <Handle id="b-s" type="source" position={Position.Bottom} style={outHandleStyle} />
      ) : kind === "task" ? (
        <Handle id="b-s" type="source" position={Position.Bottom} style={outHandleStyle} />
      ) : (
        <>
          <Handle id="b-t" type="target" position={Position.Bottom} style={inHandleStyle} />
          <Handle id="b-s" type="source" position={Position.Bottom} style={outHandleStyle} />
        </>
      )}
      {selected && (
        <input
          type="color"
          value={color}
          onChange={(e) => dispatch({ color: e.target.value })}
          className="absolute -top-2 -right-2 h-5 w-5 cursor-pointer rounded border bg-background p-0"
          title="Color"
        />
      )}
    </div>
  );
}



// ---------- Pool / Lane node (Pool & Lane share UI; with role select) ----------

function PoolNode({ id, data, selected }: NodeProps) {
  const label = (data as { label: string }).label ?? "";
  const role = (data as { role?: string }).role ?? ""; void role;
  const entityId = (data as { entity_id?: string | null }).entity_id ?? "";
  const kind = (data as { kind: BpmnKind | "subContainer" }).kind;
  const paletteLabel = (data as { paletteLabel?: string }).paletteLabel;
  const isSubContainer = kind === "subContainer";
  const meta = isSubContainer ? KIND_META.subprocess : KIND_META[kind as BpmnKind];
  const Icon = isSubContainer ? KIND_META.subprocess.icon : (kind === "pool" && paletteLabel === "Subproceso" ? KIND_META.subprocess.icon : meta.icon);
  const isLane = kind === "lane";
  const isEntityPool = kind === "pool" && paletteLabel !== "Subproceso";

  const dispatch = (patch: Record<string, unknown>) =>
    window.dispatchEvent(new CustomEvent("modeler-node-update", { detail: { id, patch } }));

  // Entidades (para el pool)
  const entitiesQuery = useQuery({
    queryKey: ["modeler-entities"],
    queryFn: async () => {
      const { data, error } = await supabase.from("entities").select("id,name").order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
    enabled: isEntityPool,
    staleTime: 60_000,
  });

  const onSelectEntity = (val: string) => {
    const ent = entitiesQuery.data?.find((e) => e.id === val);
    dispatch({ entity_id: val, label: ent?.name ?? "" });
  };

  return (
    <div className="relative h-full w-full">
      <NodeResizer minWidth={200} minHeight={100} isVisible={selected} lineClassName="!hidden" handleClassName="!bg-primary !border-primary !h-2.5 !w-2.5" />
      {/* El contenedor de subproceso no expone handles: actúa solo como
          marco visual y agrupador de los nodos BPMN del subproceso. */}
      <div className="flex h-full w-full flex-col rounded-md border-2 bg-card text-card-foreground shadow-sm overflow-hidden" style={{ borderColor: meta.color }}>
        <div className="pool-drag-handle flex items-center gap-2 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-white cursor-move" style={{ background: meta.color }}>
          <Icon className="h-3 w-3" />
          <span>{(data as { paletteLabel?: string }).paletteLabel ?? meta.label}</span>
        </div>
        <div className="grid flex-1 gap-1 p-2">
          {selected ? (
            <>
              {isEntityPool ? (
                <input
                  value={label}
                  onChange={(e) => dispatch({ label: e.target.value })}
                  className="w-full rounded border bg-background px-2 py-1 text-xs outline-none"
                  placeholder="Nombre de la entidad…"
                />
              ) : isLane ? (
                <input
                  value={label}
                  onChange={(e) => dispatch({ label: e.target.value })}
                  className="w-full rounded border bg-background px-2 py-1 text-xs outline-none"
                  placeholder="Nombre de la calle…"
                />
              ) : (
                <input
                  value={label}
                  onChange={(e) => dispatch({ label: e.target.value })}
                  className="w-full rounded border bg-background px-2 py-1 text-xs outline-none"
                  placeholder="Nombre…"
                />
              )}
            </>
          ) : (
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-semibold truncate">{label || "—"}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


// ---------- Generic rectangular node ----------

function GenericNode({ id, data, selected }: NodeProps) {
  const label = (data as { label: string }).label ?? "";
  const color = (data as { color?: string }).color ?? "#3b82f6";
  const paletteLabel = (data as { paletteLabel?: string }).paletteLabel ?? "";
  const processType = (data as { processType?: ProcessType }).processType;
  const kind = (data as { kind?: string }).kind;
  const showProcessType = kind === "cv.clave";
  const swapHandles = kind === "macro.transversal" || kind === "macro.apoyo";
  const topType = swapHandles ? "source" : "target";
  const leftType = "target";
  const rightType = "source";
  const bottomType = swapHandles ? "target" : "source";
  const topStyle = swapHandles ? outHandleStyle : inHandleStyle;
  const leftStyle = inHandleStyle;
  const rightStyle = outHandleStyle;
  let bottomStyle = swapHandles ? inHandleStyle : outHandleStyle;
  let bottomTypeFinal: "source" | "target" = bottomType;
  if (kind === "macro.misional") {
    bottomTypeFinal = "target";
    bottomStyle = inHandleStyle;
  }

  const dispatch = (patch: Record<string, unknown>) =>
    window.dispatchEvent(new CustomEvent("modeler-node-update", { detail: { id, patch } }));

  const hideHandles = kind === "macro.macroproceso" || kind === "subContainer";

  return (
    <div className="relative h-full w-full">
      <NodeResizer minWidth={120} minHeight={60} isVisible={selected} lineClassName="!border-primary" handleClassName="!bg-primary !border-primary" />
      {!hideHandles && (
        <>
          <Handle id="t" type={topType} position={Position.Top} style={topStyle} />
          <Handle id="l" type={leftType} position={Position.Left} style={leftStyle} />
          <Handle id="r" type={rightType} position={Position.Right} style={rightStyle} />
          <Handle id="b" type={bottomTypeFinal} position={Position.Bottom} style={bottomStyle} />
        </>
      )}
      <div className="flex h-full w-full flex-col rounded-md border-2 bg-card text-card-foreground shadow-sm overflow-hidden" style={{ borderColor: color }}>
        <div className="flex items-center justify-between gap-1 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-white" style={{ background: color }}>
          <span className="truncate">{paletteLabel}</span>
          {selected && (
            <input type="color" value={color} onChange={(e) => dispatch({ color: e.target.value })} className="h-4 w-5 cursor-pointer rounded border-none bg-transparent p-0" title="Color" />
          )}
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-1 p-2">
          {selected ? (
            <input value={label} onChange={(e) => dispatch({ label: e.target.value })} className="w-full bg-transparent text-center text-xs font-medium outline-none" placeholder="Nombre…" />
          ) : (
            <span className="text-center text-xs font-medium break-words whitespace-pre-line">{label || "—"}</span>
          )}
          {showProcessType && (
            selected ? (
              <select
                value={processType ?? ""}
                onChange={(e) => dispatch({ processType: e.target.value })}
                className="w-full rounded border bg-background px-1 py-0.5 text-[10px] outline-none"
              >
                <option value="">— Tipo de proceso —</option>
                {Object.entries(PROCESS_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            ) : processType ? (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[9px] font-medium uppercase tracking-wider">
                {PROCESS_TYPE_LABELS[processType]}
              </span>
            ) : null
          )}
          {kind === "macro.macroproceso" && (data as { linkedProcessDiagramName?: string }).linkedProcessDiagramName && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                const d = data as { linkedProcessDiagramId?: string; linkedProcessLevel?: string; linkedProcessNodeId?: string };
                if (d.linkedProcessDiagramId && d.linkedProcessLevel && d.linkedProcessNodeId) {
                  window.dispatchEvent(new CustomEvent("modeler-open-linked-process", { detail: { level: d.linkedProcessLevel, nodeId: d.linkedProcessNodeId } }));
                }
              }}
              className="rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary truncate max-w-full hover:bg-primary/20 cursor-pointer"
              title="Ir al diagrama de proceso vinculado"
            >
              ↳ {(data as { linkedProcessDiagramName?: string }).linkedProcessDiagramName}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- Data-model entity node ----------

const FIELD_TYPES = [
  "Id", "Texto", "Entero", "Decimal", "Moneda", "Fecha", "Hora",
  "eMail", "Cuenta Banco", "DNI", "Teléfono (País)", "Teléfono (Número)",
] as const;
type FieldType = (typeof FIELD_TYPES)[number];
type DataField = { id: string; name: string; type: FieldType };

type DbColumn = {
  id: string;
  field_id: string;
  is_primary_key: boolean;
  is_nullable: boolean;
  fk_target_node_id: string | null;
  fk_target_column_id: string | null;
  entity_field_catalog: { name: string; data_type: string } | null;
};
type DataDiagramCtx = {
  columnsByNode: Map<string, DbColumn[]>;
  tableLabelById: Map<string, string>;
  autoFkColIds: Set<string>;
};
const DataDiagramContext = createContext<DataDiagramCtx>({
  columnsByNode: new Map(),
  tableLabelById: new Map(),
  autoFkColIds: new Set(),
});

function DataEntityNode({ id, data, selected }: NodeProps) {
  const color = (data as { color?: string }).color ?? "#0ea5e9";
  const { columnsByNode, tableLabelById, autoFkColIds } = useContext(DataDiagramContext);
  const dbCols = columnsByNode.get(id) ?? [];
  const showDb = dbCols.length > 0;
  // Label always comes from the registry (entity_diagram_tables). Fallback to node.data.label
  // only while the registry is loading.
  const label = tableLabelById.get(id) ?? String((data as { label?: string }).label ?? "Tabla");

  const dispatch = (patch: Record<string, unknown>) =>
    window.dispatchEvent(new CustomEvent("modeler-node-update", { detail: { id, patch } }));


  // Approximate row geometry — must match the field row rendering below.
  const DATA_HEADER_H = 28; // colored title bar + border
  const DATA_BODY_PAD = 4;  // p-1
  const DATA_ROW_H = 20;    // text-[11px] + py-0.5

  return (
    <div className="relative h-full w-full min-w-[220px]">
      <NodeResizer minWidth={220} minHeight={120} isVisible={selected} lineClassName="!border-primary" handleClassName="!bg-primary !border-primary" />
      {/* Handles render for every column so existing FK edges resolve.
          Visible source dot for PK (outgoing). Visible target dot for FK (incoming).
          PK columns intentionally have NO visible input/target handle. */}
      {showDb && dbCols.map((c, idx) => {
        const isPk = !!c.is_primary_key;
        const isFk = !!c.fk_target_node_id || autoFkColIds.has(c.id);
        const top = DATA_HEADER_H + DATA_BODY_PAD + idx * DATA_ROW_H + DATA_ROW_H / 2;
        const hiddenStyle: React.CSSProperties = { top, background: "transparent", border: "none", width: 1, height: 1, opacity: 0, pointerEvents: "none", zIndex: 10 };
        const targetStyle: React.CSSProperties = isFk
          ? { top, background: "#16a34a", border: "1.5px solid #14532d", width: 10, height: 10, zIndex: 10 }
          : hiddenStyle;
        const sourceStyle: React.CSSProperties = isPk
          ? { top, background: "#ea580c", border: "1.5px solid #7c2d12", width: 10, height: 10, zIndex: 10 }
          : hiddenStyle;
        return (
          <Fragment key={`fk-h-${c.id}`}>
            <Handle id={`col-${c.id}-t`} type="target" position={Position.Left} style={targetStyle} />
            <Handle id={`col-${c.id}-s`} type="source" position={Position.Right} style={sourceStyle} />
          </Fragment>
        );
      })}

      <div className="flex h-full w-full flex-col rounded-md border-2 bg-card text-card-foreground shadow-sm overflow-hidden" style={{ borderColor: color }}>
        <div className="flex items-center justify-between gap-1 px-2 py-1 text-white" style={{ background: color }}>
          <span
            className="flex-1 truncate bg-transparent text-xs font-semibold uppercase tracking-wider"
            style={{ color: "white" }}
            title={`${label} — el nombre se edita desde Campos_Tablas`}
          >
            {label}
          </span>

          {selected && (
            <input type="color" value={color} onChange={(e) => dispatch({ color: e.target.value })} className="h-4 w-5 cursor-pointer rounded border-none bg-transparent p-0" />
          )}
        </div>

        <div className="flex-1 overflow-auto p-1 text-[11px]">
          {showDb ? (
            <>
              {dbCols.map((c) => {
                const fkLabel = c.fk_target_node_id ? tableLabelById.get(c.fk_target_node_id) ?? "?" : null;
                return (
                  <div key={c.id} className="flex items-center gap-1 px-1 py-0.5 hover:bg-muted/50 rounded" style={{ height: DATA_ROW_H }}>
                    {c.is_primary_key && (
                      <span title="Clave primaria" className="rounded border border-amber-500/50 px-1 text-[9px] font-bold uppercase text-amber-700 dark:text-amber-300">
                        PK
                      </span>
                    )}
                    {c.fk_target_node_id && (
                      <span
                        title={`FK → ${fkLabel}`}
                        className="rounded border border-blue-500/50 px-1 text-[9px] font-bold uppercase text-blue-700 dark:text-blue-300"
                      >
                        FK
                      </span>
                    )}
                    <span className="flex-1 truncate font-medium">{c.entity_field_catalog?.name ?? "?"}</span>
                    <span className="text-muted-foreground">{c.entity_field_catalog?.data_type ?? ""}</span>
                  </div>
                );
              })}
            </>
          ) : (
            <p className="px-1 py-2 text-center text-[10px] text-muted-foreground">
              Sin columnas. Añádelas desde Campos_Tablas.
            </p>
          )}
        </div>

      </div>
    </div>
  );
}


// ---------- Labeled edge (cardinality) ----------

function LabeledEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, style, data }: EdgeProps) {
  const [edgePath, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  const d = data as { cardinality?: string; description?: string; branch?: "true" | "false" } | undefined;
  const branchLabel = d?.branch === "true" ? "Verdadero" : d?.branch === "false" ? "Falso" : null;
  const label = branchLabel ?? d?.cardinality ?? d?.description;
  const branchClass =
    d?.branch === "true"
      ? "border-emerald-500 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-semibold uppercase tracking-wider"
      : d?.branch === "false"
      ? "border-rose-500 bg-rose-500/15 text-rose-700 dark:text-rose-300 font-semibold uppercase tracking-wider"
      : "bg-card text-foreground font-medium";
  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={style} />
      {label && (
        <EdgeLabelRenderer>
          <div
            style={{ position: "absolute", transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
            className={`pointer-events-none rounded-md border px-2 py-0.5 text-[10px] shadow ${branchClass}`}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

// ---------- FK edge (crow's foot, dashed blue, animated parent→child) ----------

function FkEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style, selected }: EdgeProps) {
  const [path] = getSmoothStepPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, borderRadius: 8 });
  return (
    <BaseEdge
      id={id}
      path={path}
      style={{
        stroke: selected ? "#dc2626" : "#2563eb",
        strokeWidth: selected ? 3 : 2,
        strokeDasharray: "6 4",
        color: selected ? "#dc2626" : "#2563eb",
        ...style,
      }}
      markerStart="url(#er-one)"
      markerEnd="url(#er-many)"
    />
  );
}

const GATEWAY_OPS = ["=", "≠", "<", "≤", ">", "≥", "contiene", "vacío"] as const;
const formatGatewayRules = formatGatewayRulesBpm;


// ---------- Phase node (transparent overlay container, marching ants) ----------
function PhaseNode({ id, data, selected }: NodeProps) {
  const label = (data as { label?: string }).label ?? "Fase";
  const color = (data as { color?: string }).color ?? "#8b5cf6";
  const dispatch = (patch: Record<string, unknown>) =>
    window.dispatchEvent(new CustomEvent("modeler-node-update", { detail: { id, patch } }));
  return (
    <div className="relative h-full w-full" style={{ pointerEvents: "none" }}>
      <NodeResizer
        minWidth={160}
        minHeight={100}
        isVisible={selected}
        lineClassName="!hidden"
        handleClassName="!bg-primary !border-primary !h-2.5 !w-2.5"
        handleStyle={{ pointerEvents: "auto" }}
      />
      <svg className="absolute inset-0 h-full w-full overflow-visible" style={{ pointerEvents: "none" }}>
        <rect
          x="1" y="1" width="calc(100% - 2px)" height="calc(100% - 2px)"
          rx="10" ry="10"
          fill="transparent" stroke={color} strokeWidth="2"
          strokeDasharray="8 6"
          className="modeler-phase-dash"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div
        className="phase-drag-handle absolute left-2 top-2 inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider shadow-sm cursor-move max-w-[80%]"
        style={{ background: color, color: "#fff", pointerEvents: "auto" }}
        title={label}
      >
        <SquareDashed className="h-3 w-3 shrink-0" />
        <span className="truncate">{label || "Fase"}</span>
      </div>
      {selected && (
        <input
          type="color"
          value={color}
          onChange={(e) => dispatch({ color: e.target.value })}
          className="absolute -top-2 -right-2 h-5 w-5 cursor-pointer rounded border bg-background p-0"
          style={{ pointerEvents: "auto" }}
          title="Color"
        />
      )}
    </div>
  );
}

const nodeTypes = { bpmn: BpmnNode, pool: PoolNode, generic: GenericNode, dataEntity: DataEntityNode, phase: PhaseNode };
const edgeTypes = { labeled: LabeledEdge, fk: FkEdge };

// Refresh React Flow's cached handle positions for every data-entity node
// whenever `tick` changes. Lives inside <ReactFlow> so it can use the RF
// context without an outer <ReactFlowProvider>. No DOM output.
function FkHandleRefresher({ tick, nodeIds }: { tick: number; nodeIds: string[] }) {
  const update = useUpdateNodeInternals();
  useEffect(() => {
    if (!nodeIds.length) return;
    // Defer to next frame so RF has finished applying node changes first.
    const raf = requestAnimationFrame(() => {
      nodeIds.forEach((id) => update(id));
    });
    return () => cancelAnimationFrame(raf);
  }, [tick, nodeIds, update]);
  return null;
}

// ---------- Name field for properties panel (dropdown for pool/lane) ----------
function NodeNameField({
  selectedNode,
  nodes,
  onChange,
}: {
  selectedNode: Node;
  nodes: Node[];
  onChange: (patch: Record<string, unknown>) => void;
}) {
  const d = selectedNode.data as {
    label?: string;
    kind?: string;
    paletteLabel?: string;
    entity_id?: string | null;
    position_id?: string | null;
  };
  const isEntityPool = d.kind === "pool" && d.paletteLabel !== "Subproceso";
  const isLane = d.kind === "lane";

  const entitiesQuery = useQuery({
    queryKey: ["modeler-entities"],
    queryFn: async () => {
      const { data, error } = await supabase.from("entities").select("id,name").order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
    enabled: isEntityPool,
    staleTime: 60_000,
  });

  if (isEntityPool) {
    return (
      <Input
        value={d.label ?? ""}
        onChange={(e) => onChange({ label: e.target.value })}
        className="h-8 text-sm"
        maxLength={200}
        placeholder="Nombre de la entidad"
      />
    );
  }


  if (isLane) {
    return (
      <Input
        value={d.label ?? ""}
        onChange={(e) => onChange({ label: e.target.value })}
        className="h-8 text-sm"
        maxLength={200}
        placeholder="Nombre de la calle"
      />
    );
  }

  return (
    <Input
      value={d.label ?? ""}
      onChange={(e) => onChange({ label: e.target.value })}
      className="h-8"
      maxLength={200}
    />
  );
}

// ---------- Page ----------

function ModelerPage() {
  const { t } = useTranslation();
  const { canEdit } = useAuth();
  const { withTenant, currentClientId, currentClient, environment, setCurrentClientId, setEnvironment } = useClient();
  const { entity: selectedEntity, setEntity } = useSelectedEntity();
  const search = Route.useSearch();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [loadedName, setLoadedName] = useState<string | null>(null);
  const [diagramType, setDiagramType] = useState<DiagramType>(search.type || "macroprocesos");
  useEffect(() => {
    if (diagramType === "datos") setName("BD de Negocio");
  }, [diagramType]);

  // Diagrama de datos único: auto-seleccionar y cargar si llegamos sin level/id
  useEffect(() => {
    if (diagramType !== "datos") return;
    if (search.level && search.id) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("process_diagrams")
        .select("level,node_id")
        .eq("diagram_type", "datos")
        .limit(1)
        .maybeSingle();
      if (cancelled || !data?.level || !data?.node_id) return;
      navigate({
        to: "/modeler",
        search: (prev: SearchT) => ({ ...prev, type: "datos" as DiagramType, level: data.level as LevelKey, id: data.node_id }),
        replace: true,
      });
    })();
    return () => { cancelled = true; };
  }, [diagramType, search.level, search.id]);
  const [diagramId, setDiagramId] = useState<string | null>(null);
  // Clase del diagrama de flujo (solo aplica cuando diagramType === "procesos").
  // Se persiste como diagram_type = "procesos" | "subprocesos".
  const [diagramClass, setDiagramClass] = useState<"proceso" | "subproceso">("proceso");
  const [classDialogOpen, setClassDialogOpen] = useState(false);
  const [classDialogMode, setClassDialogMode] = useState<"save" | "duplicate">("save");
  const [classDialogChoice, setClassDialogChoice] = useState<"proceso" | "subproceso">("proceso");
  const [pendingDuplicate, setPendingDuplicate] = useState<{ id: string } | null>(null);
  const [paletteWidth, setPaletteWidth] = useState<number>(224);

  const [parentRef, setParentRef] = useState<{ table: string; id: string } | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [edgePropsOpenId, setEdgePropsOpenId] = useState<string | null>(null);
  const [propertiesOpenId, setPropertiesOpenId] = useState<string | null>(null);
  const [linkProcessForNodeId, setLinkProcessForNodeId] = useState<string | null>(null);
  const [variablesOpen, setVariablesOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [fieldsOpen, setFieldsOpen] = useState(false);
  const [validateOpen, setValidateOpen] = useState(false);
  const ALL_CHECKS = [
    { id: "start", label: "Tiene al menos un nodo de Inicio" },
    { id: "end", label: "Tiene al menos un nodo de Fin" },
    { id: "names", label: "Todos los nodos tienen nombre" },
    { id: "gateways", label: "Los gateways (decisiones) tienen 2 salidas" },
    { id: "subprocess", label: "Los subprocesos tienen un proceso vinculado" },
    { id: "duplicates", label: "No hay nombres de nodo duplicados" },
  ] as const;
  type CheckId = typeof ALL_CHECKS[number]["id"];
  const [validateChecks, setValidateChecks] = useState<Set<CheckId>>(() => new Set(ALL_CHECKS.map((c) => c.id)));
  const [validateResults, setValidateResults] = useState<Array<{ id: CheckId; label: string; ok: boolean; details: string[]; failingIds: string[]; scope: string }> | null>(null);
  const [failingNodeIds, setFailingNodeIds] = useState<Set<string>>(() => new Set());
  const [validateShowOnDiagram, setValidateShowOnDiagram] = useState(true);
  const [validateShowOnPanel, setValidateShowOnPanel] = useState(true);
  const [validateRunning, setValidateRunning] = useState(false);
  // Bump to force FK edges + node-handle internals to refresh on table add/remove,
  // move, or canvas click (data-model only).
  const [edgeRefreshTick, setEdgeRefreshTick] = useState(0);
  const bumpEdges = useCallback(() => setEdgeRefreshTick((n) => n + 1), []);

  // Load columns for "datos" diagrams so each entity node can render its DB-backed fields
  const listColumnsFn = useServerFn(listDiagramColumns);
  const listTablesFn = useServerFn(listDiagramTables);
  const dataColumnsQ = useQuery({
    queryKey: ["entity-table-columns", diagramId],
    enabled: !!diagramId && diagramType === "datos",

    queryFn: async () => (await listColumnsFn({ data: { diagramId: diagramId! } })) as (DbColumn & { node_id: string })[],
  });
  const dataTablesQ = useQuery({
    queryKey: ["entity-diagram-tables", diagramId],
    enabled: !!diagramId && diagramType === "datos",
    queryFn: async () =>
      (await listTablesFn({ data: { diagramId: diagramId! } })) as { id: string; label: string }[],
  });
  const dataDiagramCtxValue = useMemo<DataDiagramCtx>(() => {
    const columnsByNode = new Map<string, DbColumn[]>();
    for (const c of (dataColumnsQ.data ?? []) as (DbColumn & { node_id: string })[]) {
      const list = columnsByNode.get(c.node_id) ?? [];
      list.push(c);
      columnsByNode.set(c.node_id, list);
    }
    const tableLabelById = new Map<string, string>();
    // Labels come from the registry (entity_diagram_tables), not from node.data.label.
    for (const t of (dataTablesQ.data ?? [])) {
      tableLabelById.set(t.id, t.label);
    }
    // PK columns indexed by normalized name (one node may have at most one PK per name).
    const pkByName = new Map<string, { nodeId: string; col: DbColumn }>();
    for (const [nodeId, cols] of columnsByNode) {
      for (const c of cols) {
        if (!c.is_primary_key) continue;
        const n = (c.entity_field_catalog?.name ?? "").trim().toLowerCase();
        if (!n) continue;
        if (!pkByName.has(n)) pkByName.set(n, { nodeId, col: c });
      }
    }
    // Any non-PK column whose name matches a PK in another node is treated as FK by-name.
    const autoFkColIds = new Set<string>();
    for (const [nodeId, cols] of columnsByNode) {
      for (const c of cols) {
        if (c.is_primary_key) continue;
        const n = (c.entity_field_catalog?.name ?? "").trim().toLowerCase();
        if (!n) continue;
        const pk = pkByName.get(n);
        if (pk && pk.nodeId !== nodeId) autoFkColIds.add(c.id);
      }
    }
    return { columnsByNode, tableLabelById, autoFkColIds };
  }, [dataColumnsQ.data, dataTablesQ.data]);


  // Synthetic edges derived from FK metadata + auto-detected by-name PK/FK matches.
  // Drawn parent→child with crow's foot markers and an animated dashed blue line.
  const fkEdges = useMemo<Edge[]>(() => {
    if (diagramType !== "datos") return [];
    const out: Edge[] = [];
    const seenChildCol = new Set<string>();
    const columnById = new Map<string, DbColumn>();
    for (const cols of dataDiagramCtxValue.columnsByNode.values()) {
      for (const col of cols) columnById.set(col.id, col);
    }
    // 1) Explicit FK metadata edges
    for (const [childNodeId, cols] of dataDiagramCtxValue.columnsByNode) {
      for (const c of cols) {
        if (c.fk_target_node_id && c.fk_target_column_id) {
          const sourceCol = columnById.get(c.fk_target_column_id);
          const sourceHasHandle = !!sourceCol && (sourceCol.is_primary_key || !!sourceCol.fk_target_node_id);
          const targetHasHandle = c.is_primary_key || !!c.fk_target_node_id || dataDiagramCtxValue.autoFkColIds.has(c.id);
          out.push({
            id: `fk-${c.id}`,
            source: c.fk_target_node_id,
            sourceHandle: sourceHasHandle ? `col-${c.fk_target_column_id}-s` : undefined,
            target: childNodeId,
            targetHandle: targetHasHandle ? `col-${c.id}-t` : undefined,
            type: "fk",
            animated: true,
            selectable: true,
            data: { childColId: c.id },
          });
          seenChildCol.add(c.id);
        }
      }
    }
    // 2) Auto by-name PK/FK matches
    const pkByName = new Map<string, { nodeId: string; col: DbColumn }>();
    for (const [nodeId, cols] of dataDiagramCtxValue.columnsByNode) {
      for (const c of cols) {
        if (!c.is_primary_key) continue;
        const n = (c.entity_field_catalog?.name ?? "").trim().toLowerCase();
        if (!n || pkByName.has(n)) continue;
        pkByName.set(n, { nodeId, col: c });
      }
    }
    for (const [childNodeId, cols] of dataDiagramCtxValue.columnsByNode) {
      for (const c of cols) {
        if (c.is_primary_key || seenChildCol.has(c.id)) continue;
        const n = (c.entity_field_catalog?.name ?? "").trim().toLowerCase();
        if (!n) continue;
        const pk = pkByName.get(n);
        if (!pk || pk.nodeId === childNodeId) continue;
        out.push({
          id: `fk-auto-${c.id}`,
          source: pk.nodeId,
          sourceHandle: `col-${pk.col.id}-s`,
          target: childNodeId,
          targetHandle: `col-${c.id}-t`,
          type: "fk",
          animated: true,
          selectable: true,
          data: { childColId: c.id, auto: true },
        });
      }
    }
    return out;
  }, [diagramType, dataDiagramCtxValue]);

  const combinedEdges = useMemo<Edge[]>(
    () => {
      if (!fkEdges.length) return edges;
      const presentIds = new Set(nodes.map((n) => n.id));
      const visibleFk = fkEdges.filter(
        (e) => presentIds.has(e.source) && presentIds.has(e.target),
      );
      const seen = new Set(edges.map((e) => e.id));
      // edgeRefreshTick is read here so callers (table add/remove, move, pane
      // click) force a fresh derivation of the relationship lines.
      void edgeRefreshTick;
      return [...edges, ...visibleFk.filter((e) => !seen.has(e.id))];
    },
    [edges, fkEdges, nodes, edgeRefreshTick],
  );

  // Auto-size data-entity node heights to fit their column content. Keeps any
  // user-defined width and never shrinks below a sensible minimum.
  useEffect(() => {
    if (diagramType !== "datos") return;
    // Match DataEntityNode geometry: header 28 + p-1 (8 total) + rows*20 + borders.
    const HEADER = 28;
    const BODY_PAD = 8;
    const ROW_H = 20;
    const BORDER = 4;
    const EMPTY_H = 80;
    // Width sizing — approximate text width with monospace-ish averages.
    const CHAR_PX = 6.6;        // text-[11px] body
    const HEADER_CHAR_PX = 7.2; // uppercase header text-xs
    const TAG_PX = 26;          // PK / FK badge incl. gap
    const ROW_PAD_PX = 18;      // p-1 + gap between name and type
    const NAME_TYPE_GAP = 12;
    const HEADER_PAD_PX = 32;   // px-2 + color picker space
    const MIN_W = 220;
    const MAX_W = 520;
    setNodes((nds) => {
      let changed = false;
      const next = nds.map((n) => {
        if (n.type !== "dataEntity") return n;
        const cols = dataDiagramCtxValue.columnsByNode.get(n.id) ?? [];
        const label = dataDiagramCtxValue.tableLabelById.get(n.id) ?? String((n.data as { label?: string })?.label ?? "Tabla");
        const targetH = cols.length
          ? HEADER + BODY_PAD + cols.length * ROW_H + BORDER
          : EMPTY_H;
        const headerW = Math.ceil(label.length * HEADER_CHAR_PX) + HEADER_PAD_PX;
        const rowsW = cols.reduce((max, c) => {
          const name = c.entity_field_catalog?.name ?? "?";
          const dtype = c.entity_field_catalog?.data_type ?? "";
          const tags = (c.is_primary_key ? TAG_PX : 0) + (c.fk_target_node_id ? TAG_PX : 0);
          const w = tags + Math.ceil(name.length * CHAR_PX) + NAME_TYPE_GAP + Math.ceil(dtype.length * CHAR_PX) + ROW_PAD_PX;
          return w > max ? w : max;
        }, 0);
        const targetW = Math.min(MAX_W, Math.max(MIN_W, headerW, rowsW));
        const curH = (n.style?.height as number | undefined) ?? 0;
        const curW = (n.style?.width as number | undefined) ?? 0;
        if (curH === targetH && curW === targetW) return n;
        changed = true;
        return { ...n, style: { ...(n.style ?? {}), height: targetH, width: targetW } };
      });
      return changed ? next : nds;
    });
  }, [diagramType, dataDiagramCtxValue, nodes.length, setNodes]);

  // Refresh handle internals + edges shortly after the columns/labels update so
  // edges stay anchored to the new row positions.
  useEffect(() => {
    if (diagramType !== "datos") return;
    bumpEdges();
  }, [diagramType, dataDiagramCtxValue, bumpEdges]);


  const handleEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      // Synthetic FK edges live outside `edges` state — drop any change that targets them.
      const filtered = changes.filter((ch) => {
        const cid = (ch as { id?: string }).id;
        return !cid || !cid.startsWith("fk-");
      });
      if (filtered.length) onEdgesChange(filtered);
    },
    [onEdgesChange],
  );

  // Wrap node-changes so the data-model refreshes FK relations whenever a table
  // is added/removed (toggleTable triggers a "remove"/we bump on add directly),
  // moved (position), or resized (dimensions). For other diagram types this is
  // a passthrough.
  const handleNodesChange = useCallback(
    (changes: Parameters<typeof onNodesChange>[0]) => {
      onNodesChange(changes);
      if (diagramType !== "datos") return;
      const shouldBump = changes.some(
        (c) =>
          c.type === "position" ||
          c.type === "dimensions" ||
          c.type === "remove" ||
          c.type === "add",
      );
      if (shouldBump) bumpEdges();
    },
    [onNodesChange, diagramType, bumpEdges],
  );


  const wrapperRef = useRef<HTMLDivElement>(null);
  const rfInstanceRef = useRef<{ screenToFlowPosition: (p: { x: number; y: number }) => { x: number; y: number } } | null>(null);
  const idRef = useRef(1);
  const nextId = () => `n${idRef.current++}`;

  const attachedKey = useMemo(
    () => (search.level && search.id ? `${search.level}:${search.id}` : null),
    [search.level, search.id],
  );

  // ---------- View-only mode for engine definitions ----------
  // viewMode only when arriving with a definition/instance from the engine.
  // Standalone (no params) opens the full modeling editor.
  const attachedKeyPreview = (search.level && search.id) ? `${search.level}:${search.id}` : null;
  const viewMode = !!search.definitionId || !!search.instanceId;
  const noSelection = !search.definitionId && !search.instanceId;

  const navigate = useNavigate();

  const getInstanceFn = useServerFn(getInstanceDetail);

  // Load definition (when no instance selected, we still need nodes/edges)
  const defQuery = useQuery({
    queryKey: ["engine-definition-view", search.definitionId],
    enabled: !!search.definitionId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("process_definitions")
        .select("id,name,version,nodes,edges")
        .eq("id", search.definitionId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // List instances for the selector
  const instancesList = useQuery({
    queryKey: ["engine-definition-instances", search.definitionId],
    enabled: !!search.definitionId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("process_instances")
        .select("id,status,started_at,ended_at")
        .eq("definition_id", search.definitionId!)
        .order("started_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Global list of all instances across all definitions (for the page-level selector)
  const allInstancesList = useQuery({
    queryKey: ["engine-all-instances"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("process_instances")
        .select("id,status,started_at,definition_id,process_definitions(name,version)")
        .order("started_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        status: string;
        started_at: string;
        definition_id: string;
        process_definitions: { name: string; version: number } | null;
      }>;
    },
  });

  // Auto-select most recent instance if none specified
  useEffect(() => {
    if (!search.definitionId) return;
    if (search.instanceId) return;
    const first = instancesList.data?.[0];
    if (first) {
      navigate({ to: "/modeler", search: (prev: SearchT) => ({ ...prev, instanceId: first.id }), replace: true });
    }
  }, [search.definitionId, search.instanceId, instancesList.data, navigate]);

  // Instance detail (tokens + events) — drives node colouring
  const instanceQuery = useQuery({
    queryKey: ["engine-instance-view", search.instanceId],
    enabled: viewMode && !!search.instanceId,
    queryFn: () => getInstanceFn({ data: { instanceId: search.instanceId! } }),
    refetchInterval: 3000,
  });

  // Compute runState map from instance tokens + events
  const runStateMap = useMemo(() => {
    const map = new Map<string, "current" | "completed" | "pending">();
    const det = instanceQuery.data as { tokens?: Array<{ node_id: string; status: string }>; events?: Array<{ node_id: string | null; event_type: string }> } | undefined;
    if (!det) return map;
    const currentStatuses = new Set(["active", "waiting_human", "waiting_timer", "waiting_service"]);
    for (const t of det.tokens ?? []) {
      if (currentStatuses.has(t.status)) map.set(t.node_id, "current");
    }
    for (const t of det.tokens ?? []) {
      if (t.status === "completed" && !map.has(t.node_id)) map.set(t.node_id, "completed");
    }
    for (const e of det.events ?? []) {
      if (e.event_type === "token_exited" && e.node_id && !map.has(e.node_id)) {
        map.set(e.node_id, "completed");
      }
    }
    return map;
  }, [instanceQuery.data]);

  // Load definition's nodes/edges (run only when defQuery resolves; runState applied separately below)
  useEffect(() => {
    if (!viewMode || !defQuery.data) return;
    const loadedNodes = ((defQuery.data.nodes as unknown as Node[]) ?? []).map((n) => {
      if (n.type === "pool") {
        const k = (n.data as { kind?: string } | undefined)?.kind;
        return { ...n, draggable: false, selectable: false, zIndex: k === "pool" ? -2 : -1 };
      }
      return { ...n, draggable: false };
    });
    const loadedEdges = ((defQuery.data.edges as unknown as Edge[]) ?? []);
    setNodes(loadedNodes);
    setEdges(loadedEdges);
    setName(defQuery.data.name ?? "");
    setLoadedName(defQuery.data.name ?? "");
  }, [viewMode, defQuery.data, setNodes, setEdges]);

  // Apply runState to bpmn nodes; everything not in map becomes "pending"
  useEffect(() => {
    if (!viewMode || !search.instanceId) return;
    setNodes((nds) => nds.map((n) => {
      if (n.type !== "bpmn") return n;
      const st = runStateMap.get(n.id) ?? "pending";
      const prev = (n.data as { runState?: string }).runState;
      if (prev === st) return n;
      return { ...n, data: { ...n.data, runState: st } };
    }));
  }, [viewMode, search.instanceId, runStateMap, setNodes]);


  // Load existing diagram by hierarchy reference
  const existing = useQuery({
    queryKey: ["diagram", search.level, search.id],
    enabled: !!attachedKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("process_diagrams")
        .select("id,name,nodes,edges,diagram_type,parent_table,parent_id,entity_id,client_id,environment,version")
        .eq("level", search.level!)
        .eq("node_id", search.id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    const diagram = existing.data;
    if (!diagram) return;
    // El entorno y el tenant solo los cambia el usuario explícitamente.
    // No los sincronizamos automáticamente desde el diagrama cargado.
    if (!diagram.entity_id) {
      if (selectedEntity) setEntity(null);
      return;
    }
    const diagramEntityId = diagram.entity_id;
    if (selectedEntity?.id === diagramEntityId) return;
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("entities")
        .select("id,name")
        .eq("id", diagramEntityId)
        .maybeSingle();
      if (!cancelled && data) setEntity({ id: data.id, name: data.name });
    })();
    return () => {
      cancelled = true;
    };
  }, [existing.data, selectedEntity, setEntity]);

  // List of available process diagrams to link from a subprocess node.
  const subprocessDiagrams = useQuery({
    queryKey: ["process-diagrams-pick"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("process_diagrams")
        .select("id,name,updated_at")
        .eq("diagram_type", "subprocesos")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; name: string; updated_at: string }>;
    },
  });

  // The variables catalog is shared across every process and subprocess that
  // lives under the same (client, environment, entity). Use the diagram's
  // own entity_id when present, otherwise the user's current selection.
  const varsScope: VarsScope | null =
    diagramType === "procesos" && (existing.data?.client_id ?? currentClientId)
      ? {
          clientId: existing.data?.client_id ?? currentClientId!,
          environment: (existing.data?.environment as typeof environment) ?? environment,
          entityId: existing.data?.entity_id ?? selectedEntity?.id ?? null,
        }
      : null;






  const diagramsList = useQuery({
    queryKey: [
      "diagrams-list",
      existing.data?.client_id ?? currentClientId ?? null,
      existing.data?.environment ?? environment,
      existing.data?.entity_id ?? selectedEntity?.id ?? null,
    ],
    queryFn: async () => {
      const scopeClientId = existing.data?.client_id ?? currentClientId;
      const scopeEnvironment = existing.data?.environment ?? environment;
      const scopeEntityId = existing.data?.entity_id ?? selectedEntity?.id ?? null;
      let q = supabase
        .from("process_diagrams")
        .select("id,level,node_id,name,diagram_type,updated_at,entity_id,version")
        .eq("client_id", scopeClientId!)
        .eq("environment", scopeEnvironment)
        .order("updated_at", { ascending: false })
        .limit(50);
      if (scopeEntityId) q = q.or(`entity_id.eq.${scopeEntityId},entity_id.is.null`);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!(existing.data?.client_id ?? currentClientId),
  });


  // Parent dropdown options
  const macroprocessOptions = useQuery({
    queryKey: ["macroprocesses-pick", selectedEntity?.id ?? null],
    enabled: PARENT_REQUIRED[diagramType] === "macroprocesses",
    queryFn: async () => {
      let q = supabase.from("macroprocesses").select("id,code,name").order("code");
      if (selectedEntity) q = q.eq("entity_id", selectedEntity.id);
      const { data } = await q;
      return data ?? [];
    },
  });
  const processOptions = useQuery({
    queryKey: ["processes-pick", selectedEntity?.id ?? null],
    enabled: PARENT_REQUIRED[diagramType] === "processes",
    queryFn: async () => {
      if (selectedEntity) {
        const { data } = await supabase
          .from("processes")
          .select("id,code,name, entity_process_links!inner(entity_id)")
          .eq("entity_process_links.entity_id", selectedEntity.id)
          .order("code");
        return (data ?? []).map(({ id, code, name }) => ({ id, code, name }));
      }
      const { data } = await supabase.from("processes").select("id,code,name").order("code");
      return data ?? [];
    },
  });

  // Taxonomy of node types/subtypes (managed by admin)
  const taxonomyQuery = useQuery({
    queryKey: ["node-taxonomy-public"],
    queryFn: async () => {
      const [kinds, types, subtypes] = await Promise.all([
        supabase.from("node_kinds").select("id,code"),
        supabase.from("node_types").select("id,kind_id,name").order("name"),
        supabase.from("node_subtypes").select("id,type_id,name").order("name"),
      ]);
      return {
        kinds: kinds.data ?? [],
        types: types.data ?? [],
        subtypes: subtypes.data ?? [],
      };
    },
  });

  useEffect(() => {
    if (viewMode) return;

    if (existing.data) {
      setName(existing.data.name);
      setLoadedName(existing.data.name);
      setDiagramId(existing.data.id);
      const loadedNodes = ((existing.data.nodes as unknown as Node[]) ?? []).map((n) => {
        if (n.type === "pool") {
          const kind = (n.data as { kind?: string } | undefined)?.kind;
          return { ...n, zIndex: kind === "pool" ? -2 : -1 };
        }
        if (n.type === "generic" && (n.data as { container?: string } | undefined)?.container) {
          return { ...n, zIndex: -2 };
        }
        return n;
      });
      const dt = (existing.data as { diagram_type?: DiagramType }).diagram_type;
      const loadedIsMacro = dt === "macroprocesos";
      const loadedEdges = ((existing.data.edges as unknown as Edge[]) ?? []).map((e) =>
        loadedIsMacro
          ? {
              ...e,
              style: { ...(e.style ?? {}), strokeWidth: 5, stroke: "#334155" },
              markerEnd: { type: MarkerType.Arrow, width: 14, height: 14, color: "#334155" },
            }
          : e,
      );
      setNodes(loadedNodes);
      setEdges(loadedEdges);
      if (dt) {
        if ((dt as string) === "subprocesos") {
          setDiagramType("procesos" as DiagramType);
          setDiagramClass("subproceso");
        } else {
          setDiagramType(dt);
          if (dt === "procesos") setDiagramClass("proceso");
        }
      }
      const pt = (existing.data as { parent_table?: string; parent_id?: string }).parent_table;
      const pid = (existing.data as { parent_table?: string; parent_id?: string }).parent_id;
      if (pt && pid) setParentRef({ table: pt, id: pid });
      const maxId = loadedNodes
        .map((n) => parseInt(n.id.replace(/^n/, ""), 10))
        .filter((n) => Number.isFinite(n))
        .reduce((a, b) => Math.max(a, b), 0);
      idRef.current = maxId + 1;
    }
  }, [existing.data, setNodes, setEdges]);

  // Listen to in-node edits
  useEffect(() => {
    const handler = async (e: Event) => {
      const { id, patch } = (e as CustomEvent<{ id: string; patch: Record<string, unknown> }>).detail;
      if ("expanded" in patch) {
        let nextStyle: { width?: number; height?: number } | null = null;
        const target = nodes.find((n) => n.id === id);
        const subId =
          (patch.subprocessDiagramId as string | undefined) ??
          (target?.data as { subprocessDiagramId?: string } | undefined)?.subprocessDiagramId;
        if (patch.expanded && subId) {
          try {
            const data = await qc.fetchQuery({
              queryKey: ["subprocess-preview", subId],
              queryFn: async () => {
                const { data, error } = await supabase
                  .from("process_diagrams")
                  .select("name,nodes,edges")
                  .eq("id", subId)
                  .maybeSingle();
                if (error) throw error;
                return data;
              },
            });
            const inner = ((data?.nodes ?? []) as unknown as Node[]);
            if (inner.length) {
              const byId = new Map(inner.map((n) => [n.id, n] as const));
              const absPos = (n: Node): { x: number; y: number } => {
                let x = n.position.x, y = n.position.y;
                let cur: Node | undefined = byId.get(n.parentId ?? "");
                while (cur) {
                  x += cur.position.x;
                  y += cur.position.y;
                  cur = byId.get(cur.parentId ?? "");
                }
                return { x, y };
              };
              let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
              for (const n of inner) {
                const w = Number((n.style as { width?: number } | undefined)?.width ?? n.width ?? 150);
                const h = Number((n.style as { height?: number } | undefined)?.height ?? n.height ?? 60);
                const { x, y } = absPos(n);
                minX = Math.min(minX, x);
                minY = Math.min(minY, y);
                maxX = Math.max(maxX, x + w);
                maxY = Math.max(maxY, y + h);
              }
              const innerW = Math.max(1, maxX - minX);
              const innerH = Math.max(1, maxY - minY);
              // Preserve aspect ratio of the inner diagram so fitView shows it
              // at full scale (no empty bands, no clipping).
              const padX = 24, padY = 24, headerH = 56;
              const minBodyW = 320;
              const bodyW = Math.max(minBodyW, Math.ceil(innerW + padX * 2));
              const bodyH = Math.max(160, Math.ceil((bodyW - padX * 2) * (innerH / innerW) + padY * 2));
              nextStyle = { width: bodyW, height: bodyH + headerH };
            } else {
              nextStyle = { width: 320, height: 220 };
            }
          } catch {
            nextStyle = { width: 280, height: 180 };
          }
        } else {
          nextStyle = { width: 220, height: 80 };
        }
        setNodes((nds) => nds.map((n) => (n.id === id
          ? { ...n, data: { ...n.data, ...patch }, style: { ...(n.style ?? {}), ...nextStyle } }
          : n)));
        return;
      }
      setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)));
    };
    window.addEventListener("modeler-node-update", handler);
    return () => window.removeEventListener("modeler-node-update", handler);
  }, [setNodes, nodes, qc]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ level: string; nodeId: string }>).detail;
      if (!detail?.level || !detail?.nodeId) return;
      navigate({
        to: "/modeler",
        search: (prev: SearchT) => ({ ...prev, level: detail.level as LevelKey, id: detail.nodeId, type: "procesos" as DiagramType }),
      });
    };
    window.addEventListener("modeler-open-linked-process", handler);
    return () => window.removeEventListener("modeler-open-linked-process", handler);
  }, [navigate]);


  const isMacro = diagramType === "macroprocesos";
  const upsertColumnFn = useServerFn(upsertColumn);
  const onConnect = useCallback(
    (c: Connection) => {
      // ER: column→column connection persists an FK on the child (target) column.
      if (
        diagramType === "datos" &&
        c.source && c.target && c.sourceHandle?.startsWith("col-") && c.targetHandle?.startsWith("col-") &&
        diagramId && currentClientId
      ) {
        const parseColId = (h: string) => h.replace(/^col-/, "").replace(/-[ts]$/, "");
        const srcColId = parseColId(c.sourceHandle);
        const tgtColId = parseColId(c.targetHandle);
        if (c.source === c.target) {
          toast.error("Una FK no puede apuntar a la misma tabla origen");
          return;
        }
        // Find child column field_id from cached data.
        const cached = (qc.getQueryData(["entity-table-columns", diagramId]) ?? []) as (DbColumn & { node_id: string })[];
        const tgt = cached.find((r) => r.id === tgtColId);
        if (!tgt) { toast.error("Columna destino no encontrada"); return; }
        // Optimistically render the FK line immediately so the user sees feedback.
        const optimisticId = `fk-${tgtColId}`;
        setEdges((es) => {
          if (es.some((e) => e.id === optimisticId)) return es;
          return [...es, {
            id: optimisticId,
            source: c.source!,
            sourceHandle: `col-${srcColId}-s`,
            target: c.target!,
            targetHandle: `col-${tgtColId}-t`,
            type: "fk",
            animated: true,
            selectable: true,
            data: { childColId: tgtColId, optimistic: true },
          }];
        });
        upsertColumnFn({ data: {
          id: tgtColId,
          clientId: currentClientId,
          environment,
          diagramId,
          nodeId: c.target,
          fieldId: tgt.field_id,
          fkTargetNodeId: c.source,
          fkTargetColumnId: srcColId,
        } })
          .then(() => {
            toast.success("Relación FK creada");
            qc.invalidateQueries({ queryKey: ["entity-table-columns", diagramId] });
          })
          .catch((err: Error) => {
            // Roll back the optimistic edge on failure.
            setEdges((es) => es.filter((e) => e.id !== optimisticId));
            toast.error(err.message);
          });
        return;
      }
      setEdges((es) => {
        const sourceNode = nodes.find((n) => n.id === c.source);
        const sourceKind = (sourceNode?.data as { kind?: string } | undefined)?.kind;
        let data: Record<string, unknown> = diagramType === "datos" ? { cardinality: "1-n" } : {};
        if (sourceKind === "gateway" && diagramType !== "datos" && !isMacro) {
          let branch: "true" | "false" | undefined;
          if (c.sourceHandle === "r-s") branch = "true";
          else if (c.sourceHandle === "l-s") branch = "false";
          else {
            const existing = es.filter((e) => e.source === c.source);
            const used = new Set(existing.map((e) => (e.data as { branch?: string } | undefined)?.branch));
            branch = used.has("true") ? "false" : "true";
          }
          const existing = es.filter((e) => e.source === c.source);
          const used = new Set(existing.map((e) => (e.data as { branch?: string } | undefined)?.branch));
          if (used.has(branch)) branch = branch === "true" ? "false" : "true";
          data = { ...data, branch };
        }
        return addEdge({
          ...c,
          type: "labeled",
          markerEnd: isMacro
            ? { type: MarkerType.Arrow, width: 14, height: 14, color: "#334155" }
            : { type: MarkerType.ArrowClosed, color: "#0ea5e9" },
          style: isMacro ? { strokeWidth: 5, stroke: "#334155" } : { strokeWidth: 2, stroke: "#0ea5e9" },
          animated: diagramType !== "datos",
          data,
        }, es);
      });
    },
    [setEdges, diagramType, isMacro, nodes, diagramId, currentClientId, environment, qc, upsertColumnFn],
  );



  const onDragStart = (e: React.DragEvent<HTMLDivElement>, payload: string) => {
    e.dataTransfer.setData("application/bpm-item", payload);
    e.dataTransfer.effectAllowed = "move";
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    // Clone the dragged item so the browser's ghost image is just this single chip,
    // not a screenshot that may visually overlap neighboring palette items.
    const ghost = el.cloneNode(true) as HTMLDivElement;
    ghost.style.position = "absolute";
    ghost.style.top = "-1000px";
    ghost.style.left = "-1000px";
    ghost.style.width = `${rect.width}px`;
    ghost.style.height = `${rect.height}px`;
    ghost.style.pointerEvents = "none";
    ghost.style.opacity = "0.9";
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, e.clientX - rect.left, e.clientY - rect.top);
    setTimeout(() => document.body.removeChild(ghost), 0);
  };


  // Compute absolute (canvas) position of a node, walking up parent chain.
  const absolutePos = useCallback((node: Node, all: Node[]) => {
    let x = node.position.x, y = node.position.y;
    let cur: Node | undefined = node;
    while (cur?.parentId) {
      const p = all.find((n) => n.id === cur!.parentId);
      if (!p) break;
      x += p.position.x;
      y += p.position.y;
      cur = p;
    }
    return { x, y };
  }, []);

  const nodeSize = useCallback((n: Node): { w: number; h: number } => {
    const m = (n as unknown as { measured?: { width?: number; height?: number } }).measured;
    const initial = n as Node & { initialWidth?: number; initialHeight?: number };
    const toNumber = (value: unknown) => {
      if (typeof value === "number") return value;
      if (typeof value === "string") {
        const parsed = Number.parseFloat(value);
        return Number.isFinite(parsed) ? parsed : 0;
      }
      return 0;
    };
    return {
      w: toNumber(m?.width ?? n.width ?? initial.initialWidth ?? n.style?.width),
      h: toNumber(m?.height ?? n.height ?? initial.initialHeight ?? n.style?.height),
    };
  }, []);

  // Find the topmost (latest) node matching `match` whose bounds contain `pt`.
  const findContainerAt = useCallback(
    (pt: { x: number; y: number }, all: Node[], match: (n: Node) => boolean) => {
      for (let i = all.length - 1; i >= 0; i--) {
        const n = all[i];
        if (!match(n)) continue;
        const ap = absolutePos(n, all);
        const { w, h } = nodeSize(n);
        if (!w || !h) continue;
        if (pt.x >= ap.x && pt.x <= ap.x + w && pt.y >= ap.y && pt.y <= ap.y + h) return n;
      }
      return null;
    },
    [absolutePos, nodeSize],
  );

  const findContainerAtScreenPoint = useCallback(
    (pt: { x: number; y: number }, all: Node[], match: (n: Node) => boolean) => {
      const root = wrapperRef.current;
      if (!root) return null;
      for (let i = all.length - 1; i >= 0; i--) {
        const n = all[i];
        if (!match(n)) continue;
        const el = Array.from(root.querySelectorAll<HTMLElement>(".react-flow__node")).find((nodeEl) => nodeEl.dataset.id === n.id);
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (pt.x >= rect.left && pt.x <= rect.right && pt.y >= rect.top && pt.y <= rect.bottom) return n;
      }
      return null;
    },
    [],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const payload = e.dataTransfer.getData("application/bpm-item");
      if (!payload || !wrapperRef.current) return;
      const bounds = wrapperRef.current.getBoundingClientRect();
      const screenPoint = { x: e.clientX, y: e.clientY };
      const position = rfInstanceRef.current
        ? rfInstanceRef.current.screenToFlowPosition(screenPoint)
        : { x: e.clientX - bounds.left, y: e.clientY - bounds.top };




      if (diagramType === "procesos") {
        if (payload === "phase") {
          const newNode: Node = {
            id: nextId(),
            type: "phase",
            position,
            style: { width: 360, height: 220, pointerEvents: "none", zIndex: 1000 },
            dragHandle: ".phase-drag-handle",
            data: { kind: "phase", label: "Fase", description: "", color: "#8b5cf6" },
            zIndex: 1000,
            selectable: true,
          };
          setNodes((nds) => nds.concat(newNode));
          return;
        }
        const kind = payload as BpmnKind;
        const meta = KIND_META[kind];

        // Pool (Entidad): contenedor raíz, libre en el lienzo.
        if (kind === "pool") {
          const newNode: Node = {
            id: nextId(),
            type: "pool",
            position,
            dragHandle: ".pool-drag-handle",
            style: { width: 480, height: 260 },
            data: { kind, label: "", paletteLabel: meta.label, role: "", entity_id: null, description: "", version: "1.0", nodeType: "" },
            zIndex: -2,
          };
          setNodes((nds) => nds.concat(newNode));
          return;
        }

        // Lane (Calle): debe ir dentro de un Pool (Entidad).
        if (kind === "lane") {
          const poolMatch = (n: Node) => n.type === "pool" && (n.data as { kind?: string })?.kind === "pool";
          const pool = findContainerAtScreenPoint(screenPoint, nodes, poolMatch) ?? findContainerAt(position, nodes, poolMatch);
          if (!pool) {
            toast.error("La Calle debe colocarse dentro de una Entidad");
            return;
          }
          const ap = absolutePos(pool, nodes);
          const newNode: Node = {
            id: nextId(),
            type: "pool",
            parentId: pool.id,
            extent: "parent",
            dragHandle: ".pool-drag-handle",
            position: { x: position.x - ap.x, y: position.y - ap.y },
            style: { width: 380, height: 140 },
            data: { kind, label: "", role: "", position_id: null, description: "", version: "1.0", nodeType: "" },
            zIndex: -1,
          };
          setNodes((nds) => nds.concat(newNode));
          return;
        }

        // Resto de nodos BPMN: deben ir dentro de una Calle.
        const containerMatch = (n: Node) => n.type === "pool" && (n.data as { kind?: string })?.kind === "lane";
        const lane = findContainerAtScreenPoint(screenPoint, nodes, containerMatch) ?? findContainerAt(position, nodes, containerMatch);
        if (!lane) {
          toast.error("Los nodos deben colocarse dentro de una Calle");
          return;
        }

        const baseLabel = meta.i18n ? t(meta.i18n) : meta.label ?? kind;
        const label = meta.eventPrefix ? `Evento ${baseLabel}` : baseLabel;
        const isEvent = kind === "start" || kind === "end" || kind === "intermediate";
        const isGw = kind === "gateway";
        const w = isGw ? 110 : isEvent ? 96 : 150;
        const h = isGw ? 110 : isEvent ? 96 : 56;

        let nodePos = position;
        let parentId: string | undefined;
        if (lane) {
          const apL = absolutePos(lane, nodes);
          const { w: lw, h: lh } = nodeSize(lane);
          const HEADER = 22;
          const localX = Math.max(2, Math.min(position.x - apL.x, Math.max(2, lw - w - 2)));
          const localY = Math.max(HEADER + 2, Math.min(position.y - apL.y, Math.max(HEADER + 2, lh - h - 2)));
          nodePos = { x: localX, y: localY };
          parentId = lane.id;
        }
        const newNode: Node = {
          id: nextId(),
          type: "bpmn",
          ...(parentId ? { parentId, extent: "parent" as const } : {}),
          position: nodePos,
          style: { width: w, height: h },
          data: { kind, label, description: "", version: "1.0", nodeType: "" },
        };

        setNodes((nds) => nds.concat(newNode));
        return;
      }

      if (diagramType === "datos") {
        // En el modelo de datos no se crean tablas arrastrando: usa el selector de tablas
        // o el diálogo Campos_Tablas para crearlas.
        return;
      }


      const palette = GENERIC_PALETTES[diagramType];
      const item = palette.find((p) => p.kind === payload);
      if (!item) return;
      const isBand = item.container === "band";
      const isSide = item.container === "side";
      const width = isBand ? 900 : isSide ? 220 : 180;
      const height = isBand ? 130 : isSide ? 500 : 90;
      const newNode: Node = {
        id: nextId(),
        type: "generic",
        position,
        style: { width, height },
        data: { kind: item.kind, label: item.initialLabel ?? item.label, paletteLabel: item.label, color: item.color, container: item.container, description: "", version: "1.0", nodeType: "" },
        ...(item.container ? { zIndex: -2, selectable: true, draggable: true } : {}),
      };
      setNodes((nds) => nds.concat(newNode));
    },
    [setNodes, t, diagramType, nodes, findContainerAt, findContainerAtScreenPoint, absolutePos, nodeSize],
  );

  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; };

  // When a BPMN node is dropped (drag stop), re-parent it to the Calle (lane) it sits on.
  const onNodeDragStop = useCallback(
    (_e: MouseEvent | TouchEvent, dragged: Node) => {
      if (dragged.type !== "bpmn") return;
      setNodes((nds) => {
        const cur = nds.find((n) => n.id === dragged.id);
        if (!cur) return nds;
        const ap = (() => {
          let x = cur.position.x, y = cur.position.y;
          let c: Node | undefined = cur;
          while (c?.parentId) {
            const p = nds.find((n) => n.id === c!.parentId);
            if (!p) break;
            x += p.position.x; y += p.position.y; c = p;
          }
          return { x, y };
        })();
        const { w, h } = nodeSize(cur);
        const center = { x: ap.x + w / 2, y: ap.y + h / 2 };
        // Find topmost lane containing the center
        let lane: Node | null = null;
        for (let i = nds.length - 1; i >= 0; i--) {
          const n = nds[i];
          const wantKind = "lane";
          if (n.type !== "pool" || (n.data as { kind?: string })?.kind !== wantKind) continue;
          if (n.id === cur.id) continue;
          let lx = n.position.x, ly = n.position.y;
          let p: Node | undefined = n;
          while (p?.parentId) {
            const pp = nds.find((x) => x.id === p!.parentId);
            if (!pp) break;
            lx += pp.position.x; ly += pp.position.y; p = pp;
          }
          const { w: lw, h: lh } = nodeSize(n);
          if (!lw || !lh) continue;
          if (center.x >= lx && center.x <= lx + lw && center.y >= ly && center.y <= ly + lh) {
            lane = n;
            break;
          }
        }
        if (!lane) return nds;
        // Lane origin (absolute)
        let lax = lane.position.x, lay = lane.position.y;
        let lp: Node | undefined = lane;
        while (lp?.parentId) {
          const pp = nds.find((x) => x.id === lp!.parentId);
          if (!pp) break;
          lax += pp.position.x; lay += pp.position.y; lp = pp;
        }
        const newPos = { x: ap.x - lax, y: ap.y - lay };
        if (cur.parentId === lane.id) {
          // Same lane — snap to lane-local coords (already correct, but ensure no drift)
          return nds.map((n) => n.id === cur.id ? { ...n, position: newPos } : n);
        }
        // Re-parent: React Flow requires parent node before children in the array.
        const others = nds.filter((n) => n.id !== cur.id);
        const updated: Node = { ...cur, parentId: lane.id, position: newPos };
        const parentIdx = others.findIndex((n) => n.id === lane!.id);
        const result = [...others];
        result.splice(parentIdx + 1, 0, updated);
        return result;
      });
    },
    [setNodes, nodeSize, diagramType],
  );



  const save = async (opts?: { skipConfirm?: boolean }): Promise<boolean> => {
    if (!canEdit) { toast.error("Sin permisos para guardar"); return false; }
    if (diagramType !== "datos" && !name.trim()) { toast.error("Introduce un nombre para el diagrama"); return false; }
    if (PARENT_REQUIRED[diagramType] && !parentRef && !attachedKey) {
      const need = PARENT_REQUIRED[diagramType] === "macroprocesses" ? "proceso" : "proceso";
      toast.error(`Selecciona el ${need} al que se asocia este diagrama`);
      return false;
    }

    // En macroprocesos, todo nodo "Proceso" debe estar vinculado a un diagrama de proceso.
    if (diagramType === "macroprocesos") {
      const unlinked = nodes.find((n) => {
        const d = n.data as { kind?: string; linkedProcessDiagramId?: string } | undefined;
        return d?.kind === "macro.macroproceso" && !d?.linkedProcessDiagramId;
      });
      if (unlinked) {
        const label = (unlinked.data as { label?: string } | undefined)?.label ?? unlinked.id;
        toast.error(`El proceso "${label}" debe estar vinculado a un diagrama de proceso (doble clic para vincular)`);
        return false;
      }
    }

    // Tipo y subtipo obligatorios para eventos y tareas ejecutables
    if (diagramType === "procesos") {
      const REQUIRED_KINDS = new Set(["start", "end", "intermediate", "task"]);
      const missing = nodes.find((n) => {
        const d = n.data as { kind?: string; typeId?: string | null; subtypeId?: string | null } | undefined;
        if (!d?.kind || !REQUIRED_KINDS.has(d.kind)) return false;
        return !d.typeId || !d.subtypeId;
      });
      if (missing) {
        const label = (missing.data as { label?: string } | undefined)?.label ?? missing.id;
        toast.error(`El nodo "${label}" requiere tipo y subtipo`);
        return false;
      }
    }

    // Un diagrama de tipo Subproceso no puede contener nodos de tipo subproceso.
    if (diagramType === "procesos" && diagramClass === "subproceso") {
      const sub = nodes.find((n) => {
        const d = n.data as { kind?: string } | undefined;
        return d?.kind === "subprocess";
      });
      if (sub) {
        const label = (sub.data as { label?: string } | undefined)?.label ?? sub.id;
        toast.error(`Un diagrama Subproceso no puede contener nodos subproceso ("${label}")`);
        return false;
      }
    }

    // Todo nodo subproceso debe tener un subproceso vinculado en sus propiedades.
    if (diagramType === "procesos") {
      const unlinkedSub = nodes.find((n) => {
        const d = n.data as { kind?: string; subprocessDiagramId?: string } | undefined;
        return d?.kind === "subprocess" && !d?.subprocessDiagramId;
      });
      if (unlinkedSub) {
        const label = (unlinkedSub.data as { label?: string } | undefined)?.label ?? unlinkedSub.id;
        toast.error(`El nodo subproceso "${label}" debe tener un subproceso vinculado (selecciónalo en Propiedades del nodo)`);
        return false;
      }
    }

    // Validar que todos los iconos estén conectados con líneas de flujo.
    // Los contenedores (pools/subprocesos que agrupan otros nodos) están exentos.
    // El diagrama de datos no requiere esta validación (las tablas pueden existir sin FKs).
    if (diagramType !== "datos") {
      const containerIds = new Set(
        nodes
          .filter((n) => {
            if (n.type === "pool") return true;
            if (n.type === "phase") return true;
            const d = n.data as { container?: string; kind?: string } | undefined;
            if (!!d?.container) return true;
            // En macroprocesos, los nodos "Proceso" no requieren conexión con líneas de flujo.
            if (diagramType === "macroprocesos" && d?.kind === "macro.macroproceso") return true;
            return false;
          })
          .map((n) => n.id),
      );
      const connected = new Set<string>();
      edges.forEach((e) => { connected.add(e.source); connected.add(e.target); });
      const orphan = nodes.find((n) => !containerIds.has(n.id) && !connected.has(n.id));
      if (nodes.length > 1 && orphan) {
        const label = (orphan.data as { label?: string } | undefined)?.label ?? orphan.id;
        toast.error(`El icono "${label}" no está conectado con líneas de flujo`);
        return false;
      }
    }

    // Validar flujos por tipo de evento BPMN en procesos/subprocesos.
    // La validación cuenta solo líneas conectadas a los puntos correctos.
    if (diagramType === "procesos") {
      const bpmnById = new Map(
        nodes
          .filter((n) => n.type === "bpmn")
          .map((n) => [n.id, n] as const),
      );
      const labelOf = (n: Node) => (n.data as { label?: string } | undefined)?.label ?? n.id;
      const sourceHandlesByKind: Record<string, string[]> = {
        start: ["l-s", "r-s", "b-s"],
        intermediate: ["t-s", "l-s", "r-s", "b-s"],
        end: ["b-s"],
        task: ["r-s", "b-s"],
        subprocess: ["r-s", "b-s"],
        gateway: ["l-s", "r-s"],
      };
      const targetHandlesByKind: Record<string, string[]> = {
        start: ["t-t"],
        intermediate: ["t-t", "l-t", "r-t", "b-t"],
        end: ["t-t", "l-t", "r-t"],
        task: ["t-t", "l-t"],
        subprocess: ["t-t", "l-t"],
        gateway: ["t-t"],
      };

      const incoming = new Map<string, number>();
      const outgoing = new Map<string, number>();
      const outgoingByHandle = new Map<string, Map<string, number>>();
      for (const e of edges) {
        const sourceNode = bpmnById.get(e.source);
        const targetNode = bpmnById.get(e.target);
        if (sourceNode) {
          const kind = (sourceNode.data as { kind?: string }).kind ?? "";
          const handle = e.sourceHandle ?? "";
          if (handle && !sourceHandlesByKind[kind]?.includes(handle)) {
            toast.error(`"${labelOf(sourceNode)}" tiene una salida conectada desde un punto incorrecto`);
            return false;
          }
        }
        if (targetNode) {
          const kind = (targetNode.data as { kind?: string }).kind ?? "";
          const handle = e.targetHandle ?? "";
          if (handle && !targetHandlesByKind[kind]?.includes(handle)) {
            toast.error(`"${labelOf(targetNode)}" tiene una entrada conectada a un punto incorrecto`);
            return false;
          }
        }
        outgoing.set(e.source, (outgoing.get(e.source) ?? 0) + 1);
        incoming.set(e.target, (incoming.get(e.target) ?? 0) + 1);
        if (e.sourceHandle) {
          const byHandle = outgoingByHandle.get(e.source) ?? new Map<string, number>();
          byHandle.set(e.sourceHandle, (byHandle.get(e.sourceHandle) ?? 0) + 1);
          outgoingByHandle.set(e.source, byHandle);
        }
      }
      for (const n of nodes) {
        if (n.type !== "bpmn") continue;
        const d = n.data as { kind?: string; label?: string };
        const label = d.label ?? n.id;
        const kind = d.kind;
        if (kind === "start") {
          if ((outgoing.get(n.id) ?? 0) < 1) { toast.error(`El evento de inicio "${label}" debe tener al menos un flujo de salida`); return false; }
        } else if (kind === "end") {
          if ((incoming.get(n.id) ?? 0) < 1) { toast.error(`El evento de fin "${label}" debe tener al menos un flujo de entrada`); return false; }
        } else if (kind === "task" || kind === "subprocess") {
          if ((incoming.get(n.id) ?? 0) < 1) { toast.error(`"${label}" debe tener al menos un flujo de entrada`); return false; }
          if ((outgoing.get(n.id) ?? 0) < 1) { toast.error(`"${label}" debe tener al menos un flujo de salida`); return false; }
        } else if (kind === "gateway") {
          const inCount = incoming.get(n.id) ?? 0;
          const outCount = outgoing.get(n.id) ?? 0;
          const leftOut = outgoingByHandle.get(n.id)?.get("l-s") ?? 0;
          const rightOut = outgoingByHandle.get(n.id)?.get("r-s") ?? 0;
          const rules = ((n.data as { rules?: GatewayRule[] }).rules ?? []) as GatewayRule[];
          const validRules = rules.map(migrateGatewayRule).filter((r) => {
            const hasLeft = !!r.left && (r.left.kind !== "literal" || String(r.left.value ?? "") !== "");
            const hasRight = r.op === "vacío" || (!!r.right && (r.right.kind !== "literal" || String(r.right.value ?? "") !== ""));
            const hasOp = (r.op ?? "").trim() !== "";
            return hasLeft && hasRight && hasOp;
          });
          if (rules.length === 0 || validRules.length === 0) { toast.error(`La decisión "${label}" debe tener al menos una regla asociada`); return false; }
          if (validRules.length > 2) { toast.error(`La decisión "${label}" debe tener como máximo dos reglas asociadas`); return false; }
          if (inCount !== 1) { toast.error(`"${label}" debe tener exactamente un flujo de entrada`); return false; }
          if (outCount !== 2) { toast.error(`"${label}" debe tener exactamente dos flujos de salida`); return false; }
          if (leftOut !== 1 || rightOut !== 1) { toast.error(`"${label}" debe tener un flujo de salida por el punto izquierdo y uno por el punto derecho`); return false; }
          const outEdges = edges.filter((e) => e.source === n.id);
          const fixes = new Map<string, "true" | "false">();
          for (const e of outEdges) {
            const current = (e.data as { branch?: string } | undefined)?.branch;
            if (current === "true" || current === "false") continue;
            const auto: "true" | "false" = e.sourceHandle === "l-s" ? "false" : "true";
            fixes.set(e.id, auto);
          }
          if (fixes.size > 0) {
            setEdges((eds) =>
              eds.map((e) =>
                fixes.has(e.id)
                  ? { ...e, data: { ...(e.data as object), branch: fixes.get(e.id) } }
                  : e,
              ),
            );
          }
        }
      }
    }

    if (!opts?.skipConfirm && !confirm(`¿Guardar el diagrama con el nombre "${name}"?`)) return false;

    // Validar duplicados por (name, version) en el mismo tenant/entorno.
    // La versión se autoincrementa por trigger cuando cambian name/nodes/edges.
    if (diagramType !== "datos") {
      const trimmedName = name.trim();
      if (!trimmedName) { toast.error("El nombre no puede estar vacío"); return false; }
      const scopeClient = currentClientId ?? existing.data?.client_id ?? null;
      const scopeEnv = (existing.data?.environment as string | undefined) ?? environment;
      if (scopeClient) {
        let predictedVersion = 1;
        if (diagramId) {
          const currentVersion = (existing.data as { version?: number } | undefined)?.version ?? 1;
          const nameChanged = trimmedName !== (loadedName ?? "");
          const nodesChanged = JSON.stringify(existing.data?.nodes ?? []) !== JSON.stringify(nodes);
          const edgesChanged = JSON.stringify(existing.data?.edges ?? []) !== JSON.stringify(edges);
          predictedVersion = (nameChanged || nodesChanged || edgesChanged) ? currentVersion + 1 : currentVersion;
        }
        let dupQuery = supabase
          .from("process_diagrams")
          .select("id,name,version")
          .eq("name", trimmedName)
          .eq("client_id", scopeClient)
          .eq("environment", scopeEnv)
          .eq("version", predictedVersion);
        if (diagramId) dupQuery = dupQuery.neq("id", diagramId);
        const { data: dupRows, error: dupErr } = await dupQuery;
        if (dupErr) { toast.error(dupErr.message); return false; }
        if (dupRows && dupRows.length > 0) {
          toast.error(`Ya existe un diagrama con el nombre "${trimmedName}" (v${predictedVersion})`);
          return false;
        }
      }
    }

    // Auto-label gateway outputs (right=true, left=false) on the payload too,
    // so saved data matches what the UI now shows.
    const gatewayIds = new Set(
      nodes
        .filter((n) => n.type === "bpmn" && (n.data as { kind?: string }).kind === "gateway")
        .map((n) => n.id),
    );
    const edgesForSave = edges.map((e) => {
      if (!gatewayIds.has(e.source)) return e;
      const current = (e.data as { branch?: string } | undefined)?.branch;
      if (current === "true" || current === "false") return e;
      const auto: "true" | "false" = e.sourceHandle === "l-s" ? "false" : "true";
      return { ...e, data: { ...(e.data as object), branch: auto } };
    });

    const basePayload = {
      name,
      nodes: JSON.parse(JSON.stringify(nodes)),
      edges: JSON.parse(JSON.stringify(edgesForSave)),
      diagram_type: (diagramType === "procesos" && diagramClass === "subproceso" ? "subprocesos" : diagramType) as DiagramType,
      parent_table: parentRef?.table ?? null,
      parent_id: parentRef?.id ?? null,
      entity_id: selectedEntity?.id ?? null,
    };

    if (diagramType === "datos") {
      // Diagrama único: siempre actualizamos "BD de Negocio"
      basePayload.name = "BD de Negocio";
    }

    const isDataRename = false;

    if (isDataRename) {
      // (deshabilitado) renombrado en BD de Negocio
    } else if (attachedKey) {
      const { data, error } = await supabase
        .from("process_diagrams")
        .upsert(
          withTenant({ ...basePayload, level: search.level!, node_id: search.id! }),
          { onConflict: "level,node_id" },
        )
        .select("id")
        .single();
      if (error) { toast.error(error.message); return false; }
      if (data) setDiagramId(data.id);
      setLoadedName(name.trim());
    } else if (diagramId) {
      const { error } = await supabase.from("process_diagrams").update(basePayload).eq("id", diagramId);
      if (error) { toast.error(error.message); return false; }
      setLoadedName(name.trim());
    } else {
      const { data, error } = await supabase
        .from("process_diagrams")
        .insert(withTenant({ ...basePayload, level: "processes", node_id: crypto.randomUUID() }))
        .select("id")
        .single();
      if (error) { toast.error(error.message); return false; }
      if (data) setDiagramId(data.id);
      setLoadedName(name.trim());
    }

    toast.success(t("modeler.saved"));
    qc.invalidateQueries({ queryKey: ["diagrams-list"] });
    qc.invalidateQueries({ queryKey: ["diagram"] });
    qc.invalidateQueries({ queryKey: ["dash"] });
    qc.invalidateQueries({ queryKey: ["children"] });
    return true;
  };

  // Duplica un diagrama. Si es de la familia proceso, "forcedClass" determina
  // si el duplicado se guarda como Proceso o Subproceso.
  const doDuplicate = async (sourceId: string, forcedClass?: "proceso" | "subproceso") => {
    // Limpiar UI antes de pedir el nuevo nombre
    setDiagramId(null);
    setNodes([]);
    setEdges([]);
    setName("");
    setLoadedName(null);
    const proposed = window.prompt("Nombre del nuevo diagrama:", "");
    const trimmed = (proposed ?? "").trim();
    if (!trimmed) return;
    const { data: orig, error: readErr } = await supabase
      .from("process_diagrams")
      .select("diagram_type,parent_table,parent_id,entity_id,level,client_id,environment,nodes,edges")
      .eq("id", sourceId)
      .single();
    if (readErr || !orig) return toast.error(readErr?.message ?? "No se pudo leer el diagrama");
    const duplicateClientId = orig.client_id ?? currentClientId;
    const duplicateEnvironment = orig.environment ?? environment;
    if (!duplicateClientId) return toast.error("No se pudo determinar el tenant del diagrama original");
    const { data: dup, error: dupErr } = await supabase
      .from("process_diagrams")
      .select("id")
      .eq("name", trimmed)
      .eq("client_id", duplicateClientId)
      .eq("environment", duplicateEnvironment)
      .maybeSingle();
    if (dupErr) return toast.error(dupErr.message);
    if (dup) return toast.error("Ya existe un diagrama con ese nombre");

    // Calcular tipo persistido según la clase elegida (si aplica).
    let persistedType = orig.diagram_type as string;
    const isProcessFamily = persistedType === "procesos" || persistedType === "subprocesos";
    if (isProcessFamily && forcedClass) {
      persistedType = forcedClass === "subproceso" ? "subprocesos" : "procesos";
    }

    const duplicateNodeId = crypto.randomUUID();
    const { data, error } = await supabase.from("process_diagrams").insert({
      name: trimmed,
      nodes: (orig.nodes ?? []) as never,
      edges: (orig.edges ?? []) as never,
      diagram_type: persistedType,
      parent_table: orig.parent_table,
      parent_id: orig.parent_id,
      entity_id: orig.entity_id ?? selectedEntity?.id ?? null,
      level: orig.level,
      node_id: duplicateNodeId,
      client_id: duplicateClientId,
      environment: duplicateEnvironment,
    }).select("id,level,node_id").single();

    if (error) return toast.error(error.message);
    if (data) {
      setDiagramId(data.id);
      setName(trimmed);
      setLoadedName(trimmed);
      // Para navegación, los diagramas "subprocesos" se editan como "procesos".
      const navType: DiagramType = (persistedType === "subprocesos" ? "procesos" : persistedType) as DiagramType;
      if (persistedType === "subprocesos") setDiagramClass("subproceso");
      else if (persistedType === "procesos") setDiagramClass("proceso");
      navigate({
        to: "/modeler",
        search: (prev: SearchT) => ({
          ...prev,
          level: data.level as LevelKey,
          id: data.node_id,
          type: navType,
          definitionId: "",
          instanceId: "",
        }),
      });
    }
    toast.success("Diagrama creado (v1)");
    qc.invalidateQueries({ queryKey: ["diagrams-list"] });
  };





  const runAllValidations = async (): Promise<{
    results: Array<{ id: CheckId; label: string; ok: boolean; details: string[]; failingIds: string[]; scope: string }>;
    failingMainIds: Set<string>;
  }> => {
    type Result = { id: CheckId; label: string; ok: boolean; details: string[]; failingIds: string[]; scope: string };
    const checkIds = new Set<CheckId>(ALL_CHECKS.map((c) => c.id));
    const runChecks = (nodeList: Node[], edgeList: Edge[], scope: string): Result[] => {
      const getKind = (n: Node) => (n.data as { kind?: string } | undefined)?.kind ?? "";
      const getLabel = (n: Node) => ((n.data as { label?: string; name?: string } | undefined)?.label || (n.data as { name?: string } | undefined)?.name || `#${n.id.slice(0, 6)}`);
      const isFlowNode = (n: Node) => {
        const k = getKind(n);
        return k !== "lane" && k !== "subContainer" && k !== "" && !k.startsWith("macro.");
      };
      const flowNodes = nodeList.filter(isFlowNode);
      const adj = new Map<string, string[]>();
      edgeList.forEach((e) => {
        if (!e.source || !e.target) return;
        adj.set(e.source, [...(adj.get(e.source) ?? []), e.target]);
      });
      const startIds = flowNodes.filter((n) => getKind(n) === "start").map((n) => n.id);
      const endIds = flowNodes.filter((n) => getKind(n) === "end").map((n) => n.id);
      const out: Result[] = [];
      const push = (id: CheckId, ok: boolean, details: string[] = [], failingIds: string[] = []) => {
        const label = ALL_CHECKS.find((c) => c.id === id)!.label;
        out.push({ id, label, ok, details, failingIds, scope });
      };
      if (checkIds.has("start")) push("start", startIds.length > 0, startIds.length === 0 ? ["No se encontró ningún nodo de Inicio"] : []);
      if (checkIds.has("end")) push("end", endIds.length > 0, endIds.length === 0 ? ["No se encontró ningún nodo de Fin"] : []);
      if (checkIds.has("names")) {
        const bad = flowNodes.filter((n) => {
          const k = getKind(n);
          if (k === "start" || k === "end") return false;
          const lbl = (n.data as { label?: string; name?: string } | undefined);
          return !((lbl?.label || lbl?.name || "").trim());
        });
        push("names", bad.length === 0, bad.map((n) => `${getKind(n)} sin nombre (#${n.id.slice(0, 6)})`), bad.map((n) => n.id));
      }
      if (checkIds.has("gateways")) {
        const bad = flowNodes.filter((n) => {
          if (getKind(n) !== "gateway") return false;
          const outs = adj.get(n.id)?.length ?? 0;
          return outs < 2;
        });
        push("gateways", bad.length === 0, bad.map((n) => `${getLabel(n)}: necesita 2 salidas`), bad.map((n) => n.id));
      }
      if (checkIds.has("subprocess")) {
        const bad = flowNodes.filter((n) => {
          if (getKind(n) !== "subprocess") return false;
          const d = n.data as { subprocessDiagramId?: string } | undefined;
          return !d?.subprocessDiagramId;
        });
        push("subprocess", bad.length === 0, bad.map((n) => `${getLabel(n)} no tiene proceso vinculado`), bad.map((n) => n.id));
      }
      if (checkIds.has("duplicates")) {
        const counts = new Map<string, number>();
        const byLabel = new Map<string, string[]>();
        flowNodes.forEach((n) => {
          const lbl = ((n.data as { label?: string; name?: string } | undefined)?.label || "").trim();
          if (!lbl) return;
          counts.set(lbl, (counts.get(lbl) ?? 0) + 1);
          byLabel.set(lbl, [...(byLabel.get(lbl) ?? []), n.id]);
        });
        const dups = [...counts.entries()].filter(([, c]) => c > 1);
        const dupIds = dups.flatMap(([l]) => byLabel.get(l) ?? []);
        push("duplicates", dups.length === 0, dups.map(([l, c]) => `"${l}" aparece ${c} veces`), dupIds);
      }
      return out;
    };

    const allResults: Result[] = [];
    const subprocessFailMap = new Map<string, string[]>();
    allResults.push(...runChecks(nodes, edges, "Principal"));
    const visited = new Set<string>();
    type Queued = { diagramId: string; pathLabel: string; rootSubNodeId: string };
    const queue: Queued[] = [];
    nodes.forEach((n) => {
      const d = n.data as { kind?: string; subprocessDiagramId?: string; subprocessDiagramName?: string; label?: string } | undefined;
      if (d?.kind === "subprocess" && d?.subprocessDiagramId) {
        queue.push({
          diagramId: d.subprocessDiagramId,
          pathLabel: `Subproceso · ${d.subprocessDiagramName || d.label || n.id.slice(0, 6)}`,
          rootSubNodeId: n.id,
        });
      }
    });
    while (queue.length) {
      const cur = queue.shift()!;
      if (visited.has(cur.diagramId)) continue;
      visited.add(cur.diagramId);
      const { data: sub, error } = await supabase
        .from("process_diagrams")
        .select("name,nodes,edges")
        .eq("id", cur.diagramId)
        .maybeSingle();
      if (error || !sub) continue;
      const subNodes = (sub.nodes as unknown as Node[]) ?? [];
      const subEdges = (sub.edges as unknown as Edge[]) ?? [];
      const subResults = runChecks(subNodes, subEdges, cur.pathLabel);
      allResults.push(...subResults);
      if (subResults.some((r) => !r.ok)) {
        subprocessFailMap.set(cur.rootSubNodeId, [...(subprocessFailMap.get(cur.rootSubNodeId) ?? []), cur.pathLabel]);
      }
      subNodes.forEach((n) => {
        const d = n.data as { kind?: string; subprocessDiagramId?: string; subprocessDiagramName?: string; label?: string } | undefined;
        if (d?.kind === "subprocess" && d?.subprocessDiagramId) {
          queue.push({
            diagramId: d.subprocessDiagramId,
            pathLabel: `${cur.pathLabel} › ${d.subprocessDiagramName || d.label || n.id.slice(0, 6)}`,
            rootSubNodeId: cur.rootSubNodeId,
          });
        }
      });
    }
    const failingMainIds = new Set<string>();
    allResults.forEach((r) => {
      if (r.scope === "Principal") r.failingIds.forEach((id) => failingMainIds.add(id));
    });
    subprocessFailMap.forEach((_v, id) => failingMainIds.add(id));
    return { results: allResults, failingMainIds };
  };

  const publishFn = useServerFn(publishDefinition);
  const [publishPreview, setPublishPreview] = useState<{ nodes: Node[]; edges: Edge[] } | null>(null);
  const [publishing, setPublishing] = useState(false);

  // Flat (non-recursive) validator used on the expanded diagram. After expansion
  // there are no subprocess placeholders, so we re-use the inner check list.
  const runFlatChecks = (nodeList: Node[], edgeList: Edge[]) => {
    type Result = { id: CheckId; label: string; ok: boolean; details: string[]; failingIds: string[]; scope: string };
    const getKind = (n: Node) => (n.data as { kind?: string } | undefined)?.kind ?? "";
    const getLabel = (n: Node) => ((n.data as { label?: string; name?: string } | undefined)?.label || (n.data as { name?: string } | undefined)?.name || `#${n.id.slice(0, 6)}`);
    const isFlowNode = (n: Node) => {
      const k = getKind(n);
      return k !== "lane" && k !== "subContainer" && k !== "" && !k.startsWith("macro.");
    };
    const flowNodes = nodeList.filter(isFlowNode);
    const adj = new Map<string, string[]>();
    edgeList.forEach((e) => { if (e.source && e.target) adj.set(e.source, [...(adj.get(e.source) ?? []), e.target]); });
    const startIds = flowNodes.filter((n) => getKind(n) === "start").map((n) => n.id);
    const endIds = flowNodes.filter((n) => getKind(n) === "end").map((n) => n.id);
    const out: Result[] = [];
    const push = (id: CheckId, ok: boolean, details: string[] = [], failingIds: string[] = []) => {
      const label = ALL_CHECKS.find((c) => c.id === id)!.label;
      out.push({ id, label, ok, details, failingIds, scope: "Expandido" });
    };
    push("start", startIds.length > 0, startIds.length === 0 ? ["No se encontró ningún nodo de Inicio"] : []);
    push("end", endIds.length > 0, endIds.length === 0 ? ["No se encontró ningún nodo de Fin"] : []);
    const badNames = flowNodes.filter((n) => {
      const k = getKind(n);
      if (k === "start" || k === "end") return false;
      const lbl = (n.data as { label?: string; name?: string } | undefined);
      return !((lbl?.label || lbl?.name || "").trim());
    });
    push("names", badNames.length === 0, badNames.map((n) => `${getKind(n)} sin nombre (#${n.id.slice(0, 6)})`), badNames.map((n) => n.id));
    const badGw = flowNodes.filter((n) => getKind(n) === "gateway" && (adj.get(n.id)?.length ?? 0) < 2);
    push("gateways", badGw.length === 0, badGw.map((n) => `${getLabel(n)}: necesita 2 salidas`), badGw.map((n) => n.id));
    // subprocess check: after expansion none should remain
    const badSp = flowNodes.filter((n) => getKind(n) === "subprocess");
    push("subprocess", badSp.length === 0, badSp.map((n) => `${getLabel(n)} no expandido`), badSp.map((n) => n.id));
    const counts = new Map<string, number>();
    flowNodes.forEach((n) => {
      const lbl = ((n.data as { label?: string; name?: string } | undefined)?.label || "").trim();
      if (lbl) counts.set(lbl, (counts.get(lbl) ?? 0) + 1);
    });
    const dups = [...counts.entries()].filter(([, c]) => c > 1);
    push("duplicates", dups.length === 0, dups.map(([l, c]) => `"${l}" aparece ${c} veces`));
    return out;
  };

  const publish = async () => {
    if (!canEdit) return toast.error("Sin permisos para publicar");
    if (diagramType !== "procesos") {
      return toast.error("Solo se publican diagramas de tipo Proceso");
    }
    if (diagramClass === "subproceso") {
      return toast.error("No se pueden publicar subprocesos al motor. Publica el Proceso que los contiene.");
    }
    if (!diagramId) return toast.error("Guarda el diagrama antes de publicar");
    try {
      // 1) Validate the source diagram with the standard checks.
      const { results, failingMainIds } = await runAllValidations();
      const failed = results.filter((r) => !r.ok);
      if (failed.length > 0) {
        setValidateChecks(new Set(ALL_CHECKS.map((c) => c.id)));
        setValidateResults(results);
        setFailingNodeIds(failingMainIds);
        setValidateOpen(true);
        toast.error(`No se puede publicar: ${failed.length} comprobación(es) no superada(s)`);
        return;
      }
      // 2) Expand linked subprocesses inline.
      const expandedRaw = await expandSubprocessesRecursive(nodes, edges);
      // Tidy layout: Y = execution order (topological depth), grouped by lane.
      const expanded = { nodes: layoutExpanded(expandedRaw.nodes, expandedRaw.edges), edges: expandedRaw.edges };
      // 3) Re-run flat validations on the expanded diagram.
      const expandedResults = runFlatChecks(expanded.nodes, expanded.edges);
      const expandedFailed = expandedResults.filter((r) => !r.ok);
      if (expandedFailed.length > 0) {
        setValidateChecks(new Set(ALL_CHECKS.map((c) => c.id)));
        setValidateResults(expandedResults);
        setFailingNodeIds(new Set());
        setValidateOpen(true);
        toast.error(`Diagrama expandido inválido: ${expandedFailed.length} comprobación(es)`);
        return;
      }
      // 4) Auto-save before preview when everything is valid.
      const saved = await save({ skipConfirm: true });
      if (!saved) return;
      // 5) Show the expanded diagram to the user for confirmation.
      setPublishPreview(expanded);
    } catch (e: unknown) {
      toast.error((e as Error).message);
    }
  };

  const confirmPublish = async () => {
    if (!diagramId || !publishPreview) return;
    setPublishing(true);
    try {
      const res = await publishFn({ data: { diagramId, nodes: publishPreview.nodes, edges: publishPreview.edges, entityId: selectedEntity?.id ?? null, clientId: currentClientId ?? null, environment } });
      toast.success(`Publicado v${res.version} al motor`);
      setPublishPreview(null);
    } catch (e: unknown) {
      toast.error((e as Error).message);
    } finally {
      setPublishing(false);
    }
  };



  const clearAll = () => {
    if (nodes.length === 0 && edges.length === 0) return;
    if (diagramType === "datos") {
      if (!confirm("¿Quitar todas las tablas del lienzo? (no se eliminan del catálogo)")) return;
      setNodes([]); setEdges([]);
      return;
    }
    if (!confirm("¿Limpiar el lienzo completo?")) return;
    setNodes([]); setEdges([]);
  };

  const deleteSelection = () => {
    const selectedNodes = nodes.filter((n) => n.selected);
    if (diagramType === "datos" && selectedNodes.some((n) => n.type === "dataEntity")) {
      toast.info("Para eliminar una tabla usa Campos_Tablas. Aquí solo se quita del lienzo desmarcándola en el panel.");
      return;
    }
    const remainingNodes = nodes.filter((n) => !n.selected);
    const removedIds = new Set(selectedNodes.map((n) => n.id));

    const remainingEdges = edges.filter((e) => !e.selected && !removedIds.has(e.source) && !removedIds.has(e.target));

    // Synthetic FK edges live in combinedEdges (not in `edges`). Detect them via selectedEdgeId.
    const fkSelectedId = selectedEdgeId && selectedEdgeId.startsWith("fk-") ? selectedEdgeId : null;

    if (
      remainingNodes.length === nodes.length &&
      remainingEdges.length === edges.length &&
      !fkSelectedId
    ) {
      toast.info("Selecciona un nodo o línea para eliminar");
      return;
    }
    setNodes(remainingNodes);
    setEdges(remainingEdges);

    if (fkSelectedId && diagramId && currentClientId) {
      const childColId = fkSelectedId.replace(/^fk-/, "");
      const cached = (qc.getQueryData(["entity-table-columns", diagramId]) ?? []) as (DbColumn & { node_id: string })[];
      const childCol = cached.find((r) => r.id === childColId);
      if (!childCol) {
        toast.error("Columna FK no encontrada");
        return;
      }
      upsertColumnFn({ data: {
        id: childColId,
        clientId: currentClientId,
        environment,
        diagramId,
        nodeId: childCol.node_id,
        fieldId: childCol.field_id,
        fkTargetNodeId: null,
        fkTargetColumnId: null,
      } })
        .then(() => {
          toast.success("Relación FK eliminada");
          setSelectedEdgeId(null);
          qc.invalidateQueries({ queryKey: ["entity-table-columns", diagramId] });
        })
        .catch((err: Error) => toast.error(err.message));
    }
  };

  const onChangeDiagramType = (v: DiagramType) => {
    if ((nodes.length > 0 || edges.length > 0) && !confirm("Cambiar de tipo borrará el lienzo actual. ¿Continuar?")) return;
    setDiagramType(v);
    setNodes([]); setEdges([]);
    setDiagramId(null);
    setParentRef(null);
    setName("");
    setLoadedName(null);
  };

  const setEdgeCardinality = (card: string | null) => {
    if (!selectedEdgeId) return;
    setEdges((es) => es.map((e) => e.id === selectedEdgeId
      ? { ...e, type: "labeled", data: { ...(e.data ?? {}), cardinality: card ?? undefined } }
      : e));
  };

  const setEdgeDescription = (text: string) => {
    if (!selectedEdgeId) return;
    setEdges((es) => es.map((e) => e.id === selectedEdgeId
      ? { ...e, type: "labeled", data: { ...(e.data ?? {}), description: text || undefined } }
      : e));
  };

  const selectedEdge = edges.find((e) => e.id === selectedEdgeId);
  const selectedEdgeSourceKind = selectedEdge
    ? (nodes.find((n) => n.id === selectedEdge.source)?.data as { kind?: string } | undefined)?.kind
    : undefined;
  const isFromGateway = selectedEdgeSourceKind === "gateway";

  const selectedNode = nodes.find((n) => n.selected) ?? null;
  const hasExpandedSubprocess = nodes.some((n) => {
    const d = n.data as { kind?: string; expanded?: boolean; subprocessDiagramId?: string };
    return d?.kind === "subprocess" && !!d?.expanded && !!d?.subprocessDiagramId;
  });
  const updateSelectedNodeData = (patch: Record<string, unknown>) => {
    if (!selectedNode) return;
    setNodes((nds) => nds.map((n) => (n.id === selectedNode.id ? { ...n, data: { ...n.data, ...patch } } : n)));
  };

  const updateSelectedEdgeData = (patch: Record<string, unknown>) => {
    if (!selectedEdgeId) return;
    setEdges((es) => es.map((e) => e.id === selectedEdgeId
      ? { ...e, type: "labeled", data: { ...(e.data ?? {}), ...patch } }
      : e));
  };


  // Track selected edge id (for cardinality picker)
  useEffect(() => {
    const sel = edges.find((e) => e.selected);
    setSelectedEdgeId(sel?.id ?? null);
    if (!sel) setEdgePropsOpenId(null);
    else if (edgePropsOpenId && edgePropsOpenId !== sel.id) setEdgePropsOpenId(null);
  }, [edges, edgePropsOpenId]);

  // Auto-label outgoing edges of gateway nodes so True/False labels are
  // always visible, regardless of whether the properties panel is open.
  useEffect(() => {
    const gatewayIds = new Set(
      nodes
        .filter((n) => n.type === "bpmn" && (n.data as { kind?: string }).kind === "gateway")
        .map((n) => n.id),
    );
    if (gatewayIds.size === 0) return;
    let changed = false;
    const next = edges.map((e) => {
      if (!gatewayIds.has(e.source)) return e;
      const current = (e.data as { branch?: string } | undefined)?.branch;
      if (current === "true" || current === "false") return e;
      const auto: "true" | "false" = e.sourceHandle === "l-s" ? "false" : "true";
      changed = true;
      return { ...e, data: { ...(e.data as object), branch: auto } };
    });
    if (changed) setEdges(next);
  }, [nodes, edges, setEdges]);

  // Render the palette for current diagram type
  const renderPalette = () => {
    if (diagramType === "procesos") {
      return (
        <div className="grid gap-2">
          {(Object.keys(KIND_META) as BpmnKind[])
            .map((kind) => {
              const meta = KIND_META[kind];
              const Icon = meta.icon;
              const base = meta.i18n ? t(meta.i18n) : meta.label ?? kind;
              const label = meta.eventPrefix ? `Evento ${base}` : base;
              return (
                <div
                  key={kind}
                  draggable
                  onDragStart={(e) => onDragStart(e, kind)}
                  className="flex cursor-grab items-center gap-2 rounded-md border bg-background px-3 py-2 text-xs shadow-sm hover:border-primary active:cursor-grabbing"
                  style={{ borderLeft: `3px solid ${meta.color}` }}
                >
                  <Icon className="h-4 w-4" style={{ color: meta.color }} />
                  <span className="font-medium">{label}</span>
                </div>
              );
            })}
          <div
            key="phase"
            draggable
            onDragStart={(e) => onDragStart(e, "phase")}
            className="flex cursor-grab items-center gap-2 rounded-md border bg-background px-3 py-2 text-xs shadow-sm hover:border-primary active:cursor-grabbing"
            style={{ borderLeft: `3px solid #8b5cf6` }}
            title="Agrupador visual (no afecta al flujo)"
          >
            <SquareDashed className="h-4 w-4" style={{ color: "#8b5cf6" }} />
            <span className="font-medium">Fase</span>
          </div>
        </div>
      );
    }
    if (diagramType === "datos") {
      const tables = (dataTablesQ.data ?? []) as { id: string; label: string }[];
      const presentIds = new Set(nodes.filter((n) => n.type === "dataEntity").map((n) => n.id));
      const toggleTable = (t: { id: string; label: string }, checked: boolean) => {
        if (checked) {
          if (presentIds.has(t.id)) return;
          const newNode: Node = {
            id: t.id,
            type: "dataEntity",
            position: { x: 80 + Math.random() * 200, y: 80 + Math.random() * 200 },
            style: { width: 240, height: 160 },
            data: { label: t.label, color: "#0ea5e9", fields: [], entity_id: null, description: "", version: "1.0", nodeType: "" },
          };
          setNodes((nds) => nds.concat(newNode));
          bumpEdges();
        } else {
          setNodes((nds) => nds.filter((n) => n.id !== t.id));
          setEdges((eds) => eds.filter((e) => e.source !== t.id && e.target !== t.id));
          bumpEdges();
        }
      };
      return (
        <div className="grid gap-2">
          <p className="text-[10px] text-muted-foreground">
            Marca las tablas que quieres mostrar en el lienzo. Para crear, renombrar o eliminar tablas, abre Campos_Tablas.
          </p>
          <div className="max-h-[55vh] space-y-0.5 overflow-auto rounded border bg-background p-1">
            {tables.map((t) => {
              const checked = presentIds.has(t.id);
              return (
                <label
                  key={t.id}
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs hover:bg-muted"
                  title={t.label}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => toggleTable(t, e.target.checked)}
                  />
                  <Database className="h-3.5 w-3.5 shrink-0" style={{ color: "#0ea5e9" }} />
                  <span className="truncate">{t.label}</span>
                </label>
              );
            })}
          </div>
        </div>
      );
    }

    const palette = GENERIC_PALETTES[diagramType];
    return (
      <div className="grid gap-2">
        {palette.map((item) => {
          const Icon = item.icon;
          if (item.container === "band") {
            return (
              <div
                key={item.kind}
                draggable
                onDragStart={(e) => onDragStart(e, item.kind)}
                className="flex h-10 w-full cursor-grab items-center gap-2 rounded-md text-[11px] font-semibold uppercase tracking-wider text-white shadow-sm hover:opacity-90 active:cursor-grabbing"
                style={{ background: item.color, paddingLeft: 10, paddingRight: 10 }}
                title="Banda contenedora — se sitúa detrás de los procesos del mapa"
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate whitespace-pre-line">{item.label}</span>
              </div>
            );
          }
          if (item.container === "side") {
            return (
              <div
                key={item.kind}
                draggable
                onDragStart={(e) => onDragStart(e, item.kind)}
                className="flex h-16 w-full cursor-grab flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed text-[10px] font-semibold uppercase tracking-wider shadow-sm hover:opacity-90 active:cursor-grabbing"
                style={{ borderColor: item.color, color: item.color }}
                title="Columna lateral — se sitúa detrás de los procesos del mapa"
              >
                <Icon className="h-4 w-4" />
                <span className="px-2 text-center leading-tight whitespace-pre-line">{item.label}</span>
              </div>
            );
          }
          return (
            <div
              key={item.kind}
              draggable
              onDragStart={(e) => onDragStart(e, item.kind)}
              className="flex cursor-grab items-center gap-2 rounded-md border-2 bg-card px-3 py-2 text-xs shadow-sm hover:border-primary active:cursor-grabbing"
              style={{ borderColor: item.color }}
            >
              <Icon className="h-4 w-4" style={{ color: item.color }} />
              <span className="font-medium">{item.label}</span>
            </div>
          );
        })}
        <p className="mt-1 text-[10px] text-muted-foreground">
          Las bandas y columnas laterales se colocan detrás de los procesos del mapa. Selecciona un nodo para redimensionar, renombrar y recolorear.
        </p>
      </div>
    );
  };

  // Parent selector
  const renderParentSelect = () => {
    const need = PARENT_REQUIRED[diagramType];
    if (!need || attachedKey) return null;
    const list = need === "macroprocesses" ? macroprocessOptions.data ?? [] : processOptions.data ?? [];
    return (
      <Select
        value={parentRef?.id ?? ""}
        onValueChange={(v) => setParentRef({ table: need, id: v })}
      >
        <SelectTrigger className="h-9 w-56">
          <SelectValue placeholder="Proceso…" />
        </SelectTrigger>
        <SelectContent>
          {list.map((it) => (
            <SelectItem key={it.id} value={it.id}>{it.code} — {it.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  };

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-card px-6 py-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <GitBranch className="h-5 w-5 text-primary" />
            <h1 className="font-display text-xl font-semibold">{diagramType === "datos" ? t("modeler.dbTitle") : t("modeler.title")}</h1>
          </div>
          <p className="text-xs text-muted-foreground">{diagramType === "datos" ? t("modeler.dbSubtitle") : t("modeler.subtitle")}</p>
          {(diagramType !== "datos") && (
            <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
              <Badge variant="outline" className="gap-1 px-1.5 py-0 text-[10px] font-normal" title={currentClient?.id ?? undefined}>
                <Building2 className="h-3 w-3" />
                Tenant: {currentClient?.code ?? currentClient?.name ?? "—"}
                {currentClient?.code && currentClient?.name ? <span className="text-muted-foreground">· {currentClient.name}</span> : null}
              </Badge>
              {(existing.data?.client_id ?? currentClient?.id) && (
                <Badge variant="outline" className="gap-1 px-1.5 py-0 font-mono text-[10px] font-normal">
                  ID: {(existing.data?.client_id ?? currentClient?.id ?? "").slice(0, 8)}
                </Badge>
              )}
              <Badge variant="outline" className="gap-1 px-1.5 py-0 text-[10px] font-normal">
                <Box className="h-3 w-3" /> {existing.data?.entity_id ? (selectedEntity?.name ?? "Entidad del diagrama") : (selectedEntity?.name ?? "Sin entidad")}
              </Badge>
              <Badge
                variant="outline"
                className="gap-1 px-1.5 py-0 text-[10px] font-normal"
              >
                {((existing.data?.environment as string | undefined) ?? environment) === "produccion" ? (
                  <><Rocket className="h-3 w-3" /> Entorno: Producción</>
                ) : (
                  <><FlaskConical className="h-3 w-3" /> Entorno: Pruebas</>
                )}
              </Badge>
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {viewMode ? (
            <>
              <Badge variant="secondary">Solo lectura</Badge>
              <Select
                value={search.instanceId ?? ""}
                onValueChange={(v) => {
                  const inst = (allInstancesList.data ?? []).find((i) => i.id === v);
                  if (!inst) return;
                  navigate({
                    to: "/modeler",
                    search: (prev: SearchT) => ({ ...prev, definitionId: inst.definition_id, instanceId: inst.id }),
                    replace: true,
                  });
                }}
              >
                <SelectTrigger className="h-9 w-[28rem]">
                  <SelectValue placeholder={allInstancesList.data?.length ? "Selecciona una instancia…" : "Sin instancias disponibles"} />
                </SelectTrigger>
                <SelectContent>
                  {(allInstancesList.data ?? []).map((i) => (
                    <SelectItem key={i.id} value={i.id}>
                      {i.process_definitions?.name ?? "—"} v{i.process_definitions?.version ?? "?"} · {i.status} · {new Date(i.started_at).toLocaleString()} · #{i.id.slice(0, 8)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {defQuery.data && (
                <span className="text-sm font-medium">{defQuery.data.name} <span className="text-xs text-muted-foreground">v{defQuery.data.version}</span></span>
              )}
              {search.definitionId && (
                <Select
                  value={search.instanceId ?? ""}
                  onValueChange={(v) => navigate({ to: "/modeler", search: (prev: SearchT) => ({ ...prev, instanceId: v }) })}
                >
                  <SelectTrigger className="h-9 w-72">
                    <SelectValue placeholder={instancesList.data?.length ? "Otra instancia de esta definición…" : "Sin instancias"} />
                  </SelectTrigger>
                  <SelectContent>
                    {(instancesList.data ?? []).map((i) => (
                      <SelectItem key={i.id} value={i.id}>
                        #{i.id.slice(0, 8)} · {i.status} · {new Date(i.started_at).toLocaleString()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500/70" /> Completado</span>
                <span className="inline-flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full bg-rose-500/80" /> Actual</span>
                <span className="inline-flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-400/80" /> Pendiente</span>
              </div>
              <Link to="/engine" search={{ drafts: undefined, tab: undefined }}>
                <Button variant="outline" size="sm">Ir al motor</Button>
              </Link>
            </>
          ) : (
            <>
              {diagramType === "datos" ? (
                <Badge variant="secondary" className="h-9 w-60 justify-center text-sm">BD de Negocio</Badge>
              ) : (
                <Select value={diagramType} onValueChange={(v) => onChangeDiagramType(v as DiagramType)}>
                  <SelectTrigger className="h-9 w-60"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DIAGRAM_TYPES.map((d) => <SelectItem key={d.id} value={d.id}>{d.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
              {renderParentSelect()}
              {diagramType !== "datos" && (
                <div className="flex items-center gap-2">
              {diagramType === "procesos" && (
                <Select
                  value={diagramClass}
                  onValueChange={async (v) => {
                    const newClass = v as "proceso" | "subproceso";
                    setDiagramClass(newClass);
                    if (diagramId) {
                      const newType = newClass === "subproceso" ? "subprocesos" : "procesos";
                      const { error } = await supabase
                        .from("process_diagrams")
                        .update({ diagram_type: newType })
                        .eq("id", diagramId);
                      if (error) {
                        toast.error(error.message);
                        return;
                      }
                      toast.success(`Cambio a ${newClass === "subproceso" ? "Subproceso" : "Proceso"} guardado`);
                      qc.invalidateQueries({ queryKey: ["diagrams-list"] });
                      qc.invalidateQueries({ queryKey: ["diagram"] });
                    }
                  }}
                >
                  <SelectTrigger className="h-9 w-32 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="proceso">Proceso</SelectItem>
                    <SelectItem value="subproceso">Subproceso</SelectItem>
                  </SelectContent>
                </Select>
              )}
              <Input value={name} onChange={(e) => setName(e.target.value)} className="h-9 w-56" maxLength={120} placeholder="Nombre del diagrama" />
                  {existing.data?.version != null && (
                    <Badge variant="outline" className="h-9 px-2 text-xs">v{existing.data.version}</Badge>
                  )}
                </div>
              )}
              {!attachedKey && !PARENT_REQUIRED[diagramType] && diagramType !== "macroprocesos" && (
                <Badge variant="outline" className="hidden md:inline-flex">{t("modeler.standalone")}</Badge>
              )}
              <Button size="sm" onClick={() => {
                if (diagramType === "procesos") {
                  setClassDialogChoice(diagramClass);
                  setClassDialogMode("save");
                  setPendingDuplicate(null);
                  setClassDialogOpen(true);
                } else {
                  save();
                }
              }}>
                <Save className="mr-2 h-4 w-4" /> {t("modeler.save")}
              </Button>
              {diagramType !== "datos" && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (nodes.length > 0 || edges.length > 0 || name.trim()) {
                      if (!confirm("¿Limpiar el lienzo y el nombre del diagrama? Los cambios no guardados se perderán.")) return;
                    }
                    setDiagramId(null);
                    setNodes([]);
                    setEdges([]);
                    setName("");
                    setLoadedName(null);
                    navigate({
                      to: "/modeler",
                      search: (prev: SearchT) => ({ ...prev, id: "", definitionId: "", instanceId: "" }),
                    });
                  }}
                  title="Limpiar el lienzo, el nombre y la versión"
                >
                  <Eraser className="mr-2 h-4 w-4" /> Limpiar lienzo
                </Button>
              )}
              {diagramType === "procesos" && (
                <Button
                  size="sm"
                  variant="outline"
                  className="border-emerald-500/60 text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950"
                  onClick={() => { setValidateResults(null); setValidateOpen(true); }}
                  title="Comprobar la validez del proceso"
                >
                  <ShieldCheck className="mr-2 h-4 w-4" /> Comprobar proceso
                </Button>
              )}
              {canEdit && diagramType === "datos" && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    if (!diagramId) {
                      toast.error("Guarda primero el diagrama para gestionar sus campos");
                      return;
                    }
                    setFieldsOpen(true);
                  }}
                  title="Gestionar campos_tablas y columnas de cada tabla"
                  className="border border-primary/40"
                >
                  <Columns3 className="mr-2 h-4 w-4" /> Modelador de Tablas, campos, claves y relaciones
                </Button>
              )}
              {canEdit && diagramType !== "datos" && diagramType !== "macroprocesos" && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="border border-primary/40"
                      title="Acciones sobre las variables del proceso"
                    >
                      <Database className="mr-2 h-4 w-4" /> Variables <ChevronDown className="ml-1 h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-64">
                    <DropdownMenuItem
                      disabled={!diagramId || diagramType !== "procesos"}
                      onSelect={() => setVariablesOpen(true)}
                    >
                      <Database className="mr-2 h-4 w-4" /> Catálogo de variables
                    </DropdownMenuItem>
                    {diagramType === "procesos" && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onSelect={() => setImportDialogOpen(true)}
                        >
                          <Download className="mr-2 h-4 w-4" /> Importar de otro scope
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => {
                            if (!window.confirm("¿Heredar variables? Cada nodo tomará como entradas las salidas de los nodos que le preceden.")) return;
                            // Build predecessor map from edges
                            const preds = new Map<string, string[]>();
                            edges.forEach((e) => {
                              if (!e.source || !e.target) return;
                              const arr = preds.get(e.target) ?? [];
                              arr.push(e.source);
                              preds.set(e.target, arr);
                            });
                            const nodeById = new Map(nodes.map((n) => [n.id, n]));
                            const outputsOf = (n: Node | undefined): string[] => {
                              if (!n) return [];
                              const d = n.data as { kind?: string; outputs?: string[]; outputsTrue?: string[]; outputsFalse?: string[] };
                              if (d?.kind === "gateway") return [...(d.outputsTrue ?? []), ...(d.outputsFalse ?? [])];
                              return d?.outputs ?? [];
                            };
                            let touched = 0;
                            setNodes((nds) => nds.map((n) => {
                              const incoming = preds.get(n.id) ?? [];
                              if (incoming.length === 0) return n;
                              const inherited = new Set<string>();
                              incoming.forEach((sid) => outputsOf(nodeById.get(sid)).forEach((v) => v && inherited.add(v)));
                              if (inherited.size === 0) return n;
                              const d = n.data as { inputs?: string[] };
                              const current = new Set<string>(d.inputs ?? []);
                              const before = current.size;
                              inherited.forEach((v) => current.add(v));
                              if (current.size === before) return n;
                              touched += 1;
                              return { ...n, data: { ...n.data, inputs: Array.from(current) } };
                            }));
                            if (touched === 0) toast.info("No hay variables nuevas para heredar");
                            else toast.success(`${touched} nodo(s) actualizado(s) con variables heredadas`);
                          }}
                        >
                          <GitBranch className="mr-2 h-4 w-4" /> Heredar variables
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onSelect={() => {
                            if (!window.confirm("¿Eliminar TODAS las variables (entradas y salidas) de todos los nodos del diagrama? Esta acción no se puede deshacer.")) return;
                            let touched = 0;
                            setNodes((nds) => nds.map((n) => {
                              const d = n.data as { inputs?: string[]; outputs?: string[]; outputsTrue?: string[]; outputsFalse?: string[]; inputMeta?: Record<string, unknown> };
                              const hasAny = (d.inputs?.length ?? 0) > 0 || (d.outputs?.length ?? 0) > 0 || (d.outputsTrue?.length ?? 0) > 0 || (d.outputsFalse?.length ?? 0) > 0;
                              if (!hasAny) return n;
                              touched += 1;
                              return { ...n, data: { ...n.data, inputs: [], outputs: [], outputsTrue: [], outputsFalse: [], inputMeta: {} } };
                            }));
                            if (touched === 0) toast.info("No había variables que eliminar");
                            else toast.success(`Variables eliminadas en ${touched} nodo(s)`);
                          }}
                        >
                          <Trash2 className="mr-2 h-4 w-4" /> Limpiar variables
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              {canEdit && diagramType !== "datos" && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (!selectedNode && !selectedEdgeId) {
                      toast.info("Selecciona un nodo o línea para eliminar");
                      return;
                    }
                    const label = selectedNode
                      ? ((selectedNode.data as { label?: string }).label ?? "este elemento")
                      : ((selectedEdge?.data as { label?: string } | undefined)?.label || "esta línea");
                    if (!confirm(`¿Eliminar "${label}" del diagrama?`)) return;
                    setPropertiesOpenId(null);
                    setEdgePropsOpenId(null);
                    deleteSelection();
                  }}
                  disabled={!selectedNode && !selectedEdgeId}
                  title="Eliminar el nodo o la línea seleccionada"
                  className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4" /> Eliminar selección
                </Button>
              )}
              {canEdit && diagramType === "procesos" && (
                <Button size="sm" variant="secondary" onClick={publish}>
                  <Rocket className="mr-2 h-4 w-4" /> Publicar al motor
                </Button>
              )}

            </>
          )}
        </div>

      </div>

      {!viewMode && diagramType === "datos" && selectedEdgeId && (
        <div className="flex items-center gap-2 border-b bg-muted/40 px-6 py-2 text-xs">
          <span className="font-medium">Cardinalidad de la línea:</span>
          {(["1-1", "1-n", "n-1"] as const).map((c) => (
            <Button key={c} size="sm" variant="outline" onClick={() => setEdgeCardinality(c)}>{c}</Button>
          ))}
          <Button size="sm" variant="ghost" onClick={() => setEdgeCardinality(null)}>Sin etiqueta</Button>
        </div>
      )}

      {!viewMode && selectedEdgeId && (
        <div className="flex flex-wrap items-center gap-2 border-b bg-muted/40 px-6 py-2 text-xs">
          <span className="font-medium whitespace-nowrap">
            {isFromGateway ? "Descripción de la decisión:" : "Descripción de la línea:"}
          </span>
          <Input
            value={(selectedEdge?.data as { description?: string } | undefined)?.description ?? ""}
            onChange={(e) => setEdgeDescription(e.target.value)}
            placeholder={isFromGateway ? "Ej. Sí / No / Aprobado…" : "Describe el flujo…"}
            className="h-8 max-w-md"
            maxLength={120}
          />
          <Button size="sm" variant="ghost" onClick={() => setEdgeDescription("")}>Borrar</Button>
          {isFromGateway && (
            <>
              <span className="ml-2 font-medium whitespace-nowrap">Rama:</span>
              {(["true", "false"] as const).map((b) => {
                const active = (selectedEdge?.data as { branch?: string } | undefined)?.branch === b;
                return (
                  <Button
                    key={b}
                    size="sm"
                    variant={active ? "default" : "outline"}
                    className={active ? (b === "true" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-rose-600 hover:bg-rose-700") : ""}
                    onClick={() => updateSelectedEdgeData({ branch: active ? undefined : b })}
                  >
                    {b === "true" ? "Verdadero" : "Falso"}
                  </Button>
                );
              })}
            </>
          )}
        </div>
      )}



      <div className="flex flex-1 overflow-hidden">
        {!viewMode && (
        <aside style={{ width: paletteWidth }} className="shrink-0 border-r bg-card/50 p-3 space-y-3 overflow-y-auto">


          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {diagramType === "macroprocesos" ? "PALETA DE MACROPROCESOS" : diagramType === "procesos" ? "PALETA DE PROCESOS" : diagramType === "workflows" ? "ACCIONES EJECUTABLES" : t("modeler.palette")}
            </h3>
            
          </div>

          {renderPalette()}


          <div className="pt-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("modeler.openExisting")}
            </h3>
            <ul className="mt-2 space-y-1">
              {(diagramsList.data ?? []).filter((d) => d.diagram_type === diagramType || (diagramType === "procesos" && d.diagram_type === "subprocesos")).length === 0 && (
                <li className="text-[11px] text-muted-foreground">{t("modeler.noneYet")}</li>
              )}
              {(diagramsList.data ?? [])
                .filter((d) => d.diagram_type === diagramType || (diagramType === "procesos" && d.diagram_type === "subprocesos"))
                .slice()
                .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true }))
                .map((d) => (
                  <li key={d.id} className={`group flex items-center justify-between rounded hover:bg-muted ${d.id === diagramId ? "bg-primary/10 font-semibold" : ""}`}>
                    <button
                      type="button"
                      onClick={() =>
                        navigate({
                          to: "/modeler",
                          search: (prev: SearchT) => ({ ...prev, level: d.level as LevelKey, id: d.node_id, type: d.diagram_type as DiagramType }),
                        })
                      }
                      className="block flex-1 truncate px-2 py-1 text-left text-xs"
                      title={d.name}
                    >
                      {d.diagram_type === "subprocesos" ? (
                        <span className="mr-1 rounded bg-purple-100 px-1 py-0.5 text-[10px] font-medium text-purple-700 dark:bg-purple-950 dark:text-purple-300">Subproceso</span>
                      ) : d.diagram_type === "procesos" ? (
                        <span className="mr-1 rounded bg-blue-100 px-1 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-300">Proceso</span>
                      ) : null}
                      {d.name}{(d as { version?: number }).version != null ? ` (v${(d as { version?: number }).version})` : ""}
                    </button>

                    {d.diagram_type !== "datos" && (
                      <>
                        <button
                          onClick={async (e) => {
                            e.preventDefault();
                            const isProcessFamily = d.diagram_type === "procesos" || d.diagram_type === "subprocesos";
                            if (isProcessFamily) {
                              setClassDialogChoice(d.diagram_type === "subprocesos" ? "subproceso" : "proceso");
                              setClassDialogMode("duplicate");
                              setPendingDuplicate({ id: d.id });
                              setClassDialogOpen(true);
                            } else {
                              await doDuplicate(d.id);
                            }
                          }}

                          className="rounded p-0.5 text-muted-foreground opacity-0 hover:text-primary group-hover:opacity-100"
                          title="Duplicar diagrama"
                        >
                          <Copy className="h-3 w-3" />
                        </button>
                        <button
                          onClick={async (e) => {
                            e.preventDefault();
                            if (!confirm(`¿Eliminar el diagrama "${d.name}"?`)) return;
                            const { error } = await supabase.from("process_diagrams").delete().eq("id", d.id);
                            if (error) return toast.error(/publicado en el motor/.test(error.message) ? error.message : `No se puede eliminar: ${error.message}`);
                            toast.success("Diagrama eliminado");
                            qc.invalidateQueries({ queryKey: ["diagrams-list"] });
                            if (diagramId === d.id) {
                              setDiagramId(null);
                              setNodes([]);
                              setEdges([]);
                              setName("");
                              setLoadedName(null);
                            }
                          }}
                          className="mr-1 rounded p-0.5 text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100"
                          title="Eliminar diagrama"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </>
                    )}
                  </li>
                ))}
            </ul>
          </div>
        </aside>
        )}
        {!viewMode && (
          <div
            role="separator"
            aria-orientation="vertical"
            title="Arrastrar para redimensionar"
            onMouseDown={(e) => {
              e.preventDefault();
              const startX = e.clientX;
              const startW = paletteWidth;
              const onMove = (ev: MouseEvent) => {
                const next = Math.min(560, Math.max(160, startW + (ev.clientX - startX)));
                setPaletteWidth(next);
              };
              const onUp = () => {
                window.removeEventListener("mousemove", onMove);
                window.removeEventListener("mouseup", onUp);
                document.body.style.cursor = "";
                document.body.style.userSelect = "";
              };
              document.body.style.cursor = "col-resize";
              document.body.style.userSelect = "none";
              window.addEventListener("mousemove", onMove);
              window.addEventListener("mouseup", onUp);
            }}
            className="w-1 shrink-0 cursor-col-resize bg-border hover:bg-primary/50 transition-colors"
          />
        )}




        <div ref={wrapperRef} className="relative flex-1" onDrop={(viewMode || hasExpandedSubprocess) ? undefined : onDrop} onDragOver={(viewMode || hasExpandedSubprocess) ? undefined : onDragOver}>
          <DataDiagramContext.Provider value={dataDiagramCtxValue}>
          {diagramType === "datos" && <ErEdgeMarkers />}
          {diagramType === "datos" && (dataColumnsQ.isFetching || dataTablesQ.isFetching) && (
            <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-background/70 backdrop-blur-sm">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="text-sm font-medium text-muted-foreground">Reconstruyendo tablas y relaciones…</span>
            </div>
          )}
          <ReactFlow
            nodes={failingNodeIds.size > 0
              ? nodes.map((n) => failingNodeIds.has(n.id)
                ? { ...n, className: `${n.className ?? ""} modeler-node-failing`.trim() }
                : n)
              : nodes}
            edges={combinedEdges}
            onNodesChange={(viewMode || hasExpandedSubprocess) ? undefined : handleNodesChange}
            onEdgesChange={(viewMode || hasExpandedSubprocess) ? undefined : handleEdgesChange}
            onConnect={(viewMode || hasExpandedSubprocess) ? undefined : onConnect}
            onNodeDragStop={(viewMode || hasExpandedSubprocess) ? undefined : (e, n) => { onNodeDragStop(e, n); if (diagramType === "datos") bumpEdges(); }}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            fitView
            deleteKeyCode={null}
            nodesDraggable={!(viewMode || hasExpandedSubprocess)}
            nodesConnectable={!(viewMode || hasExpandedSubprocess)}
            elementsSelectable={!(viewMode || hasExpandedSubprocess)}
            onNodeDoubleClick={(_, node) => {
              if ((node.data as { kind?: string })?.kind === "macro.macroproceso") {
                setLinkProcessForNodeId(node.id);
              } else {
                setPropertiesOpenId(node.id);
              }
            }}
            onEdgeClick={(_, edge) => setSelectedEdgeId(edge.id)}
            onEdgeDoubleClick={(_, edge) => setEdgePropsOpenId(edge.id)}
            onPaneClick={() => {
              setPropertiesOpenId(null);
              setEdgePropsOpenId(null);
              setSelectedEdgeId(null);
              if (diagramType === "datos") bumpEdges();
            }}
            onInit={(inst) => { rfInstanceRef.current = inst; }}
            defaultEdgeOptions={
              isMacro
                ? { markerEnd: { type: MarkerType.Arrow, width: 40, height: 40, color: "#334155" }, style: { strokeWidth: 5, stroke: "#334155" } }
                : { markerEnd: { type: MarkerType.ArrowClosed, color: "#0ea5e9" }, style: { strokeWidth: 2, stroke: "#0ea5e9" } }
            }
          >
            <Background gap={16} />
            <Controls />
            <MiniMap pannable zoomable />
            {diagramType === "datos" && (
              <FkHandleRefresher
                tick={edgeRefreshTick}
                nodeIds={nodes.filter((n) => n.type === "dataEntity").map((n) => n.id)}
              />
            )}
          </ReactFlow>
          </DataDiagramContext.Provider>

          {!viewMode && diagramType === "datos" && (
            <div className="pointer-events-none absolute bottom-3 left-3 z-10 rounded-md border bg-card/80 px-2 py-1.5 text-[10px] shadow-sm backdrop-blur">
              <div className="mb-1 font-semibold uppercase tracking-wider text-muted-foreground">Handles de columna</div>
              <div className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "#16a34a", border: "1.5px solid #14532d" }} />
                <span>Entrada (FK destino) — izquierda</span>
              </div>
              <div className="mt-0.5 flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "#ea580c", border: "1.5px solid #7c2d12" }} />
                <span>Salida (FK origen) — derecha</span>
              </div>
            </div>
          )}


          {viewMode && noSelection && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-background/60">
              <div className="pointer-events-auto rounded-lg border bg-card px-6 py-5 text-center shadow-lg">
                <p className="text-sm font-medium">Selecciona una instancia para visualizar su estado</p>
                <p className="mt-1 text-xs text-muted-foreground">Usa el selector de la parte superior derecha.</p>
              </div>
            </div>
          )}



          {!viewMode && selectedNode && propertiesOpenId === selectedNode.id && (
            <div className="absolute right-3 top-3 bottom-3 z-10 flex w-80 flex-col overflow-hidden rounded-lg border bg-card shadow-lg">
              <div className="flex items-center justify-between border-b px-3 py-2">
                <span className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Propiedades del nodo</span>
                <div className="flex items-center gap-1">
                  {diagramType !== "datos" && (
                    <button
                      type="button"
                      onClick={() => {
                        const label = (selectedNode.data as { label?: string }).label ?? "este elemento";
                        if (!confirm(`¿Eliminar "${label}" del diagrama?`)) return;
                        setPropertiesOpenId(null);
                        deleteSelection();
                      }}
                      className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      title="Eliminar del diagrama"
                      aria-label="Eliminar del diagrama"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setPropertiesOpenId(null)}
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    title="Cerrar"
                    aria-label="Cerrar"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="flex-1 space-y-3 overflow-y-auto p-3 text-sm">
                <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">Nombre</label>
                {selectedNode.type === "dataEntity" ? (
                  <div className="rounded border bg-muted/30 px-2 py-1.5 text-[11px] text-muted-foreground">
                    El nombre y los campos de la tabla se editan desde <span className="font-medium text-foreground">Campos_Tablas</span>.
                  </div>
                ) : (
                  <NodeNameField
                    selectedNode={selectedNode}
                    nodes={nodes}
                    onChange={(patch) => updateSelectedNodeData(patch)}
                  />
                )}

                {diagramType !== "datos" && (
                  <>
                    {(() => {
                      const scope = varsScope;

                      const nodeKind = (selectedNode.data as { kind?: string }).kind ?? "";
                      if (nodeKind === "gateway") {
                        const rules = ((selectedNode.data as { rules?: GatewayRule[] }).rules ?? []) as GatewayRule[];
                        const inputs = ((selectedNode.data as { inputs?: string[] }).inputs ?? []) as string[];
                        const outputsTrue = ((selectedNode.data as { outputsTrue?: string[] }).outputsTrue ?? []) as string[];
                        const outputsFalse = ((selectedNode.data as { outputsFalse?: string[] }).outputsFalse ?? []) as string[];
                        const gwInputMeta = ((selectedNode.data as { inputMeta?: Record<string, { required?: boolean; defaultValue?: unknown }> }).inputMeta ?? {});
                        return (
                          <>
                            <TaskIOEditor
                              inputs={inputs}
                              outputs={[]}
                              setInputs={(v) => updateSelectedNodeData({ inputs: v })}
                              setOutputs={() => {}}
                              scope={scope}
                              hideOutputs
                              inputMeta={gwInputMeta}
                              setInputMeta={(m) => updateSelectedNodeData({ inputMeta: m })}
                            />
                            <div className="rounded-md border bg-muted/30 p-2 space-y-2">
                              <GatewayRulesEditor
                                rules={rules}
                                setRules={(next) => updateSelectedNodeData({ rules: next })}
                                scope={scope}
                              />
                              <p className="text-[9px] text-muted-foreground leading-tight">
                                Marca las salidas como <span className="font-semibold text-emerald-600">Verdadero</span> (derecha) o <span className="font-semibold text-rose-600">Falso</span> (izquierda).
                              </p>
                            </div>
                            <TaskIOEditor
                              inputs={[]}
                              outputs={outputsTrue}
                              setInputs={() => {}}
                              setOutputs={(v) => updateSelectedNodeData({ outputsTrue: v })}
                              scope={scope}
                              hideInputs
                              title="Variables de salida · Verdadero"
                              outputsTitle="Salidas (Verdadero)"
                              outputsSubtitle="si la condición se cumple"
                              outputsColorClass="border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
                            />
                            <TaskIOEditor
                              inputs={[]}
                              outputs={outputsFalse}
                              setInputs={() => {}}
                              setOutputs={(v) => updateSelectedNodeData({ outputsFalse: v })}
                              scope={scope}
                              hideInputs
                              title="Variables de salida · Falso"
                              outputsTitle="Salidas (Falso)"
                              outputsSubtitle="si la condición no se cumple"
                              outputsColorClass="border-rose-300 bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-200"
                            />
                          </>
                        );
                      }
                      if (nodeKind === "task" || nodeKind === "start" || nodeKind === "intermediate" || nodeKind === "end") {
                        const inputs = ((selectedNode.data as { inputs?: string[] }).inputs ?? []) as string[];
                        const outputs = ((selectedNode.data as { outputs?: string[] }).outputs ?? []) as string[];
                        const inputMeta = ((selectedNode.data as { inputMeta?: Record<string, { required?: boolean; defaultValue?: unknown }> }).inputMeta ?? {});
                        return (
                          <TaskIOEditor
                            inputs={inputs} outputs={outputs}
                            setInputs={(v) => updateSelectedNodeData({ inputs: v })}
                            setOutputs={(v) => updateSelectedNodeData({ outputs: v })}
                            inputMeta={inputMeta}
                            setInputMeta={(m) => updateSelectedNodeData({ inputMeta: m })}
                            scope={scope}
                          />
                        );
                      }
                      return null;
                    })()}
                    {(() => {
                      const nodeKind = (selectedNode.data as { kind?: string }).kind ?? "";
                      const isMacro = nodeKind.startsWith("macro.");
                      if (!["task", "start", "intermediate", "end", "gateway", "subprocess", "subContainer", "phase", "pool", "lane"].includes(nodeKind) && !isMacro) return null;
                      const description = (selectedNode.data as { description?: string }).description ?? "";
                      return (
                        <div className="space-y-1">
                          <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">Descripción</label>
                          <textarea
                            value={description}
                            onChange={(e) => updateSelectedNodeData({ description: e.target.value })}
                            className="min-h-[70px] w-full resize-y rounded-md border bg-background px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-primary"
                            maxLength={2000}
                            placeholder="Describe qué hace este elemento…"
                          />
                        </div>
                      );
                    })()}

                    {(() => {
                      const nodeKind = (selectedNode.data as { kind?: string }).kind ?? "";
                      if (nodeKind === "lane" || nodeKind === "pool" || nodeKind === "subContainer" || nodeKind === "phase" || nodeKind.startsWith("macro.")) return null;

                      const tax = taxonomyQuery.data;
                      const kindRow = tax?.kinds.find((k) => k.code === nodeKind);
                      const typeOptions = tax?.types.filter((t) => t.kind_id === kindRow?.id) ?? [];
                      const currentTypeId = (selectedNode.data as { typeId?: string }).typeId ?? "";
                      const subOptions = tax?.subtypes.filter((s) => s.type_id === currentTypeId) ?? [];
                       const requiresTypeSubtype = ["start", "end", "intermediate", "task"].includes(nodeKind);
                       const reqMark = requiresTypeSubtype ? <span className="text-destructive"> *</span> : null;
                       const typeInvalid = requiresTypeSubtype && !currentTypeId;
                       const subInvalid = requiresTypeSubtype && !((selectedNode.data as { subtypeId?: string }).subtypeId);
                       return (
                         <>
                           {nodeKind !== "subprocess" && (
                             <div className="grid grid-cols-2 gap-2">
                               <div>
                                 <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">Tipo{reqMark}</label>
                                 <select
                                   value={currentTypeId}
                                   onChange={(e) => updateSelectedNodeData({ typeId: e.target.value || null, subtypeId: null })}
                                   className={`h-9 w-full rounded-md border bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-primary ${typeInvalid ? "border-destructive" : ""}`}
                                 >
                                   <option value="">—</option>
                                   {typeOptions.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                                 </select>
                               </div>
                               <div>
                                 <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">Subtipo{reqMark}</label>
                                 <select
                                   value={(selectedNode.data as { subtypeId?: string }).subtypeId ?? ""}
                                   onChange={(e) => updateSelectedNodeData({ subtypeId: e.target.value || null })}
                                   disabled={!currentTypeId}
                                   className={`h-9 w-full rounded-md border bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 ${subInvalid ? "border-destructive" : ""}`}
                                 >
                                   <option value="">—</option>
                                   {subOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                                 </select>
                               </div>
                             </div>
                           )}


                          {nodeKind !== "subprocess" && (
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">Costo estimado</label>
                                <Input
                                  type="number"
                                  value={(selectedNode.data as { estimatedCost?: number | string }).estimatedCost ?? ""}
                                  onChange={(e) => updateSelectedNodeData({ estimatedCost: e.target.value === "" ? null : Number(e.target.value) })}
                                  className="h-9 text-sm"
                                  placeholder="0"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">Tiempo (min)</label>
                                <Input
                                  type="number"
                                  value={(selectedNode.data as { estimatedTime?: number | string }).estimatedTime ?? ""}
                                  onChange={(e) => updateSelectedNodeData({ estimatedTime: e.target.value === "" ? null : Number(e.target.value) })}
                                  className="h-9 text-sm"
                                  placeholder="0"
                                />
                              </div>
                            </div>
                          )}
                          {nodeKind !== "subprocess" && (
                            <>
                              <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">Recursos</label>
                              <textarea
                                value={(selectedNode.data as { resources?: string }).resources ?? ""}
                                onChange={(e) => updateSelectedNodeData({ resources: e.target.value })}
                                className="min-h-[60px] w-full resize-y rounded-md border bg-background px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-primary"
                                maxLength={1000}
                                placeholder="Entradas, Recursos (documentos, herramientas, materiales, personas, etc.), Métodos, Salidas..."
                              />
                              <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">Objeto WF</label>
                              <Input
                                value={(selectedNode.data as { wfObject?: string }).wfObject ?? ""}
                                onChange={(e) => updateSelectedNodeData({ wfObject: e.target.value })}
                                className="h-9 text-sm"
                                maxLength={200}
                                placeholder="Nodo n8n o Make que lo ejecuta…"
                              />
                            </>
                          )}
                          {nodeKind === "subprocess" && (
                            <div className="rounded-md border bg-muted/30 p-2 space-y-2">
                              <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">SUBPROCESO VINCULADO</label>
                              <select
                                value={(selectedNode.data as { subprocessDiagramId?: string }).subprocessDiagramId ?? ""}
                                onChange={(e) => {
                                  const id = e.target.value || null;
                                  const name = subprocessDiagrams.data?.find((d) => d.id === id)?.name ?? "";
                                  updateSelectedNodeData({ subprocessDiagramId: id, subprocessDiagramName: name || null });
                                }}
                                className="h-9 w-full rounded-md border bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-primary"
                              >
                                <option value="">— Selecciona un proceso —</option>
                                {(subprocessDiagrams.data ?? []).map((d) => (
                                  <option key={d.id} value={d.id}>{d.name}</option>
                                ))}
                              </select>
                              {(selectedNode.data as { subprocessDiagramId?: string }).subprocessDiagramId && (
                                <div className="flex items-center justify-between">
                                  <span className="text-xs text-muted-foreground">
                                    {(selectedNode.data as { expanded?: boolean }).expanded ? "Vista expandida" : "Vista colapsada"}
                                  </span>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-sm"
                                    onClick={() => window.dispatchEvent(new CustomEvent("modeler-node-update", { detail: { id: selectedNode.id, patch: { expanded: !(selectedNode.data as { expanded?: boolean }).expanded } } }))}
                                  >
                                    {(selectedNode.data as { expanded?: boolean }).expanded ? "Colapsar" : "Expandir"}
                                  </Button>
                                </div>
                              )}
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </>
                )}


              </div>
            </div>
          )}

          {!viewMode && !selectedNode && selectedEdge && edgePropsOpenId === selectedEdge.id && (
            <div className="absolute right-3 top-3 z-10 w-72 rounded-lg border bg-card shadow-lg">
              <div className="flex items-center justify-between border-b px-3 py-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Propiedades de la línea</span>
                <div className="flex items-center gap-1">
                  {diagramType !== "datos" && (
                    <button
                      type="button"
                      onClick={() => {
                        const label = (selectedEdge.data as { label?: string } | undefined)?.label || "esta línea";
                        if (!confirm(`¿Eliminar "${label}" del diagrama?`)) return;
                        setEdgePropsOpenId(null);
                        deleteSelection();
                      }}
                      className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      title="Eliminar del diagrama"
                      aria-label="Eliminar del diagrama"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setEdgePropsOpenId(null)}
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    title="Cerrar"
                    aria-label="Cerrar"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <div className="space-y-2 p-3">
                <label className="block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Nombre</label>
                <Input
                  value={(selectedEdge.data as { label?: string } | undefined)?.label ?? ""}
                  onChange={(e) => updateSelectedEdgeData({ label: e.target.value })}
                  className="h-8"
                  maxLength={200}
                />
                <label className="block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Objeto WF</label>
                <Input
                  value={(selectedEdge.data as { wfObject?: string } | undefined)?.wfObject ?? ""}
                  onChange={(e) => updateSelectedEdgeData({ wfObject: e.target.value })}
                  className="h-8"
                  maxLength={200}
                  placeholder="Nodo n8n o Make que lo ejecuta…"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {(() => {
        const linkNode = nodes.find((n) => n.id === linkProcessForNodeId);
        const procesos = (diagramsList.data ?? []).filter((d) => d.diagram_type === "procesos");
        const currentLinkedId = (linkNode?.data as { linkedProcessDiagramId?: string } | undefined)?.linkedProcessDiagramId ?? "";
        const goToProcess = (d: { level: string; node_id: string; diagram_type: string }) => {
          navigate({
            to: "/modeler",
            search: (prev: SearchT) => ({ ...prev, level: d.level as LevelKey, id: d.node_id, type: d.diagram_type as DiagramType }),
          });
        };
        return (
          <Dialog open={!!linkProcessForNodeId} onOpenChange={(o) => !o && setLinkProcessForNodeId(null)}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Vincular diagrama de proceso</DialogTitle>
              </DialogHeader>
              {procesos.length === 0 ? (
                <p className="text-sm text-muted-foreground">No hay diagramas de procesos disponibles.</p>
              ) : (
                <ul className="max-h-80 overflow-auto divide-y rounded border">
                  {procesos.map((d) => {
                    const isSel = d.id === currentLinkedId;
                    return (
                      <li key={d.id} className={`flex items-center justify-between gap-2 px-3 py-2 ${isSel ? "bg-primary/10" : ""}`}>
                        <button
                          type="button"
                          onClick={() => {
                            if (!linkNode) return;
                            window.dispatchEvent(new CustomEvent("modeler-node-update", { detail: { id: linkNode.id, patch: {
                              linkedProcessDiagramId: d.id,
                              linkedProcessDiagramName: d.name,
                              linkedProcessLevel: d.level,
                              linkedProcessNodeId: d.node_id,
                            } } }));
                            toast.success(`Vinculado a "${d.name}"`);
                          }}
                          className="flex-1 text-left text-sm truncate"
                          title={d.name}
                        >
                          {d.name}
                        </button>
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { goToProcess(d); setLinkProcessForNodeId(null); }}>
                          Ir →
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              )}
              <DialogFooter className="flex items-center justify-between gap-2 sm:justify-between">
                {currentLinkedId && linkNode && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      window.dispatchEvent(new CustomEvent("modeler-node-update", { detail: { id: linkNode.id, patch: {
                        linkedProcessDiagramId: null,
                        linkedProcessDiagramName: null,
                        linkedProcessLevel: null,
                        linkedProcessNodeId: null,
                      } } }));
                    }}
                  >
                    Desvincular
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={() => setLinkProcessForNodeId(null)}>Cerrar</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        );
      })()}
      {variablesOpen && varsScope && (
        <ProcessVariablesDialog
          open={variablesOpen}
          onOpenChange={setVariablesOpen}
          scope={varsScope}
        />
      )}
      {importDialogOpen && varsScope && (
        <ImportVariablesDialog
          open={importDialogOpen}
          onOpenChange={setImportDialogOpen}
          scope={varsScope}
        />
      )}
      {fieldsOpen && diagramId && diagramType === "datos" && currentClientId && (
        <EntityFieldsDialog
          open={fieldsOpen}
          onOpenChange={setFieldsOpen}
          diagramId={diagramId}
          clientId={currentClientId}
          environment={environment}
        />
      )}


      <Dialog open={validateOpen} onOpenChange={setValidateOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-emerald-600" /> Comprobar proceso
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">Selecciona las comprobaciones que quieres ejecutar:</div>
            <div className="grid gap-2 max-h-64 overflow-auto rounded-md border p-3">
              {ALL_CHECKS.map((c) => (
                <label key={c.id} className="flex items-start gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={validateChecks.has(c.id)}
                    onCheckedChange={(v) => {
                      setValidateChecks((prev) => {
                        const next = new Set(prev);
                        if (v) next.add(c.id); else next.delete(c.id);
                        return next;
                      });
                    }}
                  />
                  <span>{c.label}</span>
                </label>
              ))}
              <div className="flex gap-2 pt-1">
                <Button size="sm" variant="ghost" onClick={() => setValidateChecks(new Set(ALL_CHECKS.map((c) => c.id)))}>Seleccionar todo</Button>
                <Button size="sm" variant="ghost" onClick={() => setValidateChecks(new Set())}>Ninguno</Button>
              </div>
            </div>
            <div className="rounded-md border p-3 space-y-2">
              <div className="text-sm font-medium">¿Dónde mostrar el resultado?</div>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox checked={validateShowOnDiagram} onCheckedChange={(v) => setValidateShowOnDiagram(!!v)} />
                <span>Resaltar nodos sobre el diagrama</span>
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox checked={validateShowOnPanel} onCheckedChange={(v) => setValidateShowOnPanel(!!v)} />
                <span>Ver el listado de comprobaciones aquí</span>
              </label>
              <div className="text-xs text-muted-foreground">Los nodos de tipo subproceso también comprueban su proceso vinculado (de forma recursiva).</div>
            </div>
            {validateResults && validateShowOnPanel && (
              <div className="space-y-3 max-h-72 overflow-auto rounded-md border p-3 bg-muted/30">
                {Array.from(new Set(validateResults.map((r) => r.scope))).map((scope) => (
                  <div key={scope} className="space-y-1">
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{scope}</div>
                    {validateResults.filter((r) => r.scope === scope).map((r, idx) => (
                      <div key={`${scope}-${r.id}-${idx}`} className="text-sm">
                        <div className="flex items-center gap-2 font-medium">
                          {r.ok ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <XCircle className="h-4 w-4 text-rose-600" />}
                          <span>{r.label}</span>
                        </div>
                        {!r.ok && r.details.length > 0 && (
                          <ul className="ml-6 list-disc text-xs text-muted-foreground">
                            {r.details.slice(0, 10).map((d, i) => <li key={i}>{d}</li>)}
                            {r.details.length > 10 && <li>… y {r.details.length - 10} más</li>}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
                {(() => {
                  const ok = validateResults.filter((r) => r.ok).length;
                  const total = validateResults.length;
                  const allOk = ok === total;
                  return (
                    <div className={`mt-2 flex items-center gap-2 rounded-md p-2 text-sm ${allOk ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200"}`}>
                      {allOk ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                      <span>{allOk ? "El proceso (y sus subprocesos) supera todas las comprobaciones" : `${ok} de ${total} comprobaciones superadas`}</span>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setValidateOpen(false)}>Cerrar</Button>
            {failingNodeIds.size > 0 && (
              <Button variant="ghost" onClick={() => { setFailingNodeIds(new Set()); setValidateResults(null); }}>
                Limpiar resaltado
              </Button>
            )}
            <Button
              disabled={validateChecks.size === 0 || validateRunning || (!validateShowOnDiagram && !validateShowOnPanel)}
              onClick={async () => {
                setValidateRunning(true);
                try {
                  type Result = { id: CheckId; label: string; ok: boolean; details: string[]; failingIds: string[]; scope: string };
                  const runChecks = (nodeList: Node[], edgeList: Edge[], scope: string): Result[] => {
                    const getKind = (n: Node) => (n.data as { kind?: string } | undefined)?.kind ?? "";
                    const getLabel = (n: Node) => ((n.data as { label?: string; name?: string } | undefined)?.label || (n.data as { name?: string } | undefined)?.name || `#${n.id.slice(0, 6)}`);
                    const isFlowNode = (n: Node) => {
                      const k = getKind(n);
                      return k !== "lane" && k !== "subContainer" && k !== "" && !k.startsWith("macro.");
                    };
                    const flowNodes = nodeList.filter(isFlowNode);
                    const adj = new Map<string, string[]>();
                    edgeList.forEach((e) => {
                      if (!e.source || !e.target) return;
                      adj.set(e.source, [...(adj.get(e.source) ?? []), e.target]);
                    });
                    const startIds = flowNodes.filter((n) => getKind(n) === "start").map((n) => n.id);
                    const endIds = flowNodes.filter((n) => getKind(n) === "end").map((n) => n.id);
                    const out: Result[] = [];
                    const push = (id: CheckId, ok: boolean, details: string[] = [], failingIds: string[] = []) => {
                      const label = ALL_CHECKS.find((c) => c.id === id)!.label;
                      out.push({ id, label, ok, details, failingIds, scope });
                    };
                    if (validateChecks.has("start")) push("start", startIds.length > 0, startIds.length === 0 ? ["No se encontró ningún nodo de Inicio"] : []);
                    if (validateChecks.has("end")) push("end", endIds.length > 0, endIds.length === 0 ? ["No se encontró ningún nodo de Fin"] : []);
                    if (validateChecks.has("names")) {
                      const bad = flowNodes.filter((n) => {
                        const k = getKind(n);
                        if (k === "start" || k === "end") return false;
                        const lbl = (n.data as { label?: string; name?: string } | undefined);
                        return !((lbl?.label || lbl?.name || "").trim());
                      });
                      push("names", bad.length === 0, bad.map((n) => `${getKind(n)} sin nombre (#${n.id.slice(0, 6)})`), bad.map((n) => n.id));
                    }
                    if (validateChecks.has("gateways")) {
                      const bad = flowNodes.filter((n) => {
                        if (getKind(n) !== "gateway") return false;
                        const outs = adj.get(n.id)?.length ?? 0;
                        return outs < 2;
                      });
                      push("gateways", bad.length === 0, bad.map((n) => `${getLabel(n)}: necesita 2 salidas`), bad.map((n) => n.id));
                    }
                    if (validateChecks.has("subprocess")) {
                      const bad = flowNodes.filter((n) => {
                        if (getKind(n) !== "subprocess") return false;
                        const d = n.data as { subprocessDiagramId?: string } | undefined;
                        return !d?.subprocessDiagramId;
                      });
                      push("subprocess", bad.length === 0, bad.map((n) => `${getLabel(n)} no tiene proceso vinculado`), bad.map((n) => n.id));
                    }
                    if (validateChecks.has("duplicates")) {
                      const counts = new Map<string, number>();
                      const byLabel = new Map<string, string[]>();
                      flowNodes.forEach((n) => {
                        const lbl = ((n.data as { label?: string; name?: string } | undefined)?.label || "").trim();
                        if (!lbl) return;
                        counts.set(lbl, (counts.get(lbl) ?? 0) + 1);
                        byLabel.set(lbl, [...(byLabel.get(lbl) ?? []), n.id]);
                      });
                      const dups = [...counts.entries()].filter(([, c]) => c > 1);
                      const dupIds = dups.flatMap(([l]) => byLabel.get(l) ?? []);
                      push("duplicates", dups.length === 0, dups.map(([l, c]) => `"${l}" aparece ${c} veces`), dupIds);
                    }
                    return out;
                  };

                  const allResults: Result[] = [];
                  // Track which top-level subprocess nodes have failures inside their linked diagrams
                  const subprocessFailMap = new Map<string, string[]>();
                  allResults.push(...runChecks(nodes, edges, "Principal"));

                  // Recurse into linked subprocess diagrams (one level + chained)
                  const visited = new Set<string>();
                  type Queued = { diagramId: string; pathLabel: string; rootSubNodeId: string };
                  const queue: Queued[] = [];
                  nodes.forEach((n) => {
                    const d = n.data as { kind?: string; subprocessDiagramId?: string; subprocessDiagramName?: string; label?: string } | undefined;
                    if (d?.kind === "subprocess" && d?.subprocessDiagramId) {
                      queue.push({
                        diagramId: d.subprocessDiagramId,
                        pathLabel: `Subproceso · ${d.subprocessDiagramName || d.label || n.id.slice(0, 6)}`,
                        rootSubNodeId: n.id,
                      });
                    }
                  });
                  while (queue.length) {
                    const cur = queue.shift()!;
                    if (visited.has(cur.diagramId)) continue;
                    visited.add(cur.diagramId);
                    const { data: sub, error } = await supabase
                      .from("process_diagrams")
                      .select("name,nodes,edges")
                      .eq("id", cur.diagramId)
                      .maybeSingle();
                    if (error || !sub) continue;
                    const subNodes = (sub.nodes as unknown as Node[]) ?? [];
                    const subEdges = (sub.edges as unknown as Edge[]) ?? [];
                    const subResults = runChecks(subNodes, subEdges, cur.pathLabel);
                    allResults.push(...subResults);
                    const failedHere = subResults.some((r) => !r.ok);
                    if (failedHere) {
                      subprocessFailMap.set(cur.rootSubNodeId, [...(subprocessFailMap.get(cur.rootSubNodeId) ?? []), cur.pathLabel]);
                    }
                    // Chain deeper
                    subNodes.forEach((n) => {
                      const d = n.data as { kind?: string; subprocessDiagramId?: string; subprocessDiagramName?: string; label?: string } | undefined;
                      if (d?.kind === "subprocess" && d?.subprocessDiagramId) {
                        queue.push({
                          diagramId: d.subprocessDiagramId,
                          pathLabel: `${cur.pathLabel} › ${d.subprocessDiagramName || d.label || n.id.slice(0, 6)}`,
                          rootSubNodeId: cur.rootSubNodeId,
                        });
                      }
                    });
                  }

                  setValidateResults(validateShowOnPanel ? allResults : null);
                  if (validateShowOnDiagram) {
                    const allFailing = new Set<string>();
                    allResults.forEach((r) => {
                      if (r.scope === "Principal") r.failingIds.forEach((id) => allFailing.add(id));
                    });
                    // Also highlight top-level subprocess nodes whose inner diagram failed
                    subprocessFailMap.forEach((_v, id) => allFailing.add(id));
                    setFailingNodeIds(allFailing);
                  } else {
                    setFailingNodeIds(new Set());
                  }
                  const failed = allResults.filter((r) => !r.ok).length;
                  if (failed === 0) toast.success("El proceso supera todas las comprobaciones");
                  else toast.warning(`${failed} comprobación(es) no superada(s)`);
                } finally {
                  setValidateRunning(false);
                }
              }}
            >
              <ShieldCheck className="mr-2 h-4 w-4" /> {validateRunning ? "Ejecutando…" : "Ejecutar comprobaciones"}
            </Button>

          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo: clase del diagrama (Proceso / Subproceso) */}
      <Dialog open={classDialogOpen} onOpenChange={setClassDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Clase del diagrama</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Indica si este diagrama es un <strong>Proceso</strong> o un <strong>Subproceso</strong>.
            </p>
            <div className="grid gap-2">
              <label className="flex items-center gap-2 rounded border p-2 cursor-pointer hover:bg-muted">
                <input
                  type="radio"
                  name="diagram-class"
                  checked={classDialogChoice === "proceso"}
                  onChange={() => setClassDialogChoice("proceso")}
                />
                <span className="text-sm"><strong>Proceso</strong> — puede contener nodos de tipo Subproceso.</span>
              </label>
              <label className="flex items-center gap-2 rounded border p-2 cursor-pointer hover:bg-muted">
                <input
                  type="radio"
                  name="diagram-class"
                  checked={classDialogChoice === "subproceso"}
                  onChange={() => setClassDialogChoice("subproceso")}
                />
                <span className="text-sm"><strong>Subproceso</strong> — se vincula desde nodos Subproceso de un Proceso.</span>
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClassDialogOpen(false)}>Cancelar</Button>
            <Button
              onClick={async () => {
                const chosen = classDialogChoice;
                setClassDialogOpen(false);
                if (classDialogMode === "save") {
                  setDiagramClass(chosen);
                  // Esperar al próximo tick para que save() lea el nuevo valor.
                  setTimeout(() => { void save(); }, 0);
                } else if (classDialogMode === "duplicate" && pendingDuplicate) {
                  const sourceId = pendingDuplicate.id;
                  setPendingDuplicate(null);
                  await doDuplicate(sourceId, chosen);
                }
              }}
            >
              Continuar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo: vista previa del diagrama expandido antes de publicar */}
      <Dialog open={!!publishPreview} onOpenChange={(o) => !o && !publishing && setPublishPreview(null)}>
        <DialogContent className="sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>Vista previa del diagrama a publicar</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <p className="text-sm text-muted-foreground">
              Los subprocesos se han expandido. Las variables de salida del nodo anterior se han propagado como entradas del nodo Inicio del subproceso, y las salidas del Fin del subproceso como entradas del nodo siguiente.
            </p>
            <div className="h-[60vh] w-full border rounded-md bg-background">
              {publishPreview && (
                <ReactFlowProvider>
                  <ReactFlow
                    nodes={publishPreview.nodes}
                    edges={publishPreview.edges}
                    nodeTypes={nodeTypes}
                    edgeTypes={edgeTypes}
                    fitView
                    fitViewOptions={{ padding: 0.15 }}
                    nodesDraggable
                    nodesConnectable
                    elementsSelectable
                    onNodesChange={(changes) =>
                      setPublishPreview((p) => p ? { ...p, nodes: applyNodeChanges(changes, p.nodes) } : p)
                    }
                    onEdgesChange={(changes) =>
                      setPublishPreview((p) => p ? { ...p, edges: applyEdgeChanges(changes, p.edges) } : p)
                    }
                    onConnect={(conn) =>
                      setPublishPreview((p) => p ? { ...p, edges: addEdge({ ...conn, markerEnd: { type: MarkerType.ArrowClosed } }, p.edges) } : p)
                    }
                    proOptions={{ hideAttribution: true }}
                  >
                    <Background gap={16} size={1} />
                    <Controls showInteractive={false} />
                    <MiniMap pannable zoomable />
                  </ReactFlow>
                </ReactFlowProvider>
              )}
            </div>
            <div className="text-xs text-muted-foreground">
              {publishPreview ? `${publishPreview.nodes.length} nodos · ${publishPreview.edges.length} conexiones · Arrastra los nodos, conecta puertos o pulsa Supr para borrar selección` : ""}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPublishPreview(null)} disabled={publishing}>Cancelar</Button>
            <Button onClick={confirmPublish} disabled={publishing}>
              {publishing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Rocket className="mr-2 h-4 w-4" />}
              Confirmar y publicar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>


  );
}
