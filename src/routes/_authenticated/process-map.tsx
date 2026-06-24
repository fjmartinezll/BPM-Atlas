import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useSelectedEntity } from "@/lib/selected-entity";
import { Button } from "@/components/ui/button";
import { Plus, Map as MapIcon, ArrowRight } from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/process-map")({
  component: ProcessMapPage,
});

type Category = "control" | "estrategico" | "misional" | "transversal" | "apoyo";

type Macro = {
  id: string;
  code: string;
  name: string;
  category: Category;
  color: string | null;
  position: number;
  entity_id: string | null;
};

type Entity = {
  id: string;
  name: string;
  stakeholder_inputs: string | null;
  stakeholder_outputs: string | null;
};

const CATEGORY_META: Record<Category, { label: string; bg: string; chip: string; text: string }> = {
  control:      { label: "Control",       bg: "bg-sky-50 dark:bg-sky-950/30",      chip: "bg-sky-500",      text: "text-sky-950 dark:text-sky-50" },
  estrategico:  { label: "Estratégicos",  bg: "bg-emerald-50 dark:bg-emerald-950/30", chip: "bg-emerald-500", text: "text-emerald-950 dark:text-emerald-50" },
  misional:     { label: "Misionales",    bg: "bg-fuchsia-50 dark:bg-fuchsia-950/30", chip: "bg-fuchsia-600", text: "text-fuchsia-950 dark:text-fuchsia-50" },
  transversal:  { label: "Transversales", bg: "bg-violet-50 dark:bg-violet-950/30", chip: "bg-violet-600",  text: "text-violet-950 dark:text-violet-50" },
  apoyo:        { label: "Apoyo",         bg: "bg-pink-50 dark:bg-pink-950/30",    chip: "bg-pink-500",     text: "text-pink-950 dark:text-pink-50" },
};

const ORDER: Category[] = ["control", "estrategico", "misional", "transversal", "apoyo"];

function ProcessMapPage() {
  const { canEdit } = useAuth();
  const { entity: selectedEntity_ } = useSelectedEntity();
  const [entityFilter, setEntityFilter] = useState<string>(selectedEntity_?.id ?? "__all__");
  useEffect(() => { setEntityFilter(selectedEntity_?.id ?? "__all__"); }, [selectedEntity_?.id]);

  const entitiesQ = useQuery({
    queryKey: ["entities-map"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("entities")
        .select("id,name,stakeholder_inputs,stakeholder_outputs")
        .order("name");
      if (error) throw error;
      return (data ?? []) as Entity[];
    },
  });

  const macrosQ = useQuery({
    queryKey: ["macros-map"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("macroprocesses")
        .select("id,code,name,category,color,position,entity_id")
        .order("position", { ascending: true })
        .order("code", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Macro[];
    },
  });

  const filteredMacros = useMemo(() => {
    const list = macrosQ.data ?? [];
    if (entityFilter === "__all__") return list;
    if (entityFilter === "__none__") return list.filter((m) => !m.entity_id);
    return list.filter((m) => m.entity_id === entityFilter);
  }, [macrosQ.data, entityFilter]);

  const byCat = useMemo(() => {
    const acc: Record<Category, Macro[]> = {
      control: [], estrategico: [], misional: [], transversal: [], apoyo: [],
    };
    for (const m of filteredMacros) acc[m.category]?.push(m);
    return acc;
  }, [filteredMacros]);

  const selectedEntity = entitiesQ.data?.find((e) => e.id === entityFilter);
  const inputsText = selectedEntity?.stakeholder_inputs?.trim() || "Necesidades y expectativas de los grupos de interés y del entorno";
  const outputsText = selectedEntity?.stakeholder_outputs?.trim() || "Satisfacción de los grupos de interés";

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <MapIcon className="h-6 w-6" />
          <div>
            <h1 className="font-display text-2xl font-semibold">Mapa de macroprocesos</h1>
            <p className="text-sm text-muted-foreground">Vista por categoría: control, estratégicos, misionales, transversales y apoyo.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={entityFilter} onValueChange={setEntityFilter}>
            <SelectTrigger className="w-[220px]"><SelectValue placeholder="Entidad" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todas las entidades</SelectItem>
              <SelectItem value="__none__">Sin entidad</SelectItem>
              {(entitiesQ.data ?? []).map((e) => (
                <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {canEdit && (
            <Button asChild size="sm">
              <Link to="/hierarchy/$level/$id" params={{ level: "macroprocesses", id: "new" }} search={{ parent: "" }}>
                <Plus className="mr-2 h-4 w-4" /> Macroproceso
              </Link>
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[200px_1fr_200px]">
        {/* Inputs */}
        <aside className="hidden lg:flex flex-col justify-center">
          <div className="rounded-xl border-2 border-dashed bg-card p-4 text-center shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Entradas</p>
            <p className="mt-2 text-sm leading-snug">{inputsText}</p>
            <ArrowRight className="mx-auto mt-3 h-5 w-5 text-muted-foreground" />
          </div>
        </aside>

        {/* Bands */}
        <div className="space-y-3 rounded-2xl border-2 bg-background p-3">
          {ORDER.map((cat) => {
            const items = byCat[cat];
            if (cat !== "control" && items.length === 0 && entityFilter !== "__all__") return null;
            const meta = CATEGORY_META[cat];
            return (
              <section key={cat} className={`rounded-xl border ${meta.bg} p-4`}>
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`inline-block h-2.5 w-2.5 rounded-full ${meta.chip}`} />
                    <h2 className={`font-display text-sm font-semibold uppercase tracking-wider ${meta.text}`}>
                      Macroprocesos {meta.label.toLowerCase()}
                    </h2>
                  </div>
                  {canEdit && (
                    <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-xs">
                      <Link to="/hierarchy/$level/$id" params={{ level: "macroprocesses", id: "new" }} search={{ parent: "" }}>
                        <Plus className="mr-1 h-3.5 w-3.5" /> Añadir
                      </Link>
                    </Button>
                  )}
                </div>
                {items.length === 0 ? (
                  <p className="rounded-md border border-dashed bg-background/60 px-3 py-4 text-center text-xs text-muted-foreground">
                    Sin macroprocesos en esta banda.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {items.map((m) => (
                      <Link
                        key={m.id}
                        to="/hierarchy/$level/$id"
                        params={{ level: "macroprocesses", id: m.id }}
                        search={{ parent: "" }}
                        className={`group flex min-w-[160px] flex-1 basis-[180px] flex-col rounded-lg border bg-card px-3 py-2.5 shadow-sm transition hover:shadow-md hover:-translate-y-0.5 ${meta.text}`}
                        style={m.color ? { borderLeftColor: m.color, borderLeftWidth: 4 } : undefined}
                      >
                        <span className="font-mono text-[10px] text-muted-foreground">{m.code}</span>
                        <span className="text-sm font-medium leading-tight group-hover:underline">{m.name}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>

        {/* Outputs */}
        <aside className="hidden lg:flex flex-col justify-center">
          <div className="rounded-xl border-2 border-dashed bg-card p-4 text-center shadow-sm">
            <ArrowRight className="mx-auto mb-3 h-5 w-5 text-muted-foreground" />
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Salidas</p>
            <p className="mt-2 text-sm leading-snug">{outputsText}</p>
          </div>
        </aside>
      </div>

      {macrosQ.isLoading && <p className="text-center text-sm text-muted-foreground">Cargando…</p>}
    </div>
  );
}
