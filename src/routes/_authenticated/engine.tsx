import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  listDefinitions, setDefinitionStatus, deleteDefinition, startInstance, getDefinitionInputs,
  listInstances, getInstanceDetail, pauseInstance, resumeInstance,
  abortInstance, advanceInstance, completeTask, claimTask, tickTimers,
} from "@/lib/engine.functions";
import { getStartDraft, saveStartDraft, deleteStartDraft, listMyDrafts } from "@/lib/drafts.functions";
import { FileEdit } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/lib/auth-context";
import { useClient } from "@/lib/client-context";
import { useSelectedEntity } from "@/lib/selected-entity";
import { validateValueForType, exampleForType } from "@/lib/field-types";
import { InstanceDiagramPanel } from "@/components/instance-diagram-panel";
import {
  Play, Pause, Square as StopIcon, FastForward, RefreshCw, Rocket, PowerOff, Timer, CheckCircle2,
  Building2, Box, FlaskConical, Trash2, ArrowLeft,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/engine")({
  head: () => ({ meta: [{ title: "Motor de procesos — BPM Atlas" }] }),
  validateSearch: (s: Record<string, unknown>) => {
    const drafts = s.drafts === true || s.drafts === "1" || s.drafts === "true" ? true : undefined;
    const tabRaw = typeof s.tab === "string" ? s.tab : undefined;
    const tab = tabRaw === "instances" || tabRaw === "drafts" || tabRaw === "definitions" ? tabRaw : undefined;
    return { drafts, tab };
  },
  component: EnginePage,
});

const STATUS_BADGE: Record<string, string> = {
  active: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  inactive: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-300",
  archived: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  running: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  waiting: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  paused: "bg-zinc-500/15 text-zinc-600",
  completed: "bg-emerald-500/15 text-emerald-700",
  aborted: "bg-rose-500/15 text-rose-700",
  error: "bg-rose-500/15 text-rose-700",
};

function StatusBadge({ value }: { value: string }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[value] ?? "bg-muted"}`}>{value}</span>;
}

function fmtDate(s?: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  return d.toLocaleString();
}

function EngineScopeHeader() {
  const { currentClient, currentClientId, environment, setEnvironment } = useClient();
  const { entity, setEntity } = useSelectedEntity();
  const { isAdmin } = useAuth();
  const entitiesQ = useQuery({
    queryKey: ["engine-header-entities", currentClientId, environment],
    enabled: !!currentClientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("entities")
        .select("id,name,client_id,environment")
        .eq("client_id", currentClientId!)
        .eq("environment", environment)
        .order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
  });
  const entities = entitiesQ.data ?? [];

  // Al cambiar de entorno, la entidad seleccionada puede no existir en el nuevo entorno.
  // Intentamos mapearla por nombre; si no existe, se limpia.
  useEffect(() => {
    if (!entitiesQ.data) return;
    if (!entity) return;
    const match = entitiesQ.data.find((e) => e.id === entity.id);
    if (match) return;
    const byName = entitiesQ.data.find((e) => e.name === entity.name);
    if (byName) setEntity({ id: byName.id, name: byName.name });
    // si no hay equivalente, no forzamos cambio aquí (el provider global validará).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entitiesQ.data, environment]);

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-md border bg-card px-3 py-2">
      <div className="space-y-1">
        <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Tenant</Label>
        <div className="flex h-8 items-center gap-1.5 rounded-md border bg-muted/40 px-2 text-xs font-medium min-w-[160px]">
          <Building2 className="h-3.5 w-3.5 text-primary" />
          <span className="truncate" title={currentClient?.name}>{currentClient?.name ?? "—"}</span>
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Entidad</Label>
        <Select
          value={entity?.id ?? ""}
          onValueChange={(v) => {
            const e = entities.find((x) => x.id === v);
            if (e) setEntity({ id: e.id, name: e.name });
          }}
        >
          <SelectTrigger className="h-8 min-w-[200px] text-xs">
            <div className="flex items-center gap-1.5">
              <Box className="h-3.5 w-3.5 text-primary" />
              <SelectValue placeholder="Selecciona entidad" />
            </div>
          </SelectTrigger>
          <SelectContent>
            {entities.map((e) => (
              <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {isAdmin && (
        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Entorno</Label>
          <div className="flex gap-1">
            <Button
              type="button" size="sm"
              variant={environment === "produccion" ? "default" : "outline"}
              className="h-8 px-2 text-[11px]"
              onClick={() => environment !== "produccion" && setEnvironment("produccion")}
            >
              <Rocket className="mr-1 h-3 w-3" /> Producción
            </Button>
            <Button
              type="button" size="sm"
              variant={environment === "pruebas" ? "default" : "outline"}
              className="h-8 px-2 text-[11px]"
              onClick={() => environment !== "pruebas" && setEnvironment("pruebas")}
            >
              <FlaskConical className="mr-1 h-3 w-3" /> Pruebas
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function EnginePage() {
  const { canEdit } = useAuth();
  const navigate = useNavigate();
  const { drafts: draftsFilter, tab } = Route.useSearch();
  const tabValue = tab ?? (draftsFilter ? "drafts" : "definitions");
  return (
    <div className="flex flex-col gap-4 p-6">
      <div>
        <h1 className="text-2xl font-display font-semibold">Motor de procesos</h1>
        <p className="text-sm text-muted-foreground">
          {tabValue === "drafts"
            ? "Borradores: plantillas con cambios guardados pendientes de iniciar."
            : "Consola de mandos: publica diagramas, lanza instancias y supervisa la ejecución."}
        </p>
      </div>

      <EngineScopeHeader />

      <Tabs
        value={tabValue}
        onValueChange={(v) => {
          if (v === "drafts") navigate({ to: "/engine", search: { drafts: true, tab: "drafts" } });
          else if (v === "instances") navigate({ to: "/engine", search: { tab: "instances" } });
          else navigate({ to: "/engine", search: {} });
        }}
        className="w-full"
      >
        <TabsList>
          <TabsTrigger value="definitions">Plantillas inmutables-de-Procesos</TabsTrigger>
          <TabsTrigger value="instances">Ejecuciones-de-Instancias</TabsTrigger>
          <TabsTrigger value="drafts">Borradores</TabsTrigger>
        </TabsList>
        <TabsContent value="definitions" className="mt-4">
          <DefinitionsTab canEdit={canEdit} draftsOnly={false} />
        </TabsContent>
        <TabsContent value="instances" className="mt-4">
          <InstancesTab canEdit={canEdit} />
        </TabsContent>
        <TabsContent value="drafts" className="mt-4">
          <DefinitionsTab canEdit={canEdit} draftsOnly={true} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ----------------- DEFINITIONS TAB -----------------
function DefinitionsTab({ canEdit, draftsOnly = false }: { canEdit: boolean; draftsOnly?: boolean }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const listFn = useServerFn(listDefinitions);
  const setStatusFn = useServerFn(setDefinitionStatus);
  const deleteDefFn = useServerFn(deleteDefinition);
  const startFn = useServerFn(startInstance);
  const tickFn = useServerFn(tickTimers);
  const listDraftsFn = useServerFn(listMyDrafts);


  const { currentClientId, environment } = useClient();
  const { entity } = useSelectedEntity();
  const q = useQuery({ queryKey: ["engine-defs", currentClientId, environment, entity?.id ?? null], queryFn: () => listFn({ data: { clientId: currentClientId ?? undefined, environment, entityId: entity?.id ?? undefined } }) });
  const draftsQ = useQuery({ queryKey: ["engine-my-drafts"], queryFn: () => listDraftsFn() });
  const draftsByDef = new Map((draftsQ.data ?? []).map((d) => [d.definitionId, d.updatedAt]));
  const [openStart, setOpenStart] = useState<{ id: string; name: string } | null>(null);

  const setStatusMut = useMutation({
    mutationFn: (input: { id: string; status: "active" | "inactive" | "archived" }) => setStatusFn({ data: input }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["engine-defs"] }); toast.success("Estado actualizado"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteDefFn({ data: { id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["engine-defs"] }); toast.success("Plantilla eliminada"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteDraftFn = useServerFn(deleteStartDraft);
  const startMut = useMutation({
    mutationFn: (input: { definitionId: string; variables: Record<string, unknown> }) => startFn({ data: input }),
    onSuccess: (_r, vars) => {
      qc.invalidateQueries({ queryKey: ["engine-defs"] });
      qc.invalidateQueries({ queryKey: ["engine-instances"] });
      toast.success("Instancia iniciada");
      // borrar borrador silenciosamente
      deleteDraftFn({ data: { definitionId: vars.definitionId } })
        .then(() => {
          qc.invalidateQueries({ queryKey: ["engine-draft", vars.definitionId] });
          qc.invalidateQueries({ queryKey: ["engine-my-drafts"] });
        })
        .catch(() => {});
      setOpenStart(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const tickMut = useMutation({
    mutationFn: () => tickFn(),
    onSuccess: (r: { fired: number }) => toast.success(`Timers disparados: ${r.fired}`),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {q.data?.length ?? 0} definiciones publicadas
          {draftsQ.data && draftsQ.data.length > 0 && (
            <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-700 dark:text-amber-300">
              <FileEdit className="h-3 w-3" /> {draftsQ.data.length} borrador{draftsQ.data.length === 1 ? "" : "es"}
            </span>
          )}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => {
            qc.invalidateQueries({ queryKey: ["engine-defs"] });
            qc.invalidateQueries({ queryKey: ["engine-my-drafts"] });
          }}>
            <RefreshCw className="mr-2 h-3.5 w-3.5" /> Recargar
          </Button>
          {canEdit && (
            <Button variant="outline" size="sm" onClick={() => tickMut.mutate()} disabled={tickMut.isPending}>
              <Timer className="mr-2 h-3.5 w-3.5" /> Disparar timers
            </Button>
          )}
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Versión</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Publicado</TableHead>
              <TableHead>Instancias activas</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(q.data ?? []).filter((d) => !draftsOnly || draftsByDef.has(d.id)).map((d) => {
              const draftAt = draftsByDef.get(d.id);
              return (
              <TableRow
                key={d.id}
                className="cursor-pointer"
                onClick={() => navigate({ to: "/modeler", search: { definitionId: d.id } })}
                title="Ver diagrama con estados de instancia"
              >
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    {d.name}
                    {draftAt && (
                      <Badge variant="secondary" className="gap-1 bg-amber-500/15 text-amber-700 dark:text-amber-300" title={`Borrador guardado: ${fmtDate(draftAt)}`}>
                        <FileEdit className="h-3 w-3" /> Borrador
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>v{d.version}</TableCell>
                <TableCell><StatusBadge value={d.status} /></TableCell>
                <TableCell className="text-xs">{fmtDate(d.published_at)}</TableCell>
                <TableCell>{d.active_instances}</TableCell>
                <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                  <div className="flex justify-end gap-2">
                    {draftAt && canEdit && (
                      <Button size="sm" variant="secondary"
                        onClick={() => setOpenStart({ id: d.id, name: `${d.name} v${d.version}` })}
                        title={`Continuar borrador del ${fmtDate(draftAt)}`}>
                        <FileEdit className="mr-1 h-3.5 w-3.5" /> Continuar borrador
                      </Button>
                    )}
                    <Button size="sm" variant="default" disabled={!canEdit || d.status !== "active"}
                      onClick={() => { setOpenStart({ id: d.id, name: `${d.name} v${d.version}` }); }}>
                      <Rocket className="mr-1 h-3.5 w-3.5" /> Iniciar
                    </Button>
                    {canEdit && d.status === "active" && (
                      <Button size="sm" variant="outline" onClick={() => setStatusMut.mutate({ id: d.id, status: "inactive" })}>
                        <PowerOff className="mr-1 h-3.5 w-3.5" /> Desactivar
                      </Button>
                    )}
                    {canEdit && d.status !== "active" && (
                      <Button size="sm" variant="outline" onClick={() => setStatusMut.mutate({ id: d.id, status: "active" })}>
                        Activar
                      </Button>
                    )}
                    {canEdit && d.status !== "active" && (d.total_instances ?? 0) === 0 && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-rose-600 hover:text-rose-700 hover:bg-rose-500/10"
                        onClick={() => {
                          if (confirm(`¿Borrar la plantilla "${d.name} v${d.version}"? Esta acción no se puede deshacer.`)) {
                            deleteMut.mutate(d.id);
                          }
                        }}
                        title="Borrar plantilla (solo si está inactiva y nunca se ejecutó)"
                      >
                        <Trash2 className="mr-1 h-3.5 w-3.5" /> Borrar
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
              );
            })}

            {!q.data?.length && (
              <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">
                Aún no hay definiciones. Publica desde el modelador.
              </TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!openStart} onOpenChange={(o) => !o && setOpenStart(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Lanzar instancia</DialogTitle>
            <DialogDescription>{openStart?.name}</DialogDescription>
          </DialogHeader>
          {openStart && (
            <StartInstanceForm
              definitionId={openStart.id}
              onCancel={() => setOpenStart(null)}
              onSubmit={(variables) => startMut.mutate({ definitionId: openStart.id, variables })}
              submitting={startMut.isPending}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ----------------- INSTANCES TAB -----------------
function InstancesTab({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listInstances);
  const { currentClientId, environment } = useClient();
  const { entity } = useSelectedEntity();
  const [status, setStatus] = useState<string>("all");
  const [openId, setOpenId] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["engine-instances", status, currentClientId, environment, entity?.id ?? null],
    queryFn: () => listFn({ data: {
      ...(status === "all" ? {} : { status }),
      clientId: currentClientId ?? undefined,
      environment,
      entityId: entity?.id ?? undefined,
    } }),
    refetchInterval: 5000,
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Label className="text-xs">Estado</Label>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            {["all", "running", "waiting", "paused", "completed", "aborted", "error"].map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => qc.invalidateQueries({ queryKey: ["engine-instances"] })}>
          <RefreshCw className="mr-2 h-3.5 w-3.5" /> Recargar
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>Definición</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Iniciada</TableHead>
              <TableHead>Finalizada</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(q.data ?? []).map((i) => (
              <TableRow key={i.id} className="cursor-pointer" onClick={() => setOpenId(i.id)}>
                <TableCell className="font-mono text-xs">{i.id.slice(0, 8)}</TableCell>
                <TableCell>{i.process_definitions?.name} <span className="text-xs text-muted-foreground">v{i.process_definitions?.version}</span></TableCell>
                <TableCell><StatusBadge value={i.status} /></TableCell>
                <TableCell className="text-xs">{fmtDate(i.started_at)}</TableCell>
                <TableCell className="text-xs">{fmtDate(i.ended_at)}</TableCell>
              </TableRow>
            ))}
            {!q.data?.length && (
              <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">
                Sin instancias.
              </TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Sheet open={!!openId} onOpenChange={(o) => !o && setOpenId(null)}>
        <SheetContent side="right" className="w-full sm:max-w-none sm:w-[95vw] overflow-y-auto">
          {openId && <InstanceDetail id={openId} canEdit={canEdit} onClose={() => setOpenId(null)} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function InstanceDetail({ id, canEdit, onClose }: { id: string; canEdit: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const getFn = useServerFn(getInstanceDetail);
  const pauseFn = useServerFn(pauseInstance);
  const resumeFn = useServerFn(resumeInstance);
  const abortFn = useServerFn(abortInstance);
  const advanceFn = useServerFn(advanceInstance);

  const q = useQuery({
    queryKey: ["engine-instance", id],
    queryFn: () => getFn({ data: { instanceId: id } }),
    // Polling fallback en caso de que Realtime no esté disponible; los cambios
    // llegan normalmente por la suscripción de abajo y refrescan de inmediato.
    refetchInterval: 15000,
  });

  const inv = () => {
    qc.invalidateQueries({ queryKey: ["engine-instance", id] });
    qc.invalidateQueries({ queryKey: ["engine-instances"] });
  };

  // Debounce para evitar repaints excesivos cuando llegan ráfagas de
  // actualizaciones de tokens/tareas en tiempo real.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debouncedInv = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      inv();
      debounceRef.current = null;
    }, 300);
  };

  // Realtime: cuando cambia cualquier token/tarea/instancia/evento de ESTA
  // instancia, invalidamos la query para que el diagrama y los paneles
  // repinten al instante sin esperar al polling.
  useEffect(() => {
    const filter = `instance_id=eq.${id}`;
    const channel = supabase
      .channel(`engine-instance:${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "process_tokens", filter }, () => debouncedInv())
      .on("postgres_changes", { event: "*", schema: "public", table: "process_tasks", filter }, () => debouncedInv())
      .on("postgres_changes", { event: "*", schema: "public", table: "process_events_log", filter }, () => debouncedInv())
      .on("postgres_changes", { event: "*", schema: "public", table: "process_instances", filter: `id=eq.${id}` }, () => debouncedInv())
      .subscribe();
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const mkOpts = { onSuccess: () => inv(), onError: (e: Error) => toast.error(e.message) };
  const pauseM = useMutation({ mutationFn: () => pauseFn({ data: { instanceId: id } }), ...mkOpts });
  const resumeM = useMutation({ mutationFn: () => resumeFn({ data: { instanceId: id } }), ...mkOpts });
  const abortM = useMutation({ mutationFn: () => abortFn({ data: { instanceId: id } }), ...mkOpts });
  const advM = useMutation({ mutationFn: () => advanceFn({ data: { instanceId: id } }), ...mkOpts });

  if (q.isLoading || !q.data) return <div className="p-4 text-sm text-muted-foreground">Cargando…</div>;
  const { instance, tokens, tasks, events } = q.data as any;
  const def = instance.process_definitions;
  const nodes: any[] = def?.nodes ?? [];
  const nodeLabel = (nid: string) => {
    const n = nodes.find((x) => x.id === nid);
    return (n?.data?.label as string) ?? nid.slice(0, 6);
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-display font-medium">Visualización de la ejecución de una instancia del Proceso:</h2>
        <p className="text-sm text-muted-foreground">
          {def?.name} <span className="text-xs">v{def?.version}</span>
        </p>
      </div>
      <SheetHeader>
        <SheetTitle className="flex flex-wrap items-center gap-2">
          {def?.name} <span className="text-xs text-muted-foreground">v{def?.version}</span>
          <StatusBadge value={instance.status} />
        </SheetTitle>
      </SheetHeader>

      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={onClose}>
            <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Volver al motor
          </Button>
          <Button size="sm" variant="outline" disabled={instance.status !== "running" && instance.status !== "waiting"}
            onClick={() => pauseM.mutate()}>
            <Pause className="mr-1 h-3.5 w-3.5" /> Pausar
          </Button>
          <Button size="sm" variant="outline" disabled={instance.status !== "paused"} onClick={() => resumeM.mutate()}>
            <Play className="mr-1 h-3.5 w-3.5" /> Reanudar
          </Button>
          <Button size="sm" variant="outline" disabled={!["running", "waiting", "paused", "error"].includes(instance.status)}
            onClick={() => advM.mutate()}>
            <FastForward className="mr-1 h-3.5 w-3.5" /> Avanzar
          </Button>
          <Button size="sm" variant="destructive" disabled={["completed", "aborted"].includes(instance.status)}
            onClick={() => abortM.mutate()}>
            <StopIcon className="mr-1 h-3.5 w-3.5" /> Abortar
          </Button>
        </div>
      )}

      {!canEdit && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={onClose}>
            <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Volver al motor
          </Button>
        </div>
      )}

      {instance.error_message && (
        <div className="rounded-md border border-rose-500/40 bg-rose-500/10 p-2 text-xs text-rose-700">
          {instance.error_message}
        </div>
      )}

      <InstanceDiagramPanel
        definition={def ? { nodes: def.nodes, edges: def.edges } : null}
        tokens={tokens}
        tasks={tasks}
        events={events}
      />

      <Tabs defaultValue="tokens">
        <TabsList>
          <TabsTrigger value="tokens">Tokens ({tokens.length})</TabsTrigger>
          <TabsTrigger value="tasks">Tareas ({tasks.length})</TabsTrigger>
          <TabsTrigger value="vars">Variables</TabsTrigger>
          <TabsTrigger value="log">Traza ({events.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="tokens" className="space-y-2">
          {tokens.map((t: any) => (
            <div key={t.id} className="rounded border p-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-medium">{nodeLabel(t.node_id)}</span>
                <StatusBadge value={t.status} />
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                Entró: {fmtDate(t.entered_at)} · Salió: {fmtDate(t.exited_at)}
                {t.wake_at && ` · Despierta: ${fmtDate(t.wake_at)}`}
              </div>
            </div>
          ))}
          {!tokens.length && <p className="text-xs text-muted-foreground">Sin tokens.</p>}
        </TabsContent>

        <TabsContent value="tasks" className="space-y-2">
          {tasks.map((tk: any) => (
            <TaskCard key={tk.id} task={tk} nodeLabel={nodeLabel(tk.node_id)} onChanged={inv} />
          ))}
          {!tasks.length && <p className="text-xs text-muted-foreground">Sin tareas.</p>}
        </TabsContent>

        <TabsContent value="vars">
          <pre className="max-h-[60vh] overflow-auto rounded border bg-muted/30 p-2 text-xs">
{JSON.stringify(instance.variables ?? {}, null, 2)}
          </pre>
        </TabsContent>

        <TabsContent value="log">
          <ScrollArea className="max-h-[60vh]">
            <ul className="space-y-1 text-xs">
              {events.map((e: any) => (
                <li key={e.id} className="rounded border p-2">
                  <div className="flex justify-between">
                    <span className="font-medium">{e.event_type}</span>
                    <span className="text-muted-foreground">{fmtDate(e.created_at)}</span>
                  </div>
                  {e.node_id && <div className="text-[11px] text-muted-foreground">Nodo: {nodeLabel(e.node_id)}</div>}
                  {e.payload && Object.keys(e.payload).length > 0 && (
                    <pre className="mt-1 overflow-auto text-[10px] text-muted-foreground">{JSON.stringify(e.payload, null, 2)}</pre>
                  )}
                </li>
              ))}
            </ul>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function TaskCard({ task, nodeLabel, onChanged }: { task: any; nodeLabel: string; onChanged: () => void }) {
  const completeFn = useServerFn(completeTask);
  const claimFn = useServerFn(claimTask);
  const [result, setResult] = useState("{}");
  const [open, setOpen] = useState(false);

  const claimM = useMutation({
    mutationFn: () => claimFn({ data: { taskId: task.id } }),
    onSuccess: () => { toast.success("Tarea asignada"); onChanged(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const completeM = useMutation({
    mutationFn: (r: Record<string, unknown>) => completeFn({ data: { taskId: task.id, result: r } }),
    onSuccess: () => { toast.success("Tarea completada"); setOpen(false); onChanged(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="rounded border p-2 text-xs">
      <div className="flex items-center justify-between">
        <div>
          <span className="font-medium">{nodeLabel}</span>
          <span className="ml-2 text-muted-foreground">[{task.task_kind}]</span>
          {task.lane_role && <Badge variant="outline" className="ml-2">{task.lane_role}</Badge>}
        </div>
        <StatusBadge value={task.status} />
      </div>
      {task.error && <div className="mt-1 text-rose-600">{task.error}</div>}
      {task.task_kind === "human" && (task.status === "pending" || task.status === "in_progress") && (
        <div className="mt-2 flex gap-2">
          {task.status === "pending" && (
            <Button size="sm" variant="outline" onClick={() => claimM.mutate()} disabled={claimM.isPending}>
              Tomar
            </Button>
          )}
          <Button size="sm" onClick={() => setOpen(true)}>
            <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Completar
          </Button>
        </div>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Completar tarea</DialogTitle>
            <DialogDescription>{nodeLabel}</DialogDescription>
          </DialogHeader>
          <Label className="text-xs">Resultado (JSON, se mezcla con variables)</Label>
          <textarea value={result} onChange={(e) => setResult(e.target.value)}
            className="min-h-32 w-full rounded-md border bg-background p-2 font-mono text-xs" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => {
              let parsed: Record<string, unknown> = {};
              try { parsed = JSON.parse(result || "{}"); }
              catch { return toast.error("JSON inválido"); }
              completeM.mutate(parsed);
            }} disabled={completeM.isPending}>Completar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ----------------- START INSTANCE FORM -----------------
type DefVar = {
  id: string; name: string; label: string;
  var_type: string;
  entity_id: string | null; default_value: unknown; is_input: boolean;
};

// Map any var_type (including legacy values like "string"/"number"/"money")
// to a Postgres-style FieldType handled by validateValueForType.
function normalizeVarType(t: string): import("@/lib/field-types").FieldType | "entity" {
  switch (t) {
    case "string": return "text";
    case "number":
    case "money": return "numeric";
    case "datetime": return "timestamp";
    case "entity": return "entity";
    default: return t as import("@/lib/field-types").FieldType;
  }
}

function htmlInputType(t: string): string {
  const n = normalizeVarType(t);
  switch (n) {
    case "integer":
    case "bigint":
    case "numeric":
    case "real":
    case "double precision": return "number";
    case "date": return "date";
    case "time": return "time";
    case "timestamp":
    case "timestamptz": return "datetime-local";
    default: return "text";
  }
}

function coerceValue(t: string, raw: string): unknown {
  const n = normalizeVarType(t);
  const v = raw.trim();
  switch (n) {
    case "integer":
    case "bigint": return /^-?\d+$/.test(v) ? (n === "bigint" ? v : Number(v)) : v;
    case "numeric":
    case "real":
    case "double precision": {
      const num = Number(v.replace(",", "."));
      return Number.isFinite(num) ? num : v;
    }
    case "boolean": return ["true","t","1","yes"].includes(v.toLowerCase());
    case "json":
    case "jsonb": { try { return JSON.parse(v); } catch { return v; } }
    default: return v;
  }
}

function StartInstanceForm({
  definitionId, onCancel, onSubmit, submitting,
}: {
  definitionId: string;
  onCancel: () => void;
  onSubmit: (vars: Record<string, unknown>) => void;
  submitting: boolean;
}) {
  const qc = useQueryClient();
  const getInputsFn = useServerFn(getDefinitionInputs);
  const getDraftFn = useServerFn(getStartDraft);
  const saveDraftFn = useServerFn(saveStartDraft);
  const deleteDraftFn = useServerFn(deleteStartDraft);

  const q = useQuery({
    queryKey: ["engine-def-inputs", definitionId],
    queryFn: () => getInputsFn({ data: { definitionId } }),
  });
  const draftQ = useQuery({
    queryKey: ["engine-draft", definitionId],
    queryFn: () => getDraftFn({ data: { definitionId } }),
  });

  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [draftLoaded, setDraftLoaded] = useState(false);

  // Precargar valores desde el borrador la primera vez que llega
  useEffect(() => {
    if (draftLoaded || !draftQ.data) return;
    const next: Record<string, string> = {};
    for (const [k, v] of Object.entries(draftQ.data.values ?? {})) {
      next[k] = v === null || v === undefined ? "" : String(v);
    }
    setValues((s) => ({ ...next, ...s }));
    setDraftLoaded(true);
  }, [draftQ.data, draftLoaded]);

  const saveDraftMut = useMutation({
    mutationFn: () => saveDraftFn({ data: { definitionId, values } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["engine-draft", definitionId] });
      qc.invalidateQueries({ queryKey: ["engine-my-drafts"] });
      toast.success("Borrador guardado");
      onCancel();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const discardDraftMut = useMutation({
    mutationFn: () => deleteDraftFn({ data: { definitionId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["engine-draft", definitionId] });
      qc.invalidateQueries({ queryKey: ["engine-my-drafts"] });
      setValues({});
      setErrors({});
      toast.success("Borrador descartado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setVal = (name: string, v: string) => {
    setValues((s) => ({ ...s, [name]: v }));
    setErrors((s) => {
      const next = { ...s };
      delete next[name];
      return next;
    });
  };

  if (q.isLoading) return <div className="py-6 text-sm text-muted-foreground">Cargando variables…</div>;
  if (q.error) return <div className="py-2 text-sm text-rose-600">{(q.error as Error).message}</div>;

  const variables = (q.data?.variables ?? []) as DefVar[];
  const entityById = new Map((q.data?.entities ?? []).map((e: { id: string; name: string }) => [e.id, e.name]));
  const hasDraft = !!draftQ.data;
  const startTypeName = (q.data?.startTypeName ?? "") as string;
  // Manual is the default when no type is set; non-manual subtypes (Trigger, Timer, …) skip the input form.
  const isManual = !startTypeName || startTypeName.toLowerCase().includes("manual");

  const parse = (v: DefVar, raw: string | undefined): { ok: true; value: unknown } | { ok: false; error: string } => {
    const trimmed = (raw ?? "").trim();
    if (trimmed === "") {
      if (v.is_input) return { ok: false, error: "Requerido" };
      if (v.default_value !== null && v.default_value !== undefined) return { ok: true, value: v.default_value };
      return { ok: true, value: null };
    }
    const t = normalizeVarType(v.var_type);
    // datetime-local emits "YYYY-MM-DDTHH:MM"; convert to a value Postgres accepts.
    const forValidation = (t === "timestamp" || t === "timestamptz")
      ? trimmed.replace("T", " ")
      : trimmed;
    const err = validateValueForType(forValidation, t);
    if (err) return { ok: false, error: err };
    return { ok: true, value: coerceValue(v.var_type, forValidation) };
  };


  const submit = () => {
    if (!isManual) {
      // Non-manual start: no form. Provide defaults and refuse to launch if
      // any required input has no default (avoids a server 500).
      const out: Record<string, unknown> = {};
      const missing: string[] = [];
      for (const v of variables) {
        if (v.default_value !== null && v.default_value !== undefined) {
          out[v.name] = v.default_value;
        } else if (v.is_input) {
          missing.push(v.name);
        }
      }
      if (missing.length) {
        return toast.error(`Faltan variables requeridas sin valor por defecto: ${missing.join(", ")}`);
      }
      onSubmit(out);
      return;
    }
    const out: Record<string, unknown> = {};
    const errs: Record<string, string> = {};
    for (const v of variables) {
      const r = parse(v, values[v.name]);
      if (!r.ok) errs[v.name] = r.error;
      else if (r.value !== null) out[v.name] = r.value;
    }
    setErrors(errs);
    if (Object.keys(errs).length) return toast.error("Revisa los campos marcados");
    onSubmit(out);
  };

  const draftDate = hasDraft && draftQ.data
    ? new Date(draftQ.data.updatedAt).toLocaleString()
    : null;

  // Live validation: re-evaluate on every render so the Lanzar button stays
  // disabled while any field violates its Postgres type rules.
  const liveErrors: Record<string, string> = {};
  if (isManual) {
    for (const v of variables) {
      const r = parse(v, values[v.name]);
      if (!r.ok) liveErrors[v.name] = r.error;
    }
  } else {
    for (const v of variables) {
      if (v.is_input && (v.default_value === null || v.default_value === undefined)) {
        liveErrors[v.name] = "Requerido (sin valor por defecto)";
      }
    }
  }
  const hasErrors = Object.keys(liveErrors).length > 0;

  return (
    <div className="space-y-3">
      {hasDraft && (
        <div className="flex items-center justify-between rounded-md border border-amber-300/50 bg-amber-50 px-3 py-2 text-xs dark:border-amber-700/40 dark:bg-amber-900/20">
          <span>
            <Badge variant="secondary" className="mr-2">Borrador</Badge>
            Recuperado del {draftDate}
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="h-7"
            onClick={() => discardDraftMut.mutate()}
            disabled={discardDraftMut.isPending}
          >
            Descartar
          </Button>
        </div>
      )}
      {!isManual && (
        <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          Tipo de inicio: <span className="font-medium text-foreground">{startTypeName}</span>. Este evento de inicio no es manual, por lo que no se solicitan variables.
          La instancia se lanzará sin formulario de entrada.
        </div>
      )}
      {isManual && variables.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Esta definición no declara variables. Se lanzará sin datos iniciales.
        </p>
      )}
      {hasErrors && isManual && variables.length > 0 && (
        <div className="rounded-md border border-rose-300/60 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-700/40 dark:bg-rose-900/20 dark:text-rose-300">
          {Object.keys(liveErrors).length === 1
            ? "1 campo con formato inválido o requerido sin valor."
            : `${Object.keys(liveErrors).length} campos con formato inválido o requeridos sin valor.`}
        </div>
      )}
      {isManual && variables.map((v) => {
        const err = errors[v.name] ?? liveErrors[v.name];
        const current = values[v.name] ?? "";
        const norm = normalizeVarType(v.var_type);
        const example = exampleForType(norm);
        const placeholder = v.default_value != null
          ? `Por defecto: ${String(v.default_value)}`
          : example;
        const isBool = norm === "boolean";
        const isJson = norm === "json" || norm === "jsonb";
        const isInt = norm === "integer" || norm === "bigint";
        const isFloat = norm === "numeric" || norm === "real" || norm === "double precision";
        const errCls = err ? "border-rose-500 focus-visible:ring-rose-500" : "";
        return (
          <div key={v.id} className="space-y-1">
            <Label className="text-xs">
              {v.label || v.name}{" "}
              <span className="text-muted-foreground">
                ({v.var_type}{v.var_type === "entity" && v.entity_id ? `: ${entityById.get(v.entity_id) ?? "entidad"}` : ""})
              </span>
              {v.is_input && <span className="ml-1 text-rose-500">*</span>}
            </Label>
            {isBool ? (
              <Select value={current || (v.default_value === true ? "true" : v.default_value === false ? "false" : "")}
                      onValueChange={(val) => setVal(v.name, val)}>
                <SelectTrigger className={`h-8 ${errCls}`} aria-invalid={!!err}><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">true</SelectItem>
                  <SelectItem value="false">false</SelectItem>
                </SelectContent>
              </Select>
            ) : isJson ? (
              <textarea
                value={current}
                placeholder={placeholder}
                onChange={(e) => setVal(v.name, e.target.value)}
                aria-invalid={!!err}
                className={`min-h-20 w-full rounded-md border bg-background p-2 font-mono text-xs ${errCls}`}
              />
            ) : (
              <Input
                type={htmlInputType(v.var_type)}
                step={isInt ? "1" : isFloat ? "any" : undefined}
                min={norm === "integer" ? -2147483648 : undefined}
                max={norm === "integer" ? 2147483647 : undefined}
                inputMode={isInt ? "numeric" : isFloat ? "decimal" : undefined}
                pattern={isInt ? "-?\\d+" : undefined}
                value={current}
                placeholder={placeholder}
                onChange={(e) => setVal(v.name, e.target.value)}
                aria-invalid={!!err}
                className={`h-8 ${errCls}`}
              />
            )}
            {!isBool && example && !err && (
              <p className="text-xs text-muted-foreground">Ejemplo: <span className="font-mono">{example}</span></p>
            )}
            {err && <p className="text-xs text-rose-600">{err}</p>}
          </div>
        );
      })}
      <DialogFooter className="pt-2 gap-2">
        <Button variant="outline" onClick={onCancel}>Cancelar</Button>
        {isManual && variables.length > 0 && (
          <Button
            variant="secondary"
            onClick={() => saveDraftMut.mutate()}
            disabled={saveDraftMut.isPending}
            title="Guarda los valores actuales sin lanzar la instancia"
          >
            Guardar borrador
          </Button>
        )}
        <Button
          onClick={submit}
          disabled={submitting || hasErrors}
          title={hasErrors ? "Corrige los errores del formulario para lanzar" : undefined}
        >
          <Play className="mr-1 h-3.5 w-3.5" /> Lanzar
        </Button>
      </DialogFooter>
    </div>
  );
}
