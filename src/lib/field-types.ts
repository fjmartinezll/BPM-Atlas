// Shared curated Postgres-style data types for entity field catalog and process variables.
// Validations mirror what Supabase/Postgres would accept when casting a string literal.

export const FIELD_TYPES = [
  { value: "text", label: "Texto" },
  { value: "varchar", label: "Varchar" },
  { value: "integer", label: "Entero (int4)" },
  { value: "bigint", label: "Entero grande (int8)" },
  { value: "numeric", label: "Numérico" },
  { value: "real", label: "Real (float4)" },
  { value: "double precision", label: "Doble precisión (float8)" },
  { value: "boolean", label: "Booleano" },
  { value: "date", label: "Fecha" },
  { value: "time", label: "Hora" },
  { value: "timestamp", label: "Fecha-hora" },
  { value: "timestamptz", label: "Fecha-hora con zona" },
  { value: "uuid", label: "UUID" },
  { value: "json", label: "JSON" },
  { value: "jsonb", label: "JSONB" },
] as const;

export type FieldType = (typeof FIELD_TYPES)[number]["value"];

export const FIELD_TYPE_VALUES = FIELD_TYPES.map((t) => t.value) as readonly FieldType[];

// VarType extends FieldType with "entity" reference for process variables.
export const VAR_TYPES = [
  ...FIELD_TYPES,
  { value: "entity" as const, label: "Entidad" },
];
export const VAR_TYPE_VALUES = VAR_TYPES.map((t) => t.value);
export type VarTypeNew = (typeof VAR_TYPES)[number]["value"];

const INT32_MIN = -2147483648;
const INT32_MAX = 2147483647;
const INT64_MIN = BigInt("-9223372036854775808");
const INT64_MAX = BigInt("9223372036854775807");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/;
const TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/;
const TIMESTAMPTZ_RE = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/;

export function validateValueForType(raw: string, type: FieldType | "entity"): string | null {
  const v = raw.trim();
  if (v === "") return null; // empty allowed; nullability is enforced elsewhere
  switch (type) {
    case "text":
    case "varchar":
      return null;
    case "integer": {
      if (!/^-?\d+$/.test(v)) return "Debe ser un entero";
      const n = Number(v);
      if (n < INT32_MIN || n > INT32_MAX) return "Fuera de rango int4";
      return null;
    }
    case "bigint": {
      if (!/^-?\d+$/.test(v)) return "Debe ser un entero";
      try {
        const b = BigInt(v);
        if (b < INT64_MIN || b > INT64_MAX) return "Fuera de rango int8";
      } catch {
        return "Entero inválido";
      }
      return null;
    }
    case "numeric":
    case "real":
    case "double precision": {
      if (!/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(v)) return "Debe ser numérico";
      if (!Number.isFinite(Number(v))) return "Numérico inválido";
      return null;
    }
    case "boolean": {
      if (!["true", "false", "t", "f", "1", "0", "yes", "no"].includes(v.toLowerCase())) {
        return "Debe ser booleano (true/false)";
      }
      return null;
    }
    case "date":
      if (!DATE_RE.test(v) || Number.isNaN(Date.parse(v))) return "Fecha inválida (YYYY-MM-DD)";
      return null;
    case "time":
      if (!TIME_RE.test(v)) return "Hora inválida (HH:MM[:SS])";
      return null;
    case "timestamp":
      if (!TIMESTAMP_RE.test(v) || Number.isNaN(Date.parse(v.replace(" ", "T"))))
        return "Fecha-hora inválida (YYYY-MM-DD HH:MM:SS)";
      return null;
    case "timestamptz":
      if (!TIMESTAMPTZ_RE.test(v) || Number.isNaN(Date.parse(v.replace(" ", "T"))))
        return "Fecha-hora con zona inválida";
      return null;
    case "uuid":
      if (!UUID_RE.test(v)) return "UUID inválido";
      return null;
    case "json":
    case "jsonb":
      try { JSON.parse(v); return null; } catch { return "JSON inválido"; }
    case "entity":
      if (!UUID_RE.test(v)) return "Referencia de entidad inválida (UUID)";
      return null;
    default:
      return null;
  }
}

export function exampleForType(type: FieldType | "entity"): string {
  switch (type) {
    case "text":
    case "varchar": return "Texto de ejemplo";
    case "integer": return "42";
    case "bigint": return "9007199254740993";
    case "numeric":
    case "real":
    case "double precision": return "1234.56";
    case "boolean": return "true";
    case "date": return "2025-06-22";
    case "time": return "14:30:00";
    case "timestamp": return "2025-06-22 14:30:00";
    case "timestamptz": return "2025-06-22T14:30:00+02:00";
    case "uuid":
    case "entity": return "550e8400-e29b-41d4-a716-446655440000";
    case "json":
    case "jsonb": return '{"clave":"valor"}';
    default: return "";
  }
}
