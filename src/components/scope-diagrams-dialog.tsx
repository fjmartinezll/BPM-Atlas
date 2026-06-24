import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { ArrowRightLeft, ExternalLink, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useClient, type Environment } from "@/lib/client-context";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Label } from "@/components/ui/label";

type Mode = "view" | "migrate";

type DiagramRow = {
  id: string;
  name: string;
  level: string;
  diagram_type: string;
  node_id: string;
  updated_at: string;
};

export function ScopeDiagramsDialog({
  open,
  onOpenChange,
  initialMode = "view",
  clientId,
  environment,
  entityId,
  entityName,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialMode?: Mode;
  clientId: string | null;
  environment: Environment;
  entityId: string | null;
  entityName: string | null;
}) {
  const qc = useQueryClient();
  const { clients } = useClient();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [migrating, setMigrating] = useState(false);

  // Migration target
  const [targetClient, setTargetClient] = useState<string>(clientId ?? "");
  const [targetEnv, setTargetEnv] = useState<Environment>(environment);
  const [targetEntity, setTargetEntity] = useState<string>(entityId ?? "__none__");

  const diagramsQ = useQuery({
    queryKey: ["scope-diagrams", clientId, environment],
    enabled: open && !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("process_diagrams")
        .select("id,name,level,diagram_type,node_id,updated_at,entity_id,client_id,environment")
        .eq("client_id", clientId!)
        .eq("environment", environment)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as DiagramRow[];
    },
  });

  // Entities available in target client/env
  const targetEntitiesQ = useQuery({
    queryKey: ["scope-target-entities", targetClient, targetEnv],
    enabled: open && mode === "migrate" && !!targetClient,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("entities")
        .select("id,name")
        .eq("client_id", targetClient)
        .eq("environment", targetEnv)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const allSelected = useMemo(
    () => (diagramsQ.data ?? []).length > 0 && selected.size === (diagramsQ.data ?? []).length,
    [diagramsQ.data, selected],
  );

  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set((diagramsQ.data ?? []).map((d) => d.id)));
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const sameScope =
    targetClient === clientId &&
    targetEnv === environment &&
    (targetEntity === "__none__" ? !entityId : targetEntity === entityId);

  const runMigration = async () => {
    if (selected.size === 0) {
      toast.error("Selecciona al menos un diagrama");
      return;
    }
    if (sameScope) {
      toast.error("El destino coincide con el ámbito actual");
      return;
    }
    setMigrating(true);
    try {
      const { error } = await supabase
        .from("process_diagrams")
        .update({
          client_id: targetClient,
          environment: targetEnv,
          entity_id: targetEntity === "__none__" ? null : targetEntity,
        })
        .in("id", Array.from(selected));
      if (error) throw error;
      toast.success(`${selected.size} diagrama(s) migrado(s)`);
      setSelected(new Set());
      await qc.invalidateQueries({ queryKey: ["scope-diagrams"] });
      setMode("view");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error en la migración");
    } finally {
      setMigrating(false);
    }
  };

  const clientName = clients.find((c) => c.id === clientId)?.name ?? "—";
  const targetClientName = clients.find((c) => c.id === targetClient)?.name ?? "—";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {mode === "view" ? "Diagramas del ámbito" : "Migrar diagramas"}
          </DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-1.5 text-xs">
            <Badge variant="outline">Cliente: {clientName}</Badge>
            <Badge variant="outline">Entidad: {entityName ?? "(sin entidad)"}</Badge>
            <Badge variant="outline">Entorno: {environment === "produccion" ? "Producción" : "Pruebas"}</Badge>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-xs text-muted-foreground">
              {diagramsQ.isLoading
                ? "Cargando…"
                : `${diagramsQ.data?.length ?? 0} diagrama(s)`}
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" onClick={toggleAll} disabled={!diagramsQ.data?.length}>
                {allSelected ? "Desmarcar" : "Seleccionar todo"}
              </Button>
              {mode === "view" ? (
                <Button size="sm" variant="outline" onClick={() => setMode("migrate")}>
                  <ArrowRightLeft className="mr-1 h-3.5 w-3.5" /> Migrar…
                </Button>
              ) : (
                <Button size="sm" variant="ghost" onClick={() => setMode("view")}>
                  Cancelar migración
                </Button>
              )}
            </div>
          </div>

          <ScrollArea className="h-72 rounded-md border">
            <div className="divide-y">
              {(diagramsQ.data ?? []).map((d) => (
                <div key={d.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                  <Checkbox
                    checked={selected.has(d.id)}
                    onCheckedChange={() => toggleOne(d.id)}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{d.name || "(sin nombre)"}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {d.level} · {d.diagram_type}
                    </div>
                  </div>
                  <Button asChild size="sm" variant="ghost">
                    <Link
                      to="/modeler"
                      search={{
                        level: d.level as never,
                        id: d.node_id,
                        type: d.diagram_type as never,
                      }}
                      onClick={() => onOpenChange(false)}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </div>
              ))}
              {!diagramsQ.isLoading && (diagramsQ.data?.length ?? 0) === 0 && (
                <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                  No hay diagramas en este ámbito.
                </div>
              )}
            </div>
          </ScrollArea>

          {mode === "migrate" && (
            <div className="space-y-2 rounded-md border bg-muted/30 p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Destino
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <div className="space-y-1">
                  <Label className="text-xs">Cliente</Label>
                  <Select value={targetClient} onValueChange={setTargetClient}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Cliente" />
                    </SelectTrigger>
                    <SelectContent>
                      {clients.map((c) => (
                        <SelectItem key={c.id} value={c.id} className="text-xs">
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Entidad</Label>
                  <Select value={targetEntity} onValueChange={setTargetEntity}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Entidad" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__" className="text-xs italic">
                        Sin entidad
                      </SelectItem>
                      {(targetEntitiesQ.data ?? []).map((e) => (
                        <SelectItem key={e.id} value={e.id} className="text-xs">
                          {e.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Entorno</Label>
                  <Select value={targetEnv} onValueChange={(v) => setTargetEnv(v as Environment)}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="produccion" className="text-xs">Producción</SelectItem>
                      <SelectItem value="pruebas" className="text-xs">Pruebas</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Se moverán {selected.size} diagrama(s) a:{" "}
                <strong>{targetClientName}</strong> ·{" "}
                {targetEntity === "__none__"
                  ? "(sin entidad)"
                  : targetEntitiesQ.data?.find((e) => e.id === targetEntity)?.name ?? "—"}{" "}
                · {targetEnv === "produccion" ? "Producción" : "Pruebas"}
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cerrar</Button>
          {mode === "migrate" && (
            <Button onClick={runMigration} disabled={migrating || selected.size === 0 || sameScope}>
              {migrating && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
              Migrar {selected.size > 0 ? `(${selected.size})` : ""}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
