import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

export type SelectedEntity = { id: string; name: string } | null;

interface Ctx {
  entity: SelectedEntity;
  setEntity: (e: SelectedEntity) => void;
  clear: () => void;
}

const C = createContext<Ctx | null>(null);
const KEY = (uid: string) => `selectedEntity:${uid}`;

export function SelectedEntityProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [entity, setEntityState] = useState<SelectedEntity>(null);
  const [hydrated, setHydrated] = useState(false);
  const warnedRef = useRef(false);

  // Load from localStorage when user changes
  useEffect(() => {
    setHydrated(false);
    warnedRef.current = false;
    if (!user) { setEntityState(null); setHydrated(true); return; }
    try {
      const raw = localStorage.getItem(KEY(user.id));
      if (raw) setEntityState(JSON.parse(raw));
      else setEntityState(null);
    } catch { setEntityState(null); }
    setHydrated(true);
  }, [user]);

  // Fetch entities for current tenant
  const entitiesQ = useQuery({
    queryKey: ["tenant-entities", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("entities").select("id,name").order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  const setEntity = (e: SelectedEntity) => {
    setEntityState(e);
    if (user) {
      if (e) localStorage.setItem(KEY(user.id), JSON.stringify(e));
      else localStorage.removeItem(KEY(user.id));
    }
  };

  // Auto-select / warn / validate stored entity against tenant list
  useEffect(() => {
    if (!user || !hydrated || !entitiesQ.data) return;
    const list = entitiesQ.data;

    // Validate stored selection still exists; sync name changes.
    if (entity) {
      const found = list.find((x) => x.id === entity.id);
      if (!found) {
        setEntity(null);
        return;
      }
      if (found.name !== entity.name) {
        setEntity({ id: found.id, name: found.name });
      }
      return;
    }

    // No selection: auto-pick if exactly one, warn if multiple.
    if (list.length === 1) {
      setEntity({ id: list[0].id, name: list[0].name });
      toast.success(`Entidad seleccionada automáticamente: ${list[0].name}`);
    } else if (list.length > 1 && !warnedRef.current) {
      warnedRef.current = true;
      toast.warning("Selecciona una entidad para continuar.", {
        description: "Hay varias entidades disponibles en tu tenant.",
      });
    }
  }, [user, hydrated, entitiesQ.data, entity]);

  return <C.Provider value={{ entity, setEntity, clear: () => setEntity(null) }}>{children}</C.Provider>;
}

export function useSelectedEntity() {
  const v = useContext(C);
  if (!v) throw new Error("useSelectedEntity must be used within SelectedEntityProvider");
  return v;
}
