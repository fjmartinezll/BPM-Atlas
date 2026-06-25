import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type AppRole } from "@/lib/auth-context";
import { useClient } from "@/lib/client-context";
import { notifyUserRolesChanged } from "@/lib/notifications.functions";
import { STALE } from "@/lib/query-keys";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/error-capture";

const ROLE_DESCRIPTIONS: Record<AppRole, string> = {
  administrador: "Acceso total al sistema. Gestiona usuarios, roles, taxonomías y toda la configuración.",
  dueno_proceso: "Diseñador de procesos. Puede crear y editar mapas de procesos, procesos, subprocesos y tareas.",
  participante: "Usuario operativo. Participa en la ejecución de instancias de procesos asignadas.",
  auditor: "Acceso de solo lectura para auditar procesos, instancias y trazabilidad.",
};

export const Route = createFileRoute("/_authenticated/admin/users")({
  head: () => ({ meta: [{ title: "Administración — BPM Atlas" }] }),
  component: AdminUsers,
});

const ALL_ROLES: AppRole[] = ["administrador", "dueno_proceso", "participante", "auditor"];

function AdminUsers() {
  const { t } = useTranslation();
  const { isAdmin, loading } = useAuth();
  const { currentClientId } = useClient();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["admin-users", currentClientId],
    staleTime: STALE.REFERENCE,
    enabled: isAdmin && !!currentClientId,
    queryFn: async () => {
      const { data: members } = await supabase
        .from("user_clients").select("user_id").eq("client_id", currentClientId!);
      const userIds = (members ?? []).map((m) => m.user_id);
      if (userIds.length === 0) return [];
      const [{ data: profiles }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("id,email,full_name").in("id", userIds).order("email"),
        supabase.from("user_roles").select("user_id,role").eq("client_id", currentClientId!).in("user_id", userIds),
      ]);
      const byUser = new Map<string, AppRole[]>();
      (roles ?? []).forEach((r) => {
        const arr = byUser.get(r.user_id) ?? [];
        arr.push(r.role as AppRole);
        byUser.set(r.user_id, arr);
      });
      return (profiles ?? []).map((p) => ({ ...p, roles: byUser.get(p.id) ?? [] }));
    },
  });

  if (loading) return <div className="p-6 text-muted-foreground">…</div>;
  if (!isAdmin) return <Navigate to="/dashboard" />;

  const notify = useServerFn(notifyUserRolesChanged);


  const toggleRole = async (userId: string, role: AppRole, has: boolean) => {
    if (!currentClientId) return toast.error("Sin tenant activo");
    if (has) {
      if (!window.confirm("¿Eliminar el rol «" + role + "» a este usuario?")) return;
      const { error } = await supabase.from("user_roles").delete()
        .eq("user_id", userId).eq("role", role).eq("client_id", currentClientId);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase.from("user_roles").insert({ user_id: userId, role, client_id: currentClientId });
      if (error) return toast.error(error.message);
    }
    qc.invalidateQueries({ queryKey: ["admin-users"] });
    void notify({ data: { userId, changeSummary: has ? "retirar uno de tus roles" : "asignarte un nuevo rol" } })
      .catch((err) => console.warn("Operation failed:", getErrorMessage(err)));
  };

  return (
    <TooltipProvider delayDuration={150}>
      <div className="mx-auto max-w-5xl px-6 py-8">
        <h1 className="font-display text-3xl font-semibold">{t("nav.admin")}</h1>
        <p className="mt-1 text-muted-foreground">Roles: {ALL_ROLES.map((r) => t(`roles.${r}`)).join(" · ")}</p>

        <div className="mt-6 rounded-xl border bg-card">
          {isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">{t("common.loading")}</div>
          ) : (
            <ul className="divide-y">
              {(data ?? []).map((u) => (
                <li key={u.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                  <div>
                    <div className="font-medium">{u.full_name || u.email}</div>
                    <div className="text-xs text-muted-foreground">{u.email}</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {ALL_ROLES.map((r) => {
                      const has = u.roles.includes(r);
                      return (
                        <Tooltip key={r}>
                          <TooltipTrigger asChild>
                            <Button size="sm" variant={has ? "default" : "outline"} onClick={() => toggleRole(u.id, r, has)}>
                              {t(`roles.${r}`)}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs bg-sky-100 text-black border border-sky-200">
                            <div className="font-medium">{t(`roles.${r}`)}</div>
                            <div className="mt-1 text-xs">{ROLE_DESCRIPTIONS[r]}</div>
                          </TooltipContent>
                        </Tooltip>
                      );
                    })}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
