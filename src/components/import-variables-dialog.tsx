import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { STALE } from "@/lib/query-keys";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Download } from "lucide-react";
import type { VarType, VarsScope } from "@/lib/bpm";

type ScopeRow = {
  client_id: string | null;
  environment: string;
  entity_id: string | null;
  count: number;
  client_name?: string;
  entity_name?: string;
};

export function ImportVariablesDialog({
  open,
  onOpenChange,
  scope,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  scope: VarsScope;
}) {
  const qc = useQueryClient();

  const scopesQuery = useQuery({
    queryKey: ["process-variables-scopes", scope.clientId, scope.environment, scope.entityId, open],
    staleTime: STALE.REFERENCE,
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("process_variables")
        .select("client_id, environment, entity_id");
      if (error) throw error;
      const map = new Map<string, ScopeRow>();
      for (const r of data ?? []) {
        const k = `${r.client_id}|${r.environment}|${r.entity_id ?? ""}`;
        const cur = map.get(k);
        if (cur) cur.count += 1;
        else map.set(k, { client_id: r.client_id, environment: r.environment, entity_id: r.entity_id, count: 1 });
      }
      const curKey = `${scope.clientId}|${scope.environment}|${scope.entityId ?? ""}`;
      const arr = [...map.entries()].filter(([k]) => k !== curKey).map(([, v]) => v);
      const clientIds = [...new Set(arr.map((s) => s.client_id).filter(Boolean) as string[])];
      const entityIds = [...new Set(arr.map((s) => s.entity_id).filter(Boolean) as string[])];
      const [{ data: cls }, { data: ents }] = await Promise.all([
        clientIds.length ? supabase.from("clients").select("id,name").in("id", clientIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
        entityIds.length ? supabase.from("entities").select("id,name").in("id", entityIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      ]);
      const cMap = new Map((cls ?? []).map((c) => [c.id, c.name]));
      const eMap = new Map((ents ?? []).map((e) => [e.id, e.name]));
      return arr
        .map((s) => ({
          ...s,
          client_name: s.client_id ? cMap.get(s.client_id) ?? "?" : "—",
          entity_name: s.entity_id ? eMap.get(s.entity_id) ?? "?" : "—",
        }))
        .sort((a, b) => (a.client_name! + a.environment).localeCompare(b.client_name! + b.environment));
    },
  });

  const importFrom = async (src: ScopeRow) => {
    if (!scope.clientId) return toast.error("Falta el cliente activo");
    let q = supabase
      .from("process_variables")
      .select("name,label,var_type,description")
      .eq("environment", src.environment);
    q = src.client_id ? q.eq("client_id", src.client_id) : q.is("client_id", null);
    q = src.entity_id ? q.eq("entity_id", src.entity_id) : q.is("entity_id", null);
    const { data, error } = await q;
    if (error) return toast.error(error.message);

    // Get existing names in current scope
    let exQ = supabase
      .from("process_variables")
      .select("name")
      .eq("client_id", scope.clientId)
      .eq("environment", scope.environment);
    exQ = scope.entityId ? exQ.eq("entity_id", scope.entityId) : exQ.is("entity_id", null);
    const { data: existingData } = await exQ;
    const existing = new Set((existingData ?? []).map((r) => r.name.trim().toLowerCase()));

    const newOnes = (data ?? []).filter((r) => !existing.has((r.name ?? "").trim().toLowerCase()));
    if (newOnes.length === 0) {
      toast.info("No hay variables nuevas para importar (todas existen ya)");
      onOpenChange(false);
      return;
    }

    for (const r of newOnes) {
      const payload = {
        client_id: scope.clientId,
        environment: scope.environment,
        entity_id: scope.entityId,
        owner_kind: null,
        owner_id: null,
        name: r.name.trim(),
        label: (r.label ?? "").trim() || r.name.trim(),
        description: ((r as unknown as { description?: string | null }).description ?? null) as string | null,
        var_type: r.var_type,
      };
      const { error: insertErr } = await supabase.from("process_variables").insert(payload);
      if (insertErr) return toast.error(insertErr.message);
    }

    toast.success(`${newOnes.length} variable(s) importada(s)`);
    qc.invalidateQueries({ queryKey: ["process-variables"] });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Importar variables de otro scope</DialogTitle>
        </DialogHeader>
        <div className="max-h-72 overflow-auto">
          {scopesQuery.isLoading && <div className="px-3 py-4 text-xs text-muted-foreground">Cargando…</div>}
          {!scopesQuery.isLoading && (scopesQuery.data ?? []).length === 0 && (
            <div className="px-3 py-4 text-xs italic text-muted-foreground">No hay otros catálogos.</div>
          )}
          {(scopesQuery.data ?? []).map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={() => importFrom(s)}
              className="block w-full border-b px-3 py-2 text-left text-xs hover:bg-muted/50"
            >
              <div className="font-medium">{s.client_name} · {s.environment} · {s.entity_name}</div>
              <div className="text-muted-foreground">{s.count} variable(s)</div>
            </button>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
