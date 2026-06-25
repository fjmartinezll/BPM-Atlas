export type Environment = "produccion" | "pruebas";

export type OrgUnit = {
  id: string;
  name: string;
  description: string | null;
  parent_id: string | null;
  status: string;
  children?: OrgUnit[];
};

export type OrgPosition = {
  id: string;
  entity_id: string;
  parent_id: string | null;
  name: string;
  label: Record<string, string>;
  description: Record<string, string>;
  sort_order: number;
  children?: OrgPosition[];
};

export type OrgMember = {
  id: string;
  entity_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  language: string;
  user_id: string | null;
  client_id: string;
  environment: string;
  created_at: string;
  updated_at: string;
};

export type PositionAssignment = {
  id: string;
  position_id: string;
  member_id: string;
  start_date: string;
  end_date: string | null;
  is_primary: boolean;
  client_id: string;
  environment: string;
  created_at: string;
  position_name?: string;
  member_name?: string;
};

export type Responsibility = {
  id: string;
  position_id: string;
  name: string;
  label: Record<string, string>;
  description: Record<string, string>;
  sort_order: number;
  client_id: string;
  environment: string;
  created_at: string;
  updated_at: string;
};

export function buildUnitTree(units: OrgUnit[]): OrgUnit[] {
  const map = new Map<string, OrgUnit>();
  const roots: OrgUnit[] = [];

  for (const u of units) {
    map.set(u.id, { ...u, children: [] });
  }

  for (const u of map.values()) {
    if (u.parent_id && map.has(u.parent_id)) {
      map.get(u.parent_id)!.children!.push(u);
    } else {
      roots.push(u);
    }
  }

  return roots;
}

export function buildPositionTree(positions: OrgPosition[]): OrgPosition[] {
  const map = new Map<string, OrgPosition>();
  const roots: OrgPosition[] = [];

  for (const p of positions) {
    map.set(p.id, { ...p, children: [] });
  }

  for (const p of map.values()) {
    if (p.parent_id && map.has(p.parent_id)) {
      map.get(p.parent_id)!.children!.push(p);
    } else {
      roots.push(p);
    }
  }

  return roots;
}

export function getLabel(lang: string, labels: Record<string, string>, fallback: string): string {
  return labels[lang] || labels["es"] || fallback;
}
