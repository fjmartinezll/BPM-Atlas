import { useQuery } from "@tanstack/react-query";
import { STALE, queryKeys } from "@/lib/query-keys";
import { supabase } from "@/integrations/supabase/client";
import { buildPositionTree, type OrgPosition } from "@/lib/org";
import { ChevronRight, ChevronDown, Briefcase, User, Building2 } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/lib/auth-context";

type PositionWithMembers = OrgPosition & { members: { id: string; full_name: string; is_primary: boolean }[] };

type Props = {
  entityId: string;
  entityName: string;
};

function PositionNode({ position, depth }: { position: PositionWithMembers; depth: number }) {
  const [open, setOpen] = useState(depth < 1);
  const hasChildren = (position.children ?? []).length > 0;
  const hasMembers = position.members.length > 0;

  return (
    <div>
      <div
        className="flex items-center gap-1.5 py-1.5 hover:bg-muted/50 rounded px-1 cursor-pointer"
        style={{ paddingLeft: `${depth * 16 + 4}px` }}
        onClick={() => setOpen(!open)}
      >
        {hasChildren || hasMembers ? (
          open ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <span className="w-3.5" />
        )}
        <Briefcase className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="text-sm font-medium">{position.name}</span>
        {hasMembers && (
          <span className="text-[10px] text-muted-foreground">({position.members.length})</span>
        )}
      </div>
      {open && (
        <div>
          {position.members.map((m) => (
            <div
              key={m.id}
              className="flex items-center gap-1.5 py-1 rounded px-1 text-sm text-muted-foreground"
              style={{ paddingLeft: `${(depth + 1) * 16 + 4}px` }}
            >
              <User className="h-3 w-3 shrink-0" />
              <span>{m.full_name}</span>
              {m.is_primary && (
                <span className="text-[10px] font-semibold uppercase text-primary">Principal</span>
              )}
            </div>
          ))}
          {hasChildren && position.children!.map((child) => (
            <PositionNode key={child.id} position={child as PositionWithMembers} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export function OrgChartView({ entityId, entityName }: Props) {
  const { language } = useAuth();

  const chart = useQuery({
    queryKey: ["org-chart", entityId],
    staleTime: STALE.REFERENCE,
    queryFn: async () => {
      const { data: positions, error: posErr } = await supabase
        .from("entity_positions")
        .select("id, entity_id, parent_id, name, label, description, sort_order")
        .eq("entity_id", entityId)
        .order("sort_order")
        .order("name");
      if (posErr) throw posErr;

      const posRows = (positions ?? []) as Array<OrgPosition & { label: Record<string, string>; description: Record<string, string> }>;

      const tree = buildPositionTree(posRows);

      const allPositionIds = posRows.map((p) => p.id);
      let assignments: { id: string; position_id: string; member_id: string; is_primary: boolean; full_name: string }[] = [];

      if (allPositionIds.length > 0) {
        const { data: ass, error: assErr } = await supabase
          .from("org_position_assignments")
          .select("id, position_id, member_id, is_primary")
          .in("position_id", allPositionIds);
        if (assErr) throw assErr;

        const assRows = ass ?? [];
        if (assRows.length > 0) {
          const memberIds = [...new Set(assRows.map((a) => a.member_id))];
          const { data: members } = await supabase
            .from("org_members")
            .select("id, full_name")
            .in("id", memberIds);
          const memberMap = new Map((members ?? []).map((m) => [m.id, m.full_name]));
          assignments = assRows.map((a) => ({
            ...a,
            full_name: memberMap.get(a.member_id) ?? "—",
          }));
        }
      }

      const assignMap = new Map<string, { id: string; full_name: string; is_primary: boolean }[]>();
      for (const a of assignments) {
        if (!assignMap.has(a.position_id)) assignMap.set(a.position_id, []);
        assignMap.get(a.position_id)!.push({ id: a.member_id, full_name: a.full_name, is_primary: a.is_primary });
      }

      function attachMembers(nodes: OrgPosition[]): PositionWithMembers[] {
        return nodes.map((n) => ({
          ...n,
          members: assignMap.get(n.id) ?? [],
          label: n.label ?? {},
          description: n.description ?? {},
          children: n.children ? attachMembers(n.children) : [],
        }));
      }

      return attachMembers(tree);
    },
  });

  return (
    <div className="rounded-xl border bg-card p-4">
      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
        <Building2 className="h-4 w-4" /> Organigrama · {entityName}
      </h3>
      {chart.isLoading ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : (chart.data ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin cargos definidos para esta entidad.</p>
      ) : (
        chart.data!.map((root) => (
          <PositionNode key={root.id} position={root} depth={0} />
        ))
      )}
    </div>
  );
}
