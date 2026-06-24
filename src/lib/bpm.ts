export const LEVELS = [
  "macroprocesses",
  "processes",
  "subprocesses",
  "tasks",
  "executable_elements",
] as const;

export type LevelKey = (typeof LEVELS)[number];

export const LEVEL_TO_I18N: Record<LevelKey, { singular: string; plural: string; enc: string }> = {
  macroprocesses: { singular: "levels.macroprocess", plural: "levels.macroprocesses", enc: "enc.macroprocess" },
  processes: { singular: "levels.process", plural: "levels.processes", enc: "enc.process" },
  subprocesses: { singular: "levels.subprocess", plural: "levels.subprocesses", enc: "enc.subprocess" },
  tasks: { singular: "levels.task", plural: "levels.tasks", enc: "enc.task" },
  executable_elements: { singular: "levels.executable_element", plural: "levels.executable_elements", enc: "enc.executable_element" },
};

// Top-down hierarchy: Entidad → Macroproceso → Proceso → Subproceso → Tarea → Tarea ejecutable.
export const CHILD_OF: Record<LevelKey, LevelKey | null> = {
  macroprocesses: "processes",
  processes: "subprocesses",
  subprocesses: "tasks",
  tasks: "executable_elements",
  executable_elements: null,
};

// Levels not part of the strict parent chain (kept for compatibility).
export const QUALIFIER_LEVELS: LevelKey[] = [];

export interface BpmNode {
  id: string;
  code: string;
  name: string;
  mission: string | null;
  owner_id: string | null;
  inputs: string | null;
  outputs: string | null;
  status: "borrador" | "activo" | "revision" | "obsoleto";
  parent_id?: string | null;
}

// ---------- Process variables (typed payload) ----------

export type VarType =
  | "text" | "varchar"
  | "integer" | "bigint"
  | "numeric" | "real" | "double precision"
  | "boolean"
  | "date" | "time" | "timestamp" | "timestamptz"
  | "uuid"
  | "json" | "jsonb"
  | "entity";

export interface ProcessVariable {
  id: string;
  owner_kind: "process" | "subprocess" | null;
  owner_id: string | null;
  name: string;
  label: string;
  var_type: VarType;
  entity_id: string | null;
}

/**
 * Scope of a process-variables catalog. The catalog is shared by every
 * process / subprocess that lives under the same client + environment +
 * entity. A scope is "ready" when clientId is set; entityId may be null
 * for diagrams that aren't attached to an entity yet, in which case the
 * catalog falls back to the per-(client,env) bucket.
 */
export interface VarsScope {
  clientId: string | null;
  environment: string;
  entityId: string | null;
}

/** Per-input metadata stored on a node's `data.inputMeta[varName]`. */
export interface InputMeta {
  required?: boolean;
  defaultValue?: unknown;
}

export type RuleOperand =
  | { kind: "var"; name: string }
  | { kind: "attr"; name: string; path: string }
  | { kind: "literal"; value: string | number | boolean | null };

export type GatewayOp = "=" | "≠" | "<" | "≤" | ">" | "≥" | "contiene" | "vacío";

export interface GatewayRule {
  left?: RuleOperand;
  op?: GatewayOp | string;
  right?: RuleOperand;
  connector?: "Y" | "O";
  // Backward compat (older diagrams):
  field1?: string;
  field2?: string;
}

export function migrateGatewayRule(r: GatewayRule): GatewayRule {
  if (r.left || r.right) return r;
  return {
    ...r,
    left: r.field1 != null ? { kind: "literal", value: r.field1 } : undefined,
    right: r.field2 != null ? { kind: "literal", value: r.field2 } : undefined,
  };
}

export function describeOperand(op: RuleOperand | undefined): string {
  if (!op) return "?";
  if (op.kind === "var") return op.name || "?";
  if (op.kind === "attr") return `${op.name || "?"}.${op.path || "?"}`;
  if (op.value === null) return "∅";
  return typeof op.value === "string" ? `"${op.value}"` : String(op.value);
}

export function formatGatewayRules(rules: GatewayRule[] | undefined): string {
  if (!rules || rules.length === 0) return "";
  return rules
    .map((raw, i) => {
      const r = migrateGatewayRule(raw);
      const cond = `${describeOperand(r.left)} ${r.op || "="} ${describeOperand(r.right)}`;
      if (i === 0) return cond;
      const conn = r.connector === "O" ? "o" : "y";
      return `${conn} ${cond}`;
    })
    .join(" ");
}
