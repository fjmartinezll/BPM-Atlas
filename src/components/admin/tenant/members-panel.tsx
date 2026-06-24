import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { KeyRound, MailCheck, ShieldAlert, Trash2, Search } from "lucide-react";
import {
  listTenantMembers,
  setUserRoleInTenant,
  removeUserFromTenant,
  sendPasswordResetForUser,
  resendEmailVerification,
  type TenantMember,
} from "@/lib/tenant-admin.functions";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useActiveTenant } from "./use-active-tenant";

type AppRole = "administrador" | "dueno_proceso" | "participante" | "auditor";
const ALL_ROLES: AppRole[] = ["administrador", "dueno_proceso", "participante", "auditor"];
const ROLE_LABEL: Record<string, string> = {
  administrador: "Administrador",
  dueno_proceso: "Dueño de proceso",
  participante: "Participante",
  auditor: "Auditor",
};

export function TenantMembersPanel() {
  const { tenant } = useActiveTenant();
  const tenantId = tenant?.id;
  const qc = useQueryClient();
  const { user } = useAuth();
  const listFn = useServerFn(listTenantMembers);
  const setRoleFn = useServerFn(setUserRoleInTenant);
  const removeFn = useServerFn(removeUserFromTenant);
  const resetFn = useServerFn(sendPasswordResetForUser);
  const verifyFn = useServerFn(resendEmailVerification);

  const q = useQuery({
    queryKey: ["tenant-members", tenantId],
    enabled: !!tenantId,
    queryFn: () => listFn({ data: { clientId: tenantId! } }),
  });

  const setRoleMu = useMutation({
    mutationFn: (v: { userId: string; role: AppRole }) =>
      setRoleFn({ data: { clientId: tenantId!, userId: v.userId, role: v.role } }),
    onSuccess: () => {
      toast.success("Rol actualizado");
      qc.invalidateQueries({ queryKey: ["tenant-members", tenantId] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Error"),
  });

  const removeMu = useMutation({
    mutationFn: (userId: string) => removeFn({ data: { clientId: tenantId!, userId } }),
    onSuccess: () => {
      toast.success("Usuario expulsado");
      qc.invalidateQueries({ queryKey: ["tenant-members", tenantId] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Error"),
  });

  const resetMu = useMutation({
    mutationFn: (userId: string) => resetFn({ data: { clientId: tenantId!, userId } }),
    onSuccess: () => toast.success("Email de reseteo enviado"),
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Error"),
  });

  const verifyMu = useMutation({
    mutationFn: (userId: string) => verifyFn({ data: { clientId: tenantId!, userId } }),
    onSuccess: (res: any) =>
      res?.alreadyVerified
        ? toast.info("El email ya está verificado")
        : toast.success("Email de verificación enviado"),
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Error"),
  });

  if (!tenantId) return <div className="text-sm text-muted-foreground">Sin tenant asignado.</div>;

  const members: TenantMember[] = q.data ?? [];

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | AppRole | "none">("all");

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return members.filter((m) => {
      if (s) {
        const hay = `${m.email ?? ""} ${m.full_name ?? ""}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      if (roleFilter === "all") return true;
      if (roleFilter === "none") return !m.role;
      return m.role === roleFilter;
    });
  }, [members, search, roleFilter]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: members.length, none: 0 };
    ALL_ROLES.forEach((r) => (c[r] = 0));
    members.forEach((m) => {
      if (!m.role) c.none++;
      else c[m.role] = (c[m.role] ?? 0) + 1;
    });
    return c;
  }, [members]);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-base">
            Miembros del tenant
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {filtered.length} de {members.length}
            </span>
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por email o nombre…"
                className="pl-8 h-9 w-64"
              />
            </div>
            <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v as typeof roleFilter)}>
              <SelectTrigger className="h-9 w-52 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los roles ({counts.all})</SelectItem>
                <SelectItem value="none">Sin rol ({counts.none})</SelectItem>
                {ALL_ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {ROLE_LABEL[r]} ({counts[r] ?? 0})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {q.isLoading && <div className="text-sm text-muted-foreground">Cargando…</div>}
          {!q.isLoading && members.length === 0 && (
            <div className="text-sm text-muted-foreground">
              Sin miembros aún. Invita a alguien desde la pestaña Invitaciones.
            </div>
          )}
          {!q.isLoading && members.length > 0 && filtered.length === 0 && (
            <div className="text-sm text-muted-foreground">Sin resultados para los filtros actuales.</div>
          )}
          {filtered.map((m) => {
            const isSelf = m.user_id === user?.id;
            return (
              <div key={m.user_id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">
                    {m.full_name || m.email || m.user_id}
                    {isSelf && <Badge variant="outline" className="ml-2 text-[10px]">tú</Badge>}
                  </div>
                  {m.email && <div className="text-xs text-muted-foreground truncate">{m.email}</div>}
                </div>

                <div className="flex items-center gap-2">
                  <Select
                    value={m.role ?? ""}
                    onValueChange={(v) => setRoleMu.mutate({ userId: m.user_id, role: v as AppRole })}
                    disabled={setRoleMu.isPending}
                  >
                    <SelectTrigger className="h-8 w-44 text-xs">
                      <SelectValue placeholder="Sin rol" />
                    </SelectTrigger>
                    <SelectContent>
                      {ALL_ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>)}
                    </SelectContent>
                  </Select>

                  <Button size="sm" variant="ghost" title="Enviar enlace de reseteo de contraseña"
                    onClick={() => resetMu.mutate(m.user_id)} disabled={resetMu.isPending || !m.email}>
                    <KeyRound className="h-3.5 w-3.5" />
                  </Button>

                  <Button size="sm" variant="ghost" title="Reenviar verificación de email"
                    onClick={() => verifyMu.mutate(m.user_id)} disabled={verifyMu.isPending || !m.email}>
                    <MailCheck className="h-3.5 w-3.5" />
                  </Button>

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" variant="ghost" title="Expulsar del tenant" disabled={removeMu.isPending || isSelf}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Expulsar a {m.full_name || m.email}?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Perderá acceso a todos los datos de este tenant. La cuenta de usuario seguirá existiendo.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => removeMu.mutate(m.user_id)}>Expulsar</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            );
          })}

          <div className="flex items-start gap-2 rounded-md border border-dashed p-3 text-xs text-muted-foreground">
            <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              Por seguridad, no puedes ver ni fijar contraseñas de otros usuarios. Solo puedes enviarles un enlace de
              reseteo a su email. Tampoco puedes cambiar su email: deben hacerlo ellos desde su perfil.
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
