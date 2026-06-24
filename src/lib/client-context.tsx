// Multi-tenant: cada usuario pertenece a UN único tenant.
// El nombre "client" se mantiene en BD por compatibilidad; en UI/conceptual es "tenant".
// El selector de tenant ha desaparecido — `setCurrentClientId` se conserva como no-op
// (warn) para no romper llamadas existentes.
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listMyClients, type ClientRow } from "@/lib/clients.functions";
import { useAuth } from "@/lib/auth-context";

export type Environment = "produccion" | "pruebas";

const ENV_STORAGE_KEY = "bpm.environment";

interface ClientCtxValue {
  loading: boolean;
  /** Compat: siempre contiene 0 o 1 elementos (el tenant del usuario). */
  clients: ClientRow[];
  currentClientId: string | null;
  currentClient: ClientRow | null;
  environment: Environment;
  /** Compat / no-op: el tenant no se puede cambiar. */
  setCurrentClientId: (id: string | null) => void;
  setEnvironment: (env: Environment) => void;
  withTenant: <T extends Record<string, unknown>>(payload: T) => T & {
    client_id: string;
    environment: Environment;
  };
}

const Ctx = createContext<ClientCtxValue | null>(null);

function readStoredEnv(): Environment | null {
  if (typeof window === "undefined") return null;
  const v = window.localStorage.getItem(ENV_STORAGE_KEY);
  return v === "pruebas" || v === "produccion" ? v : null;
}

export function ClientProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const listFn = useServerFn(listMyClients);

  const clientsQ = useQuery({
    queryKey: ["my-clients", user?.id],
    queryFn: () => listFn(),
    enabled: !!user,
    staleTime: 60_000,
  });

  const [environment, setEnvironmentState] = useState<Environment>(
    () => readStoredEnv() ?? "produccion",
  );

  const setCurrentClientId = useCallback((id: string | null) => {
    // No-op: el tenant es único por usuario. Mantenido para compatibilidad.
    const current = clientsQ.data?.[0]?.id ?? null;
    if (id && id !== current) {
      // eslint-disable-next-line no-console
      console.warn("[multi-tenant] setCurrentClientId ignorado: el tenant es único por usuario.");
    }
  }, [clientsQ.data]);

  const setEnvironment = useCallback(
    (env: Environment) => {
      setEnvironmentState(env);
      try { window.localStorage.setItem(ENV_STORAGE_KEY, env); } catch {}
      queryClient.invalidateQueries();
    },
    [queryClient],
  );

  // El cambio de entorno es siempre una acción explícita del usuario.
  // La app no fuerza ni inicializa automáticamente el entorno aquí.

  const value = useMemo<ClientCtxValue>(() => {
    const tenant = clientsQ.data?.[0] ?? null;
    return {
      loading: clientsQ.isLoading,
      clients: tenant ? [tenant] : [],
      currentClientId: tenant?.id ?? null,
      currentClient: tenant,
      environment,
      setCurrentClientId,
      setEnvironment,
      withTenant: (payload) => {
        if (!tenant) {
          throw new Error(
            "Sin tenant asignado. Contacta al administrador para que te asigne uno.",
          );
        }
        return { ...payload, client_id: tenant.id, environment } as typeof payload & {
          client_id: string;
          environment: Environment;
        };
      },
    };
  }, [clientsQ.data, clientsQ.isLoading, environment, setCurrentClientId, setEnvironment]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useClient() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useClient must be used within ClientProvider");
  return v;
}
