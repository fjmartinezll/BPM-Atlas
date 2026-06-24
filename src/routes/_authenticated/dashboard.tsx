import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import {
  ChevronRight, ChevronDown, Workflow, GitBranch, ListTree, Zap, Database,
  Network, Building2, FlaskConical, Rocket, ArrowRightLeft, Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  listStructure, migrateDiagram, deleteTenant, deleteEntity, deleteDiagram,
  type DiagramRow, type EntityRow, type TenantRow,
} from "@/lib/structure-admin.functions";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Migración de Diagramas — BPM Atlas" }] }),
  component: StructurePage,
});

type DiagramType = "macroprocesos" | "procesos" | "subprocesos" | "workflows" | "datos";
const TYPE_META: Record<string, { label: string; icon: typeof Workflow; color: string; bg: string }> = {
  macroprocesos: { label: "Macroprocesos", icon: Workflow, color: "text-fuchsia-600", bg: "bg-fuchsia-500/10" },
  procesos: { label: "Procesos", icon: GitBranch, color: "text-emerald-600", bg: "bg-emerald-500/10" },
  subprocesos: { label: "Subprocesos", icon: ListTree, color: "text-sky-600", bg: "bg-sky-500/10" },
  workflows: { label: "Workflows", icon: Zap, color: "text-amber-600", bg: "bg-amber-500/10" },
  datos: { label: "Modelos de datos", icon: Database, color: "text-violet-600", bg: "bg-violet-500/10" },
};

const ENVS: Array<{ value: "produccion" | "pruebas"; label: string; icon: typeof Rocket; color: string }> = [
  { value: "produccion", label: "Producción", icon: Rocket, color: "text-emerald-600" },
  { value: "pruebas", label: "Pruebas", icon: FlaskConical, color: "text-amber-600" },
];

const UNASSIGNED = "__none__";

function StructurePage() {
  const listFn = useServerFn(listStructure);
  const migrateFn = useServerFn(migrateDiagram);
  const delTenantFn = useServerFn(deleteTenant);
  const delEntityFn = useServerFn(deleteEntity);
  const delDiagramFn = useServerFn(deleteDiagram);
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["structure-admin"],
    queryFn: () => listFn(),
  });

  const [migrating, setMigrating] = useState<DiagramRow | null>(null);

  const mut = useMutation({
    mutationFn: (vars: { diagramId: string; clientId: string; entityId: string | null; environment: "produccion" | "pruebas" }) =>
      migrateFn({ data: vars }),
    onSuccess: () => {
      toast.success("Diagrama migrado");
      qc.invalidateQueries({ queryKey: ["structure-admin"] });
      setMigrating(null);
    },
    onError: (e: any) => toast.error(e?.message ?? "Error migrando"),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["structure-admin"] });
  const delTenant = useMutation({
    mutationFn: (id: string) => delTenantFn({ data: { id } }),
    onSuccess: () => { toast.success("Tenant eliminado"); invalidate(); },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });
  const delEntity = useMutation({
    mutationFn: (id: string) => delEntityFn({ data: { id } }),
    onSuccess: () => { toast.success("Entidad eliminada"); invalidate(); },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });
  const delDiagram = useMutation({
    mutationFn: (id: string) => delDiagramFn({ data: { id } }),
    onSuccess: () => { toast.success("Diagrama eliminado"); invalidate(); },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

  if (q.isLoading) {
    return <div className="p-8 text-sm text-muted-foreground">Cargando estructura…</div>;
  }
  if (q.error) {
    return <div className="p-8 text-sm text-destructive">{(q.error as Error).message}</div>;
  }

  const { tenants, entities, diagrams } = q.data!;

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-6 py-8">
      <header className="flex items-center gap-3">
        <Network className="h-7 w-7 text-accent" />
        <div>
          <h1 className="font-display text-3xl font-semibold">Migración de Diagramas</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Tenants → Entidades → Entornos → Diagramas. Migra cualquier diagrama a otro tenant, entidad o entorno.
          </p>
        </div>
      </header>

      <div className="rounded-xl border bg-card">
        {tenants.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">No hay tenants.</p>
        ) : (
          <ul className="divide-y">
            {tenants.map((t) => (
              <TenantNode
                key={t.id}
                tenant={t}
                entities={entities.filter((e) => e.client_id === t.id)}
                diagrams={diagrams.filter((d) => d.client_id === t.id)}
                onMigrate={setMigrating}
                onDeleteTenant={(id) => delTenant.mutate(id)}
                onDeleteEntity={(id) => delEntity.mutate(id)}
                onDeleteDiagram={(id) => delDiagram.mutate(id)}
              />
            ))}
          </ul>
        )}
      </div>

      <MigrateDialog
        diagram={migrating}
        tenants={tenants}
        entities={entities}
        onClose={() => setMigrating(null)}
        onSubmit={(v) => mut.mutate(v)}
        pending={mut.isPending}
      />
    </div>
  );
}

function ConfirmDelete({
  title, description, onConfirm, disabled, disabledReason,
}: {
  title: string;
  description: string;
  onConfirm: () => void;
  disabled?: boolean;
  disabledReason?: string;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive disabled:opacity-30"
          disabled={disabled}
          title={disabled ? disabledReason : "Eliminar"}
          onClick={(e) => e.stopPropagation()}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent onClick={(e) => e.stopPropagation()}>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={onConfirm}
          >
            Eliminar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function TenantNode({
  tenant, entities, diagrams, onMigrate, onDeleteTenant, onDeleteEntity, onDeleteDiagram,
}: {
  tenant: TenantRow;
  entities: EntityRow[];
  diagrams: DiagramRow[];
  onMigrate: (d: DiagramRow) => void;
  onDeleteTenant: (id: string) => void;
  onDeleteEntity: (id: string) => void;
  onDeleteDiagram: (id: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const orphanDiagrams = diagrams.filter((d) => !d.entity_id);
  const hasDeps = entities.length > 0 || diagrams.length > 0;
  return (
    <li>
      <div className="flex w-full items-center gap-2 px-4 py-3 hover:bg-muted/50">
        <button onClick={() => setOpen(!open)} className="flex flex-1 items-center gap-2">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[9px] uppercase text-primary">Tenant</span>
          <Building2 className="h-4 w-4 text-primary" />
          <span className="font-medium">{tenant.name}</span>
          {tenant.code && <span className="font-mono text-[10px] text-muted-foreground">{tenant.code}</span>}
          <span className="ml-auto text-xs text-muted-foreground">
            {entities.length} entidades · {diagrams.length} diagramas
          </span>
        </button>
        <ConfirmDelete
          title={`Eliminar tenant "${tenant.name}"`}
          description="Esta acción no se puede deshacer."
          disabled={hasDeps}
          disabledReason="Tiene entidades o diagramas asociados"
          onConfirm={() => onDeleteTenant(tenant.id)}
        />
      </div>
      {open && (
        <div className="border-t bg-muted/20 px-4 py-2">
          {entities.length === 0 && orphanDiagrams.length === 0 && (
            <p className="px-2 py-3 text-xs text-muted-foreground">Sin entidades ni diagramas.</p>
          )}
          {entities.map((e) => (
            <EntityNode
              key={e.id}
              entity={e}
              diagrams={diagrams.filter((d) => d.entity_id === e.id)}
              onMigrate={onMigrate}
              onDeleteEntity={onDeleteEntity}
              onDeleteDiagram={onDeleteDiagram}
            />
          ))}
          {orphanDiagrams.length > 0 && (
            <EntityNode
              entity={{ id: "__orphan__", name: "Sin entidad asignada", client_id: tenant.id, environment: null }}
              diagrams={orphanDiagrams}
              onMigrate={onMigrate}
              onDeleteEntity={onDeleteEntity}
              onDeleteDiagram={onDeleteDiagram}
              orphan
            />
          )}
        </div>
      )}
    </li>
  );
}

function EntityNode({
  entity, diagrams, onMigrate, onDeleteEntity, onDeleteDiagram, orphan,
}: {
  entity: EntityRow;
  diagrams: DiagramRow[];
  onMigrate: (d: DiagramRow) => void;
  onDeleteEntity: (id: string) => void;
  onDeleteDiagram: (id: string) => void;
  orphan?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const hasDeps = diagrams.length > 0;
  return (
    <div className="py-1">
      <div className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/60">
        <button onClick={() => setOpen(!open)} className="flex flex-1 items-center gap-2">
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          <span className="rounded bg-sky-500/10 px-1.5 py-0.5 font-mono text-[9px] uppercase text-sky-700 dark:text-sky-400">Entidad</span>
          <Building2 className={cn("h-3.5 w-3.5", orphan ? "text-muted-foreground" : "text-sky-600")} />
          <span className={cn("text-sm", orphan && "italic text-muted-foreground")}>{entity.name}</span>
          <span className="ml-auto text-xs text-muted-foreground">{diagrams.length} diagramas</span>
        </button>
        {!orphan && (
          <ConfirmDelete
            title={`Eliminar entidad "${entity.name}"`}
            description="Esta acción no se puede deshacer."
            disabled={hasDeps}
            disabledReason="Tiene diagramas u otras dependencias"
            onConfirm={() => onDeleteEntity(entity.id)}
          />
        )}
      </div>
      {open && (
        <div className="ml-6 mt-1 space-y-2 border-l pl-3">
          {ENVS.map((env) => {
            const list = diagrams
              .filter((d) => (d.environment ?? "produccion") === env.value)
              .sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }));
            const EnvIcon = env.icon;
            return (
              <div key={env.value}>
                <div className="flex items-center gap-1.5 py-1 text-xs font-medium">
                  <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[9px] uppercase text-muted-foreground">Entorno</span>
                  <EnvIcon className={cn("h-3.5 w-3.5", env.color)} />
                  <span>{env.label}</span>
                  <span className="text-muted-foreground">({list.length})</span>
                </div>
                {list.length === 0 ? (
                  <p className="ml-5 text-xs text-muted-foreground">—</p>
                ) : (
                  <ul className="ml-5 space-y-0.5">
                    {list.map((d) => (
                      <DiagramItem key={d.id} d={d} onMigrate={onMigrate} onDelete={onDeleteDiagram} />
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DiagramItem({
  d, onMigrate, onDelete,
}: {
  d: DiagramRow;
  onMigrate: (d: DiagramRow) => void;
  onDelete: (id: string) => void;
}) {
  const meta = TYPE_META[d.diagram_type] ?? TYPE_META.procesos;
  const Icon = meta.icon;
  return (
    <li className="group flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted/60">
      <span className="rounded bg-accent/10 px-1.5 py-0.5 font-mono text-[9px] uppercase text-accent">Diagrama</span>
      <span className={cn("grid h-5 w-5 place-items-center rounded", meta.bg)}>
        <Icon className={cn("h-3 w-3", meta.color)} />
      </span>
      <Link
        to="/modeler"
        search={{ level: d.level, id: d.node_id, type: d.diagram_type, definitionId: "", instanceId: "" } as never}
        className="flex-1 truncate hover:underline"
      >
        {d.name}
      </Link>
      <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[9px] uppercase text-muted-foreground">
        {meta.label}
      </span>
      <Button
        size="sm"
        variant="ghost"
        className="h-7 gap-1 px-2 opacity-0 group-hover:opacity-100"
        onClick={() => onMigrate(d)}
      >
        <ArrowRightLeft className="h-3 w-3" /> Migrar
      </Button>
      <ConfirmDelete
        title={`Eliminar diagrama "${d.name}"`}
        description="Se eliminará el diagrama y sus elementos. Esta acción no se puede deshacer."
        onConfirm={() => onDelete(d.id)}
      />
    </li>
  );
}

function MigrateDialog({
  diagram, tenants, entities, onClose, onSubmit, pending,
}: {
  diagram: DiagramRow | null;
  tenants: TenantRow[];
  entities: EntityRow[];
  onClose: () => void;
  onSubmit: (v: { diagramId: string; clientId: string; entityId: string | null; environment: "produccion" | "pruebas" }) => void;
  pending: boolean;
}) {
  const [clientId, setClientId] = useState<string>("");
  const [entityId, setEntityId] = useState<string>(UNASSIGNED);
  const [environment, setEnvironment] = useState<"produccion" | "pruebas">("produccion");

  // Reset when dialog opens
  useMemo(() => {
    if (diagram) {
      setClientId(diagram.client_id ?? "");
      setEntityId(diagram.entity_id ?? UNASSIGNED);
      setEnvironment((diagram.environment as any) ?? "produccion");
    }
  }, [diagram?.id]);

  const entityChoices = entities.filter((e) => e.client_id === clientId);

  return (
    <Dialog open={!!diagram} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Migrar diagrama</DialogTitle>
          <DialogDescription>
            {diagram?.name} — elige tenant, entidad y entorno destino.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Tenant</Label>
            <Select
              value={clientId}
              onValueChange={(v) => { setClientId(v); setEntityId(UNASSIGNED); }}
            >
              <SelectTrigger><SelectValue placeholder="Selecciona tenant" /></SelectTrigger>
              <SelectContent>
                {tenants.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Entidad</Label>
            <Select value={entityId} onValueChange={setEntityId} disabled={!clientId}>
              <SelectTrigger><SelectValue placeholder="Sin entidad" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={UNASSIGNED}>— Sin entidad —</SelectItem>
                {entityChoices.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Entorno</Label>
            <Select value={environment} onValueChange={(v) => setEnvironment(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ENVS.map((e) => (
                  <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={pending}>Cancelar</Button>
          <Button
            disabled={!diagram || !clientId || pending}
            onClick={() => diagram && onSubmit({
              diagramId: diagram.id,
              clientId,
              entityId: entityId === UNASSIGNED ? null : entityId,
              environment,
            })}
          >
            {pending ? "Migrando…" : "Migrar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
