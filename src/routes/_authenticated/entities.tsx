import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { supabase } from "@/integrations/supabase/client";
import { STALE } from "@/lib/query-keys";
import { useAuth } from "@/lib/auth-context";
import { useClient } from "@/lib/client-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Building2, Plus, Pencil, Trash2, Check, Users, Workflow, ExternalLink } from "lucide-react";
import { useSelectedEntity } from "@/lib/selected-entity";
import { EntityPositionsDialog } from "@/components/entity-positions-dialog";

export const Route = createFileRoute("/_authenticated/entities")({
  component: EntitiesPage,
});

type Entity = {
  id: string;
  name: string;
  description: string | null;
  mission: string | null;
  vision: string | null;
  strategy: string | null;
  status: string;
};

function EntitiesPage() {
  const { canEdit } = useAuth();
  const { withTenant } = useClient();
  const { entity: selected, setEntity } = useSelectedEntity();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Entity | null>(null);
  const [form, setForm] = useState({
    name: "", description: "",
    mission: "", vision: "", strategy: "",
  });
  const [positionsFor, setPositionsFor] = useState<Entity | null>(null);

  const entities = useQuery({
    queryKey: ["entities"],
    staleTime: STALE.REFERENCE,
    queryFn: async () => {
      const { data, error } = await supabase.from("entities").select("id, name, description, mission, vision, strategy, status").order("name");
      if (error) throw error;
      return (data ?? []) as Entity[];
    },
  });

  const macros = useQuery({
    queryKey: ["entities", "all-macros"],
    staleTime: STALE.REFERENCE,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("macroprocesses")
        .select("id,name,code,entity_id")
        .order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string; code: string; entity_id: string | null }[];
    },
  });


  const startCreate = () => {
    setEditing(null);
    setForm({ name: "", description: "", mission: "", vision: "", strategy: "" });
    setOpen(true);
  };
  const startEdit = (e: Entity) => {
    setEditing(e);
    setForm({
      name: e.name,
      description: e.description ?? "",
      mission: e.mission ?? "",
      vision: e.vision ?? "",
      strategy: e.strategy ?? "",
    });
    setOpen(true);
  };

  const save = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!canEdit) { toast.error("Sin permisos"); return; }
    const payload = {
      name: form.name,
      description: form.description || null,
      mission: form.mission || null,
      vision: form.vision || null,
      strategy: form.strategy || null,
    };
    const { error } = editing
      ? await supabase.from("entities").update(payload).eq("id", editing.id)
      : await supabase.from("entities").insert(withTenant(payload));
    if (error) { toast.error(error.message); return; }
    toast.success("Guardado");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["entities"] });
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("entities").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Eliminado");
    qc.invalidateQueries({ queryKey: ["entities"] });
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-6 py-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Building2 className="h-6 w-6" />
          <h1 className="font-display text-2xl font-semibold">Gestión de Entidades</h1>
        </div>
        {canEdit && (
          <Button onClick={startCreate} size="sm"><Plus className="mr-2 h-4 w-4" /> Nueva entidad</Button>
        )}
      </div>

      <div className="rounded-xl border bg-card">
        <ul className="divide-y">
          {(entities.data ?? []).map((e) => {
            const isSelected = selected?.id === e.id;
            const entityMacro = (macros.data ?? []).find((m) => m.entity_id === e.id);
            const openMacroDiagram = () => {
              setEntity({ id: e.id, name: e.name });
              navigate({ to: "/modeler", search: (prev: Record<string, unknown>) => ({ ...prev, type: "macroprocesos" as const }) });
            };
            return (
            <li key={e.id} className={`flex items-start justify-between gap-4 px-5 py-4 ${isSelected ? "bg-primary/5" : ""}`}>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium">{e.name}</h3>
                  <Badge variant="outline" className="text-[10px]">{e.status}</Badge>
                  {isSelected && <Badge className="text-[10px]">Seleccionada</Badge>}
                </div>
                {e.description && <p className="mt-1 text-sm text-muted-foreground">{e.description}</p>}
                <div className="mt-2 flex items-center gap-2 text-xs">
                  <Workflow className="h-3.5 w-3.5 text-muted-foreground" />
                  {entityMacro ? (
                    <>
                      <span className="text-muted-foreground">Macroproceso:</span>
                      <span className="font-mono text-[11px]">{entityMacro.code}</span>
                      <span>· {entityMacro.name}</span>
                      <Button type="button" variant="ghost" size="sm" className="h-6 gap-1 px-2" onClick={openMacroDiagram}>
                        <ExternalLink className="h-3 w-3" /> Ir al diagrama
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className="text-muted-foreground italic">Sin macroproceso asociado.</span>
                      <Button type="button" variant="outline" size="sm" className="h-6 gap-1 px-2" onClick={openMacroDiagram}>
                        <ExternalLink className="h-3 w-3" /> Seleccionar diagrama de macroprocesos
                      </Button>
                    </>
                  )}
                </div>
              </div>
              <div className="flex gap-1">
                <Button
                  variant={isSelected ? "default" : "outline"}
                  size="sm"
                  onClick={() => { setEntity(isSelected ? null : { id: e.id, name: e.name }); toast.success(isSelected ? "Selección quitada" : `Entidad seleccionada: ${e.name}`); }}
                >
                  <Check className="mr-1.5 h-3.5 w-3.5" />
                  {isSelected ? "Seleccionada" : "Seleccionar"}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setPositionsFor(e)}>
                  <Users className="mr-1.5 h-3.5 w-3.5" /> Cargos
                </Button>
                {canEdit && (
                  <>
                    <Button variant="ghost" size="icon" onClick={() => startEdit(e)} aria-label="Editar"><Pencil className="h-4 w-4" /></Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label="Eliminar"><Trash2 className="h-4 w-4" /></Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>¿Eliminar entidad?</AlertDialogTitle>
                          <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => remove(e.id)}>Eliminar</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </>
                )}
              </div>
            </li>
            );
          })}
          {!entities.isLoading && (entities.data ?? []).length === 0 && (
            <li className="px-5 py-6 text-sm text-muted-foreground">No hay entidades aún.</li>
          )}
        </ul>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar entidad" : "Nueva entidad"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={save} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nombre</Label>
              <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="font-bold text-accent-foreground" />
            </div>

            <MissionStrategyVisionDiagram
              mission={form.mission}
              strategy={form.strategy}
              vision={form.vision}
            />



            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit">Guardar</Button>
            </DialogFooter>

            <div className="space-y-1.5">
              <Label>Descripción</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
            </div>
            <div className="space-y-1.5">
              <Label>Misión <span className="text-xs font-normal text-muted-foreground">(Propósito de la Entidad)</span></Label>
              <Textarea value={form.mission} onChange={(e) => setForm({ ...form, mission: e.target.value })} rows={2} />
            </div>
            <div className="space-y-1.5">
              <Label>Estrategia <span className="text-xs font-normal text-muted-foreground">(Plan de acción para conseguir la visión y cumplir la misión)</span></Label>
              <Textarea value={form.strategy} onChange={(e) => setForm({ ...form, strategy: e.target.value })} rows={3} />
            </div>
            <div className="space-y-1.5">
              <Label>Visión <span className="text-xs font-normal text-muted-foreground">(Pretensiones futuras)</span></Label>
              <Textarea value={form.vision} onChange={(e) => setForm({ ...form, vision: e.target.value })} rows={2} />
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {positionsFor && (
        <EntityPositionsDialog
          open={!!positionsFor}
          onOpenChange={(o) => { if (!o) setPositionsFor(null); }}
          entityId={positionsFor.id}
          entityName={positionsFor.name}
        />
      )}
    </div>
  );
}

function MissionStrategyVisionDiagram({
  mission, strategy, vision,
}: { mission: string; strategy: string; vision: string }) {
  const actions = strategy
    .split(/\r?\n|·|•|;/)
    .map((s) => s.trim())
    .filter(Boolean);

  return (
    <div className="rounded-lg border bg-muted/30 p-4">
      <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Diagrama Misión → Estrategia → Visión
      </div>
      <div className="flex items-stretch gap-2">
        {/* Entrada: Misión */}
        <div className="flex w-44 shrink-0 flex-col rounded-md border-2 border-primary/50 bg-card p-3">
          <div className="text-[10px] font-bold uppercase tracking-wide text-primary">Entrada</div>
          <div className="text-sm font-semibold">Misión</div>
          <div className="mt-1 text-xs text-muted-foreground whitespace-pre-wrap break-words">
            {mission || <span className="italic">Sin definir</span>}
          </div>
        </div>

        {/* Estrategia: flecha con acciones */}
        <div className="relative flex flex-1 items-center">
          <div
            className="flex w-full flex-col justify-center bg-accent/40 px-4 py-3 text-center"
            style={{
              clipPath: "polygon(0 20%, 88% 20%, 88% 0, 100% 50%, 88% 100%, 88% 80%, 0 80%)",
              minHeight: 110,
            }}
          >
            <div className="text-[10px] font-bold uppercase tracking-wide text-accent-foreground/80">
              Estrategia · Plan de acción
            </div>
            {actions.length > 0 ? (
              <ul className="mt-1 space-y-0.5 pr-10 text-xs text-foreground">
                {actions.map((a, i) => (
                  <li key={i} className="truncate">• {a}</li>
                ))}
              </ul>
            ) : (
              <div className="mt-1 pr-10 text-xs italic text-muted-foreground">
                Sin acciones definidas
              </div>
            )}
          </div>
        </div>

        {/* Salida: Visión */}
        <div className="flex w-44 shrink-0 flex-col rounded-md border-2 border-emerald-500/60 bg-card p-3">
          <div className="text-[10px] font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">Salida</div>
          <div className="text-sm font-semibold">Visión</div>
          <div className="mt-1 text-xs text-muted-foreground whitespace-pre-wrap break-words">
            {vision || <span className="italic">Sin definir</span>}
          </div>
        </div>
      </div>
      <div className="mt-2 text-[10px] text-muted-foreground">
        Tip: separa cada acción de la estrategia en una línea para verlas dentro de la flecha.
      </div>
    </div>
  );
}
