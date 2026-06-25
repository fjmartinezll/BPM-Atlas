import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  ReactFlow, ReactFlowProvider, Background, Controls, MiniMap, MarkerType,
  type Edge, type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { STALE } from "@/lib/query-keys";

export const Route = createFileRoute("/_authenticated/node-er")({
  component: NodeErPage,
});

// Palette kinds available in the "procesos" and "subprocesos" modelers.
// Kept in sync with KIND_META in the modeler.

// All palette kinds belong to the same palette — no parent/child or flow
// relations between them. The only relation among kinds is "pertenece a la paleta".


type Kind = { id: string; code: string; name: string };
type TypeRow = { id: string; kind_id: string; name: string };
type SubtypeRow = { id: string; type_id: string; name: string };

function NodeErPage() {
  const { t } = useTranslation();
  const PALETTE_KINDS: Array<{ code: string; label: string; color: string }> = [
    { code: "start",        label: t("nodePalette.start"),       color: "#22c55e" },
    { code: "intermediate", label: t("nodePalette.intermediate"),      color: "#eab308" },
    { code: "end",          label: t("nodePalette.end"),             color: "#ef4444" },
    { code: "task",         label: t("nodePalette.task"),                  color: "#3b82f6" },
    { code: "subprocess",   label: t("nodePalette.subprocess"),             color: "#8b5cf6" },
    { code: "gateway",      label: t("nodePalette.gateway"),     color: "#f97316" },
    { code: "pool",         label: t("nodePalette.pool"),         color: "#0ea5e9" },
    { code: "lane",         label: t("nodePalette.lane"),           color: "#64748b" },
  ];
  const taxonomy = useQuery({
    queryKey: ["er-taxonomy"],
    staleTime: STALE.REFERENCE,
    queryFn: async () => {
      const [kinds, types, subtypes] = await Promise.all([
        supabase.from("node_kinds").select("id,code,name"),
        supabase.from("node_types").select("id,kind_id,name"),
        supabase.from("node_subtypes").select("id,type_id,name"),
      ]);
      for (const r of [kinds, types, subtypes]) if (r.error) throw r.error;
      return {
        kinds: (kinds.data ?? []) as Kind[],
        types: (types.data ?? []) as TypeRow[],
        subtypes: (subtypes.data ?? []) as SubtypeRow[],
      };
    },
  });

  const { nodes, edges } = useMemo(() => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];

    const COL_DIAGRAM_X = -720;
    const COL_PALETTE_X = -360;
    const COL_KIND_X = 0;
    const COL_TYPE_X = 360;
    const COL_SUB_X = 720;
    const KIND_GAP = 180;

    const kindsByCode = new Map<string, Kind | undefined>();
    (taxonomy.data?.kinds ?? []).forEach((k) => kindsByCode.set(k.code, k));

    const paletteNodeId = "palette:root";
    const paletteY = ((PALETTE_KINDS.length - 1) * KIND_GAP) / 2;

    // Diagram entities: a process diagram, and the expanded subprocess diagram
    // (resizable via corner handles). Both diagrams use the same palette.
    const processDiagramId = "diagram:process";
    const subprocessDiagramId = "diagram:subprocess";

    nodes.push({
      id: processDiagramId,
      position: { x: COL_DIAGRAM_X, y: paletteY - 120 },
      data: { label: t("nodePalette.diagramProcess") },
      type: "default",
      style: {
        background: "#1e3a8a", color: "#fff", border: "1px solid #1e3a8a",
        borderRadius: 10, fontWeight: 700, fontSize: 13, padding: 10, width: 220,
      },
    });
    nodes.push({
      id: subprocessDiagramId,
      position: { x: COL_DIAGRAM_X, y: paletteY + 120 },
      data: { label: t("nodePalette.diagramSubprocess") },
      type: "default",
      style: {
        background: "#5b21b6", color: "#fff", border: "1px solid #5b21b6",
        borderRadius: 10, fontWeight: 700, fontSize: 12, padding: 10, width: 240,
        whiteSpace: "pre-line",
      },
    });

    nodes.push({
      id: paletteNodeId,
      position: { x: COL_PALETTE_X, y: paletteY },
      data: { label: t("nodePalette.palette") },
      type: "default",
      style: {
        background: "#0f172a",
        color: "#fff",
        border: "1px solid #0f172a",
        borderRadius: 10,
        fontWeight: 700,
        fontSize: 13,
        padding: 10,
        width: 220,
      },
    });

    // Each diagram uses the palette
    edges.push({
      id: "e-procdiag-palette", source: processDiagramId, target: paletteNodeId,
      label: "usa", markerEnd: { type: MarkerType.ArrowClosed, color: "#1e3a8a" },
      style: { stroke: "#1e3a8a" },
    });
    edges.push({
      id: "e-subdiag-palette", source: subprocessDiagramId, target: paletteNodeId,
      label: "usa", markerEnd: { type: MarkerType.ArrowClosed, color: "#5b21b6" },
      style: { stroke: "#5b21b6" },
    });

    PALETTE_KINDS.forEach((pk, i) => {
      const y = i * KIND_GAP;
      const dbKind = kindsByCode.get(pk.code);
      const kindNodeId = `kind:${pk.code}`;

      edges.push({
        id: `e-palette-${pk.code}`,
        source: paletteNodeId,
        target: kindNodeId,
        label: "incluye",
        markerEnd: { type: MarkerType.ArrowClosed, color: "#0f172a" },
        style: { stroke: "#0f172a" },
      });

      // A subprocess kind can expand into a (resizable) subprocess diagram.
      if (pk.code === "subprocess") {
        edges.push({
          id: "e-subprocess-expands",
          source: kindNodeId,
          target: subprocessDiagramId,
          label: "se expande a (redimensionable)",
          markerEnd: { type: MarkerType.ArrowClosed, color: "#8b5cf6" },
          style: { stroke: "#8b5cf6", strokeDasharray: "5 3" },
        });
      }




      nodes.push({
        id: kindNodeId,
        position: { x: COL_KIND_X, y },
        data: { label: pk.label },
        type: "default",
        style: {
          background: pk.color,
          color: "#fff",
          border: "1px solid #1e293b",
          borderRadius: 8,
          fontWeight: 600,
          fontSize: 12,
          padding: 8,
          width: 200,
        },
      });

      // Types for this kind
      const typesForKind = dbKind
        ? (taxonomy.data?.types ?? []).filter((t) => t.kind_id === dbKind.id)
        : [];
      typesForKind.forEach((t, ti) => {
        const typeNodeId = `type:${t.id}`;
        nodes.push({
          id: typeNodeId,
          position: { x: COL_TYPE_X, y: y + ti * 70 - ((typesForKind.length - 1) * 70) / 2 },
          data: { label: t.name },
          type: "default",
          style: {
            background: "#ffffff",
            border: `2px solid ${pk.color}`,
            borderRadius: 6,
            fontSize: 11,
            padding: 6,
            width: 240,
          },
        });
        edges.push({
          id: `e-${kindNodeId}-${typeNodeId}`,
          source: kindNodeId,
          target: typeNodeId,
          label: "tipo",
          markerEnd: { type: MarkerType.ArrowClosed, color: pk.color },
          style: { stroke: pk.color },
        });

        const subsForType = (taxonomy.data?.subtypes ?? []).filter((s) => s.type_id === t.id);
        const baseSubY = y + ti * 70 - ((typesForKind.length - 1) * 70) / 2;
        subsForType.forEach((s, si) => {
          const subNodeId = `sub:${s.id}`;
          nodes.push({
            id: subNodeId,
            position: { x: COL_SUB_X, y: baseSubY + si * 50 - ((subsForType.length - 1) * 50) / 2 },
            data: { label: s.name },
            type: "default",
            style: {
              background: "#f8fafc",
              border: `1px dashed ${pk.color}`,
              borderRadius: 6,
              fontSize: 10,
              padding: 4,
              width: 260,
            },
          });
          edges.push({
            id: `e-${typeNodeId}-${subNodeId}`,
            source: typeNodeId,
            target: subNodeId,
            label: "subtipo",
            markerEnd: { type: MarkerType.ArrowClosed, color: pk.color },
            style: { stroke: pk.color, strokeDasharray: "3 3" },
          });
        });
      });
    });




    return { nodes, edges };
  }, [taxonomy.data]);

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      <div className="border-b bg-card px-4 py-3">
        <h1 className="text-lg font-semibold">{t("nodeEr.title")}</h1>
        <p className="text-xs text-muted-foreground">
          {t("nodeEr.subtitle")}
        </p>

      </div>
      <div className="relative flex-1">
        {taxonomy.isLoading && <div className="p-6 text-sm text-muted-foreground">{t("nodeEr.loading")}</div>}
        {taxonomy.error && <div className="p-6 text-sm text-destructive">{t("nodeEr.error")}</div>}
        {!taxonomy.isLoading && !taxonomy.error && (
          <ReactFlowProvider>
            <ReactFlow nodes={nodes} edges={edges} fitView proOptions={{ hideAttribution: true }}>
              <Background gap={16} />
              <Controls />
              <MiniMap pannable zoomable />
            </ReactFlow>
          </ReactFlowProvider>
        )}
      </div>
    </div>
  );
}
