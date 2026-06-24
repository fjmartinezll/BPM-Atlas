import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { STALE } from "@/lib/query-keys";
import { listMyClients, type ClientRow } from "@/lib/clients.functions";

export function useActiveTenant() {
  const listFn = useServerFn(listMyClients);
  const q = useQuery({
    queryKey: ["my-tenant"],
    staleTime: STALE.REFERENCE,
    queryFn: () => listFn(),
  });
  const tenant: ClientRow | null = (q.data?.[0] as ClientRow | undefined) ?? null;
  return { tenant, isLoading: q.isLoading };
}
