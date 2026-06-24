import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { type AppRole } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  CheckCircle2, XCircle, Eye, Pencil, Play, GitBranch, Workflow, Shield, Users,
} from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RTooltip, Legend } from "recharts";

type RoleKey = AppRole;
const ROLES: Record<RoleKey, { label: string; color: string }> = {
  administrador: { label: "Administrador", color: "hsl(var(--primary))" },
  dueno_proceso: { label: "Dueño de proceso", color: "hsl(160 70% 45%)" },
  participante: { label: "Participante", color: "hsl(35 90% 55%)" },
  auditor: { label: "Auditor", color: "hsl(280 60% 60%)" },
};
const ROLE_KEYS: RoleKey[] = ["administrador", "dueno_proceso", "participante", "auditor"];

type Op = "R" | "W" | "X";
const BPM: ReadonlyArray<RoleKey> = ROLE_KEYS;
const EDITORS: ReadonlyArray<RoleKey> = ["administrador", "dueno_proceso"];
const ADMIN_ONLY: ReadonlyArray<RoleKey> = ["administrador"];

type PolicyRow = {
  table: string; label: string;
  area: "Modelado" | "Ejecución" | "Administración" | "Catálogo";
  read: ReadonlyArray<RoleKey>; write: ReadonlyArray<RoleKey>; execute?: ReadonlyArray<RoleKey>;
  policySql: string;
};
const POLICY_ROWS: PolicyRow[] = [
  { table: "entities", label: "Entidades", area: "Modelado", read: BPM, write: EDITORS, policySql: "SELECT: has_any_bpm_role · ALL: can_edit_bpm" },
  { table: "macroprocesses", label: "Macroprocesos", area: "Modelado", read: BPM, write: EDITORS, policySql: "has_any_bpm_role / can_edit_bpm" },
  { table: "processes", label: "Procesos", area: "Modelado", read: BPM, write: EDITORS, policySql: "has_any_bpm_role / can_edit_bpm" },
  { table: "subprocesses", label: "Subprocesos", area: "Modelado", read: BPM, write: EDITORS, policySql: "has_any_bpm_role / can_edit_bpm" },
  { table: "process_diagrams", label: "Diagramas de proceso", area: "Modelado", read: BPM, write: EDITORS, policySql: "has_any_bpm_role / can_edit_bpm" },
  { table: "executable_elements", label: "Elementos ejecutables", area: "Modelado", read: BPM, write: EDITORS, policySql: "has_any_bpm_role / can_edit_bpm" },
  { table: "process_indicators", label: "Indicadores", area: "Modelado", read: BPM, write: EDITORS, policySql: "has_any_bpm_role / can_edit_bpm" },
  { table: "process_risks", label: "Riesgos", area: "Modelado", read: BPM, write: EDITORS, policySql: "has_any_bpm_role / can_edit_bpm" },
  { table: "process_documents", label: "Documentos", area: "Modelado", read: BPM, write: EDITORS, policySql: "has_any_bpm_role / can_edit_bpm" },
  { table: "process_definitions", label: "Definiciones ejecutables", area: "Ejecución", read: BPM, write: EDITORS, policySql: "has_any_bpm_role / can_edit_bpm" },
  { table: "process_instances", label: "Instancias de proceso", area: "Ejecución", read: BPM, write: EDITORS, execute: BPM, policySql: "Lectura para todos los roles BPM; gestión por editores" },
  { table: "process_tokens", label: "Tokens de ejecución", area: "Ejecución", read: BPM, write: EDITORS, execute: BPM, policySql: "Avance de tokens por motor de procesos" },
  { table: "process_tasks", label: "Tareas de proceso", area: "Ejecución", read: BPM, write: EDITORS, execute: BPM, policySql: "Participantes completan; editores reconfiguran" },
  { table: "process_events_log", label: "Log de eventos", area: "Ejecución", read: BPM, write: [], policySql: "Solo lectura para roles BPM" },
  { table: "node_types", label: "Tipos de nodo", area: "Catálogo", read: BPM, write: ADMIN_ONLY, policySql: "Lectura authenticated · Escritura admin" },
  { table: "node_subtypes", label: "Subtipos de nodo", area: "Catálogo", read: BPM, write: ADMIN_ONLY, policySql: "Lectura authenticated · Escritura admin" },
  { table: "user_roles", label: "Asignación de roles", area: "Administración", read: ADMIN_ONLY, write: ADMIN_ONLY, policySql: "Solo administrador" },
  { table: "profiles", label: "Perfiles de usuario", area: "Administración", read: BPM, write: ADMIN_ONLY, policySql: "Lectura propia + admin · Edición admin" },
  { table: "change_log", label: "Auditoría / change log", area: "Administración", read: ADMIN_ONLY, write: [], policySql: "Solo administrador" },
];

const AREA_COLOR: Record<PolicyRow["area"], string> = {
  Modelado: "hsl(210 90% 55%)", Ejecución: "hsl(160 70% 45%)",
  Catálogo: "hsl(35 90% 55%)", Administración: "hsl(280 60% 60%)",
};
const AREA_ICON: Record<PolicyRow["area"], typeof Workflow> = {
  Modelado: GitBranch, Ejecución: Play, Catálogo: Workflow, Administración: Shield,
};

function PolicyRows({ row }: { row: PolicyRow }) {
  const ops: Array<{ op: Op; label: string; icon: any; roles: ReadonlyArray<RoleKey> }> = [
    { op: "R", label: "Leer", icon: Eye, roles: row.read },
    { op: "W", label: "Escribir", icon: Pencil, roles: row.write },
  ];
  if (row.execute) ops.push({ op: "X", label: "Ejecutar", icon: Play, roles: row.execute });
  return (
    <>
      {ops.map((o, idx) => (
        <tr key={o.op} className="hover:bg-muted/30">
          {idx === 0 && (
            <td rowSpan={ops.length} className="px-4 py-2 align-top border-r">
              <div className="font-medium">{row.label}</div>
              <code className="text-[10px] text-muted-foreground">{row.table}</code>
            </td>
          )}
          <td className="px-2 py-2 text-center">
            <Tooltip>
              <TooltipTrigger><o.icon className="h-3.5 w-3.5 inline text-muted-foreground" /></TooltipTrigger>
              <TooltipContent>{o.label}</TooltipContent>
            </Tooltip>
          </td>
          {ROLE_KEYS.map((rk) => {
            const allowed = o.roles.includes(rk);
            return (
              <td key={rk} className="px-2 py-2 text-center">
                {allowed
                  ? <CheckCircle2 className="h-4 w-4 inline" style={{ color: ROLES[rk].color }} />
                  : <XCircle className="h-3.5 w-3.5 inline text-muted-foreground/20" />}
              </td>
            );
          })}
          {idx === 0 && (
            <td rowSpan={ops.length} className="px-4 py-2 align-top text-xs text-muted-foreground border-l">
              {row.policySql}
            </td>
          )}
        </tr>
      ))}
    </>
  );
}

export function PlatformPermissionsPanel() {
  const { data } = useQuery({
    queryKey: ["platform-roles-distribution"],
    queryFn: async () => {
      const { data: roles } = await supabase.from("user_roles").select("user_id,role");
      const count: Record<AppRole, number> = { administrador: 0, dueno_proceso: 0, participante: 0, auditor: 0 };
      (roles ?? []).forEach((r: any) => { count[r.role as AppRole] = (count[r.role as AppRole] ?? 0) + 1; });
      return count;
    },
  });

  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4" /> Distribución de roles</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-56">
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={ROLE_KEYS.map((rk) => ({ name: ROLES[rk].label, value: data?.[rk] ?? 0, color: ROLES[rk].color }))}
                    dataKey="value" nameKey="name" outerRadius={80} label
                  >
                    {ROLE_KEYS.map((rk) => <Cell key={rk} fill={ROLES[rk].color} />)}
                  </Pie>
                  <RTooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {(["Modelado", "Ejecución", "Catálogo", "Administración"] as const).map((area) => {
          const rows = POLICY_ROWS.filter((r) => r.area === area);
          const Icon = AREA_ICON[area];
          return (
            <Card key={area}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <span className="inline-grid place-items-center h-7 w-7 rounded-md text-white" style={{ background: AREA_COLOR[area] }}>
                    <Icon className="h-4 w-4" />
                  </span>
                  {area}
                  <Badge variant="outline" className="ml-1 text-[10px]">{rows.length} tablas</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                      <tr>
                        <th className="text-left px-4 py-2">Recurso</th>
                        <th className="px-2 py-2">Op.</th>
                        {ROLE_KEYS.map((rk) => (
                          <th key={rk} className="text-center px-2 py-2" style={{ color: ROLES[rk].color }}>
                            {ROLES[rk].label.split(" ")[0]}
                          </th>
                        ))}
                        <th className="text-left px-4 py-2">Política</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {rows.map((row) => <PolicyRows key={row.table} row={row} />)}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
