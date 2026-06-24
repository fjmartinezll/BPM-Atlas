import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";

// Manually-curated initial positions for the 16 public tables (+ external auth.users).
type Box = { x: number; y: number; w: number; h: number; label: string; group: "identity" | "hierarchy" | "aux" };

const BOX_W = 170;
const BOX_H = 44;

const INITIAL_TABLES: Record<string, Box> = {
  "auth.users":         { x:  40, y:  40, w: BOX_W, h: BOX_H, label: "auth.users",         group: "identity" },
  profiles:             { x:  40, y: 120, w: BOX_W, h: BOX_H, label: "profiles",            group: "identity" },
  user_roles:           { x:  40, y: 200, w: BOX_W, h: BOX_H, label: "user_roles",          group: "identity" },

  macroprocesses:       { x: 320, y:  40, w: BOX_W, h: BOX_H, label: "macroprocesses",      group: "hierarchy" },
  processes:            { x: 320, y: 130, w: BOX_W, h: BOX_H, label: "processes",           group: "hierarchy" },
  executable_elements:  { x: 320, y: 220, w: BOX_W, h: BOX_H, label: "executable_elements", group: "hierarchy" },
  subprocesses:         { x: 320, y: 320, w: BOX_W, h: BOX_H, label: "subprocesses",        group: "hierarchy" },
  subprocess_elements:  { x: 320, y: 410, w: BOX_W, h: BOX_H, label: "subprocess_elements", group: "hierarchy" },
  executable_element_integrations: { x: 320, y: 510, w: BOX_W, h: BOX_H, label: "executable_element_integrations", group: "hierarchy" },

  entities:             { x: 600, y:  40, w: BOX_W, h: BOX_H, label: "entities",            group: "aux" },
  entity_process_links: { x: 600, y: 120, w: BOX_W, h: BOX_H, label: "entity_process_links",group: "aux" },
  process_diagrams:     { x: 600, y: 200, w: BOX_W, h: BOX_H, label: "process_diagrams",    group: "aux" },
  process_indicators:   { x: 600, y: 280, w: BOX_W, h: BOX_H, label: "process_indicators",  group: "aux" },
  process_risks:        { x: 600, y: 360, w: BOX_W, h: BOX_H, label: "process_risks",       group: "aux" },
  process_documents:    { x: 600, y: 440, w: BOX_W, h: BOX_H, label: "process_documents",   group: "aux" },
  change_log:           { x: 600, y: 520, w: BOX_W, h: BOX_H, label: "change_log",          group: "aux" },
};

type Rel = { from: string; to: string; column: string; kind: "n-1" | "1-1"; label?: string };

const RELS: Rel[] = [
  { from: "profiles",            to: "auth.users",    column: "id",              kind: "1-1" },
  { from: "user_roles",          to: "auth.users",    column: "user_id",         kind: "n-1" },

  { from: "macroprocesses",      to: "entities",      column: "entity_id",       kind: "n-1" },
  { from: "processes",           to: "macroprocesses",column: "parent_id",       kind: "n-1" },
  { from: "executable_elements", to: "processes",     column: "parent_id",       kind: "n-1" },
  { from: "subprocesses",        to: "processes",     column: "parent_id",       kind: "n-1" },
  { from: "subprocess_elements", to: "subprocesses",  column: "subprocess_id",   kind: "n-1" },
  { from: "subprocess_elements", to: "executable_elements", column: "executable_element_id", kind: "n-1" },
  { from: "executable_element_integrations", to: "executable_elements", column: "executable_element_id", kind: "n-1" },

  { from: "macroprocesses",      to: "profiles",      column: "owner_id",        kind: "n-1" },
  { from: "processes",           to: "profiles",      column: "owner_id",        kind: "n-1" },
  { from: "subprocesses",        to: "profiles",      column: "owner_id",        kind: "n-1" },

  { from: "entity_process_links",to: "entities",      column: "entity_id",       kind: "n-1" },
  { from: "entity_process_links",to: "profiles",      column: "created_by",      kind: "n-1" },

  { from: "process_indicators",  to: "profiles",      column: "created_by",      kind: "n-1" },
  { from: "process_indicators",  to: "profiles",      column: "responsible_id",  kind: "n-1" },
  { from: "process_risks",       to: "profiles",      column: "created_by",      kind: "n-1" },
  { from: "process_risks",       to: "profiles",      column: "responsible_id",  kind: "n-1" },
  { from: "process_documents",   to: "profiles",      column: "created_by",      kind: "n-1" },
];

const VIEW_W = 820;
const VIEW_H = 660;

function anchor(box: Box, side: "l" | "r" | "t" | "b") {
  if (side === "l") return { x: box.x,              y: box.y + box.h / 2 };
  if (side === "r") return { x: box.x + box.w,      y: box.y + box.h / 2 };
  if (side === "t") return { x: box.x + box.w / 2,  y: box.y };
  return                  { x: box.x + box.w / 2,  y: box.y + box.h };
}

function pickSides(a: Box, b: Box): ["l"|"r"|"t"|"b", "l"|"r"|"t"|"b"] {
  const ax = a.x + a.w / 2, ay = a.y + a.h / 2;
  const bx = b.x + b.w / 2, by = b.y + b.h / 2;
  if (Math.abs(bx - ax) >= Math.abs(by - ay)) {
    return ax < bx ? ["r", "l"] : ["l", "r"];
  }
  return ay < by ? ["b", "t"] : ["t", "b"];
}

function curve(a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = (b.x - a.x) * 0.5;
  return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
}

const GROUP_FILL: Record<Box["group"], string> = {
  identity:  "var(--muted)",
  hierarchy: "var(--primary)",
  aux:       "var(--accent)",
};

const GROUP_OPACITY: Record<Box["group"], number> = {
  identity:  1,
  hierarchy: 0.12,
  aux:       0.25,
};

type DragState =
  | { kind: "none" }
  | { kind: "pan"; startX: number; startY: number; origTx: number; origTy: number }
  | { kind: "box"; name: string; startX: number; startY: number; origX: number; origY: number };

export function DbSchemaDiagram() {
  const [hover, setHover] = useState<string | null>(null);
  const [tables, setTables] = useState<Record<string, Box>>(INITIAL_TABLES);
  const [view, setView] = useState({ tx: 0, ty: 0, scale: 1 });
  const [showProfiles, setShowProfiles] = useState(true);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<DragState>({ kind: "none" });

  const visibleTables = useMemo(() => {
    const out: Record<string, Box> = {};
    for (const [k, v] of Object.entries(tables)) {
      if (k === "profiles" && !showProfiles) continue;
      out[k] = v;
    }
    return out;
  }, [tables, showProfiles]);

  const relsLaidOut = useMemo(() => RELS.map((r, i) => {
    if (!showProfiles && (r.from === "profiles" || r.to === "profiles")) return null;
    const a = visibleTables[r.from], b = visibleTables[r.to];
    if (!a || !b) return null;
    const [sa, sb] = pickSides(a, b);
    const p1 = anchor(a, sa);
    const p2 = anchor(b, sb);
    const sameCount = RELS.filter((x, j) => j < i && ((x.from === r.from && x.to === r.to))).length;
    const offset = sameCount * 14;
    const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 - offset };
    return { rel: r, p1, p2, mid, key: `${r.from}.${r.column}->${r.to}-${i}` };
  }).filter(Boolean) as Array<{
    rel: Rel; p1: {x:number;y:number}; p2: {x:number;y:number};
    mid: {x:number;y:number}; key: string;
  }>, [visibleTables, showProfiles]);

  const isActive = (t: string) => !hover || hover === t ||
    RELS.some((r) => {
      if (!showProfiles && (r.from === "profiles" || r.to === "profiles")) return false;
      return (r.from === hover && r.to === t) || (r.to === hover && r.from === t);
    });

  // Convert client coords to SVG-world coords (pre-transform).
  function clientToWorld(clientX: number, clientY: number) {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    // viewBox units per CSS pixel
    const unitsPerPxX = VIEW_W / rect.width;
    const unitsPerPxY = VIEW_H / rect.height;
    const vbX = (clientX - rect.left) * unitsPerPxX;
    const vbY = (clientY - rect.top) * unitsPerPxY;
    // undo current view transform: world = (vb - t) / scale
    return { x: (vbX - view.tx) / view.scale, y: (vbY - view.ty) / view.scale };
  }

  function onBoxPointerDown(e: ReactPointerEvent<SVGGElement>, name: string) {
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const box = tables[name];
    dragRef.current = {
      kind: "box", name,
      startX: e.clientX, startY: e.clientY,
      origX: box.x, origY: box.y,
    };
  }

  function onSvgPointerDown(e: ReactPointerEvent<SVGSVGElement>) {
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    dragRef.current = {
      kind: "pan",
      startX: e.clientX, startY: e.clientY,
      origTx: view.tx, origTy: view.ty,
    };
  }

  function onPointerMove(e: ReactPointerEvent<SVGSVGElement>) {
    const d = dragRef.current;
    if (d.kind === "none") return;
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const unitsPerPxX = VIEW_W / rect.width;
    const unitsPerPxY = VIEW_H / rect.height;
    const dxVb = (e.clientX - d.startX) * unitsPerPxX;
    const dyVb = (e.clientY - d.startY) * unitsPerPxY;

    if (d.kind === "pan") {
      setView((v) => ({ ...v, tx: d.origTx + dxVb, ty: d.origTy + dyVb }));
    } else {
      // box drag — convert vb delta to world delta
      const dxW = dxVb / view.scale;
      const dyW = dyVb / view.scale;
      setTables((prev) => ({
        ...prev,
        [d.name]: { ...prev[d.name], x: d.origX + dxW, y: d.origY + dyW },
      }));
    }
  }

  function onPointerUp() {
    dragRef.current = { kind: "none" };
  }

  function onWheel(e: ReactWheelEvent<SVGSVGElement>) {
    e.preventDefault();
    const factor = Math.exp(-e.deltaY * 0.0015);
    const newScale = Math.min(4, Math.max(0.25, view.scale * factor));
    // zoom toward cursor: keep world point under cursor fixed
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const vbX = ((e.clientX - rect.left) / rect.width) * VIEW_W;
    const vbY = ((e.clientY - rect.top) / rect.height) * VIEW_H;
    const worldX = (vbX - view.tx) / view.scale;
    const worldY = (vbY - view.ty) / view.scale;
    const tx = vbX - worldX * newScale;
    const ty = vbY - worldY * newScale;
    setView({ tx, ty, scale: newScale });
  }

  function resetView() {
    setView({ tx: 0, ty: 0, scale: 1 });
    setTables(INITIAL_TABLES);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm" style={{ background: GROUP_FILL.identity, opacity: GROUP_OPACITY.identity }} /> Identidad</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm" style={{ background: GROUP_FILL.hierarchy, opacity: GROUP_OPACITY.hierarchy }} /> Jerarquía BPM</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm" style={{ background: GROUP_FILL.aux, opacity: GROUP_OPACITY.aux }} /> Auxiliares</span>
        <span className="flex items-center gap-1.5"><span className="font-mono">n-1</span> muchos a uno</span>
        <span className="flex items-center gap-1.5"><span className="font-mono">1-1</span> uno a uno</span>
        <label className="flex items-center gap-1.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showProfiles}
            onChange={(e) => setShowProfiles(e.target.checked)}
            className="accent-primary h-3.5 w-3.5"
          />
          Mostrar tabla <span className="font-mono">profiles</span>
        </label>
        <span className="ml-auto flex items-center gap-2">
          <span className="font-mono">{Math.round(view.scale * 100)}%</span>
          <button
            type="button"
            onClick={() => setView((v) => ({ ...v, scale: Math.min(4, v.scale * 1.2) }))}
            className="px-2 py-1 rounded border bg-background hover:bg-accent"
          >+</button>
          <button
            type="button"
            onClick={() => setView((v) => ({ ...v, scale: Math.max(0.25, v.scale / 1.2) }))}
            className="px-2 py-1 rounded border bg-background hover:bg-accent"
          >−</button>
          <button
            type="button"
            onClick={resetView}
            className="px-2 py-1 rounded border bg-background hover:bg-accent"
          >Restablecer</button>
        </span>
      </div>

      <div className="border rounded-lg bg-card overflow-hidden">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          className="w-full select-none touch-none"
          style={{ minWidth: 720, cursor: dragRef.current.kind === "pan" ? "grabbing" : "grab" }}
          onPointerDown={onSvgPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={onWheel}
        >
          <defs>
            <marker id="arrow-one" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="14" markerHeight="14" orient="auto">
              <line x1="9" y1="1" x2="9" y2="11" stroke="var(--primary)" strokeWidth="1.6" fill="none" />
            </marker>
            <marker id="arrow-many" viewBox="0 0 14 14" refX="12" refY="7" markerWidth="16" markerHeight="16" orient="auto">
              <path d="M 12 7 L 2 1 M 12 7 L 2 7 M 12 7 L 2 13" fill="none" stroke="var(--primary)" strokeWidth="1.4" />
            </marker>
          </defs>

          {/* Background capture rect so pan works even on empty area */}
          <rect x={0} y={0} width={VIEW_W} height={VIEW_H} fill="transparent" />

          <g transform={`translate(${view.tx} ${view.ty}) scale(${view.scale})`}>
            {/* Edges */}
            {relsLaidOut.map(({ rel, p1, p2, mid, key }) => {
              const active = !hover || hover === rel.from || hover === rel.to;
              return (
                <g key={key} opacity={active ? 1 : 0.15} style={{ pointerEvents: "none" }}>
                  <path
                    d={curve(p1, p2)}
                    fill="none"
                    stroke="var(--primary)"
                    strokeWidth={1.4}
                    markerStart="url(#arrow-many)"
                    markerEnd="url(#arrow-one)"
                  />
                  <g transform={`translate(${mid.x}, ${mid.y})`}>
                    <rect x={-30} y={-20} width={60} height={28} rx={4}
                          fill="var(--background)" stroke="var(--border)" />
                    <text x={0} y={-9} textAnchor="middle" fontSize={10} fontFamily="monospace"
                          fill="var(--foreground)" fontWeight={600}>
                      {rel.kind}
                    </text>
                    <text x={0} y={3} textAnchor="middle" fontSize={8}
                          fill="var(--muted-foreground)">
                      {rel.column}
                    </text>
                  </g>
                </g>
              );
            })}

            {/* Boxes */}
            {Object.entries(visibleTables).map(([name, b]) => {
              const active = isActive(name);
              return (
                <g key={name}
                   onPointerDown={(e) => onBoxPointerDown(e, name)}
                   onMouseEnter={() => setHover(name)}
                   onMouseLeave={() => setHover(null)}
                   style={{ cursor: "grab" }}
                   opacity={active ? 1 : 0.35}>
                  <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={6}
                        fill={GROUP_FILL[b.group]}
                        fillOpacity={GROUP_OPACITY[b.group]}
                        stroke={hover === name ? "var(--primary)" : "var(--border)"}
                        strokeWidth={hover === name ? 2 : 1} />
                  <text x={b.x + b.w / 2} y={b.y + b.h / 2 + 4}
                        textAnchor="middle" fontSize={12} fontFamily="ui-sans-serif, system-ui"
                        fill="var(--foreground)" fontWeight={600}
                        style={{ pointerEvents: "none" }}>
                    {b.label}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      <p className="text-xs text-muted-foreground">
        Usa la rueda del ratón para hacer zoom, arrastra el fondo para desplazar el lienzo y arrastra cualquier tabla para reorganizarla.
        La flecha simple (▶) marca el lado <span className="font-mono">1</span>; la flecha bifurcada (pata de gallo) marca el lado <span className="font-mono">n</span>.
      </p>
    </div>
  );
}
