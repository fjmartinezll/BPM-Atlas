import { useQuery } from "@tanstack/react-query";
import { STALE } from "@/lib/query-keys";
import { supabase } from "@/integrations/supabase/client";
import { buildUnitTree, type OrgUnit } from "@/lib/org";
import { ChevronRight, ChevronDown, Building2 } from "lucide-react";
import { useState, type ReactNode } from "react";

type Props = {
  entityId: string;
  entityName: string;
};

function TreeNode({ node, depth }: { node: OrgUnit; depth: number }) {
  const [open, setOpen] = useState(depth < 1);
  const hasChildren = (node.children ?? []).length > 0;

  return (
    <div>
      <div
        className="flex items-center gap-1.5 py-1 hover:bg-muted/50 rounded px-1 cursor-pointer"
        style={{ paddingLeft: `${depth * 16 + 4}px` }}
        onClick={() => setOpen(!open)}
      >
        {hasChildren ? (
          open ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <span className="w-3.5" />
        )}
        <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="text-sm">{node.name}</span>
        {node.status && (
          <span className="text-[10px] text-muted-foreground ml-1">{node.status}</span>
        )}
      </div>
      {open && hasChildren && (
        <div>
          {node.children!.map((child) => (
            <TreeNode key={child.id} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export function OrgUnitTree({ entityId, entityName }: Props) {
  const units = useQuery({
    queryKey: ["org-unit-tree", entityId],
    staleTime: STALE.REFERENCE,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("entities")
        .select("id, name, description, parent_id, status")
        .order("name");
      if (error) throw error;
      return buildUnitTree((data ?? []) as OrgUnit[]);
    },
  });

  return (
    <div className="rounded-xl border bg-card p-4">
      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
        <Building2 className="h-4 w-4" /> Árbol de unidades · {entityName}
      </h3>
      {units.isLoading ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : (units.data ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin sub-unidades.</p>
      ) : (
        (units.data ?? []).map((root) => (
          <TreeNode key={root.id} node={root} depth={0} />
        ))
      )}
    </div>
  );
}
