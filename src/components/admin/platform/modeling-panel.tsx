import { type AppRole } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Eye, Pencil, Play, KeyRound, GitBranch, Cog, Building2, Shield, X, Crown, Hammer, UserCheck, FileSearch } from "lucide-react";

type Perm = "R" | "W" | "X" | "-";
type AreaRow = { area: string; table: string; description: string; perms: Record<AppRole, Perm[]> };
const ALL_ROLES: AppRole[] = ["administrador", "dueno_proceso", "participante", "auditor"];

const PERM_META: Record<Perm, { label: string; cls: string; icon: typeof Eye }> = {
  R: { label: "Lectura", cls: "bg-blue-500/15 text-blue-700 border-blue-500/30 dark:text-blue-300", icon: Eye },
  W: { label: "Escritura", cls: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:text-emerald-300", icon: Pencil },
  X: { label: "Ejecución", cls: "bg-violet-500/15 text-violet-700 border-violet-500/30 dark:text-violet-300", icon: Play },
  "-": { label: "Sin acceso", cls: "bg-muted text-muted-foreground border-muted", icon: X },
};

const ROLE_META: Record<AppRole, { label: string; category: string; categoryClass: string; roleClass: string; icon: typeof Crown }> = {
  administrador: { label: "Administrador", category: "Admin", categoryClass: "bg-sky-700 dark:bg-sky-500 text-white", roleClass: "bg-sky-100 text-sky-800 dark:bg-sky-900/60 dark:text-sky-100", icon: Crown },
  dueno_proceso: { label: "Dueño", category: "Modelado", categoryClass: "bg-emerald-700 dark:bg-emerald-500 text-white", roleClass: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-100", icon: Hammer },
  participante: { label: "Participante", category: "Ejecución", categoryClass: "bg-orange-700 dark:bg-orange-500 text-white", roleClass: "bg-orange-100 text-orange-800 dark:bg-orange-900/60 dark:text-orange-100", icon: UserCheck },
  auditor: { label: "Auditor", category: "Motor", categoryClass: "bg-purple-700 dark:bg-purple-500 text-white", roleClass: "bg-purple-100 text-purple-800 dark:bg-purple-900/60 dark:text-purple-100", icon: FileSearch },
};

function RoleTag({ role }: { role: AppRole }) {
  const m = ROLE_META[role];
  return (
    <span className="inline-flex items-center rounded border overflow-hidden text-[10px]" title={`${m.category}: ${m.label}`}>
      <span className={`px-1.5 py-0.5 font-semibold ${m.categoryClass}`}>{m.category}</span>
      <span className={`px-1.5 py-0.5 font-medium ${m.roleClass}`}>{m.label}</span>
    </span>
  );
}

const MODELING_GROUPS: { group: string; icon: typeof GitBranch; rows: AreaRow[] }[] = [
  {
    group: "Permisos para el modelado de diagramas", icon: GitBranch,
    rows: [
      { area: "BPM", table: "macroprocesses", description: "Macroprocesos", perms: { administrador: ["R","W"], dueno_proceso: ["R","W"], participante: ["R"], auditor: ["R"] } },
      { area: "BPM", table: "processes", description: "Procesos", perms: { administrador: ["R","W"], dueno_proceso: ["R","W"], participante: ["R"], auditor: ["R"] } },
      { area: "BPM", table: "subprocesses", description: "Subprocesos", perms: { administrador: ["R","W"], dueno_proceso: ["R","W"], participante: ["R"], auditor: ["R"] } },
      { area: "BPM", table: "process_diagrams", description: "Diagramas BPMN", perms: { administrador: ["R","W"], dueno_proceso: ["R","W"], participante: ["R"], auditor: ["R"] } },
      { area: "BPM", table: "executable_elements", description: "Definiciones ejecutables", perms: { administrador: ["R","W"], dueno_proceso: ["R","W"], participante: ["R"], auditor: ["R"] } },
      { area: "BPM", table: "process_indicators", description: "Indicadores", perms: { administrador: ["R","W"], dueno_proceso: ["R","W"], participante: ["R"], auditor: ["R"] } },
      { area: "BPM", table: "process_risks", description: "Riesgos", perms: { administrador: ["R","W"], dueno_proceso: ["R","W"], participante: ["R"], auditor: ["R"] } },
    ],
  },
  {
    group: "Catálogo organizacional", icon: Building2,
    rows: [
      { area: "Org", table: "entities", description: "Entidades / áreas", perms: { administrador: ["R","W"], dueno_proceso: ["R","W"], participante: ["R"], auditor: ["R"] } },
      { area: "Org", table: "entity_positions", description: "Cargos", perms: { administrador: ["R","W"], dueno_proceso: ["R","W"], participante: ["R"], auditor: ["R"] } },
      { area: "Org", table: "entity_process_links", description: "Entidad ↔ Proceso", perms: { administrador: ["R","W"], dueno_proceso: ["R","W"], participante: ["R"], auditor: ["R"] } },
    ],
  },
  {
    group: "Administración", icon: Shield,
    rows: [
      { area: "Admin", table: "profiles", description: "Perfiles", perms: { administrador: ["R","W"], dueno_proceso: ["R"], participante: ["R"], auditor: ["R"] } },
      { area: "Admin", table: "user_roles", description: "Asignación de roles", perms: { administrador: ["R","W"], dueno_proceso: ["-"], participante: ["-"], auditor: ["R"] } },
      { area: "Admin", table: "change_log", description: "Auditoría de cambios", perms: { administrador: ["R"], dueno_proceso: ["-"], participante: ["-"], auditor: ["R"] } },
      { area: "Admin", table: "node_types / node_kinds", description: "Taxonomía", perms: { administrador: ["R","W"], dueno_proceso: ["R"], participante: ["R"], auditor: ["R"] } },
    ],
  },
];

const EXECUTION_GROUPS: { group: string; icon: typeof GitBranch; rows: AreaRow[] }[] = [
  {
    group: "Ejecución de procesos", icon: Cog,
    rows: [
      { area: "Engine", table: "process_definitions", description: "Definiciones publicadas", perms: { administrador: ["R","W","X"], dueno_proceso: ["R","W","X"], participante: ["R","X"], auditor: ["R"] } },
      { area: "Engine", table: "process_instances", description: "Instancias en curso", perms: { administrador: ["R","W","X"], dueno_proceso: ["R","W","X"], participante: ["R","X"], auditor: ["R"] } },
      { area: "Engine", table: "process_tasks", description: "Tareas humanas", perms: { administrador: ["R","W","X"], dueno_proceso: ["R","W","X"], participante: ["R","X"], auditor: ["R"] } },
      { area: "Engine", table: "process_tokens", description: "Tokens de flujo", perms: { administrador: ["R","W"], dueno_proceso: ["R","W"], participante: ["R"], auditor: ["R"] } },
      { area: "Engine", table: "process_events_log", description: "Bitácora de eventos", perms: { administrador: ["R"], dueno_proceso: ["R"], participante: ["R"], auditor: ["R"] } },
    ],
  },
];

function PermissionsMatrix({ groups, title }: { groups: typeof MODELING_GROUPS; title: string }) {
  return (
    <TooltipProvider delayDuration={150}>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5" /> Matriz — {title}</CardTitle>
          <CardDescription>Permisos efectivos por rol según las políticas RLS activas.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-wrap gap-2 text-xs">
            {(["R","W","X"] as Perm[]).map((p) => {
              const pm = PERM_META[p]; const Icon = pm.icon;
              return <Badge key={p} variant="outline" className={pm.cls}><Icon className="h-3 w-3 mr-1" />{pm.label}</Badge>;
            })}
          </div>
          {groups.map((g) => {
            const GIcon = g.icon;
            return (
              <div key={g.group}>
                <h3 className="font-semibold flex items-center gap-2 mb-2"><GIcon className="h-4 w-4 text-primary" />{g.group}</h3>
                <div className="overflow-x-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Recurso</TableHead>
                        {ALL_ROLES.map((r) => <TableHead key={r} className="text-center"><div className="flex justify-center"><RoleTag role={r} /></div></TableHead>)}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {g.rows.map((row) => (
                        <TableRow key={row.table}>
                          <TableCell>
                            <div className="font-mono text-xs">{row.table}</div>
                            <div className="text-xs text-muted-foreground">{row.description}</div>
                          </TableCell>
                          {ALL_ROLES.map((r) => (
                            <TableCell key={r} className="text-center">
                              <div className="flex gap-1 justify-center flex-wrap">
                                {row.perms[r].map((p, i) => {
                                  const pm = PERM_META[p]; const Icon = pm.icon;
                                  return (
                                    <Tooltip key={i}>
                                      <TooltipTrigger asChild>
                                        <Badge variant="outline" className={`${pm.cls} px-1.5`}><Icon className="h-3 w-3" /></Badge>
                                      </TooltipTrigger>
                                      <TooltipContent>{pm.label}</TooltipContent>
                                    </Tooltip>
                                  );
                                })}
                              </div>
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}

export function PlatformModelingPanel() {
  return <PermissionsMatrix groups={MODELING_GROUPS} title="Permisos de Modelado" />;
}
export function PlatformExecutionMatrix() {
  return <PermissionsMatrix groups={EXECUTION_GROUPS} title="Ejecución" />;
}
