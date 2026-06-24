import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAuth, type AppRole } from "@/lib/auth-context";
import { SelectedEntityProvider, useSelectedEntity } from "@/lib/selected-entity";
import { Building2, X, UserCircle2, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated")({ component: AuthenticatedLayout });

function AuthenticatedLayout() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (!loading && !user) void navigate({ to: "/login" });
  }, [user, loading, navigate]);

  if (loading || !user) {
    return <div className="grid min-h-screen place-items-center text-sm text-muted-foreground">…</div>;
  }

  return (
    <SelectedEntityProvider>
      <SidebarProvider>
        <div className="flex min-h-screen w-full">
          <AppSidebar />
          <div className="flex flex-1 flex-col">
            <header className="flex h-14 items-center justify-between gap-3 border-b bg-card px-4">
              <div className="flex items-center gap-3">
                <SidebarTrigger />
                <HeaderEntityBadge />
              </div>
              <div className="flex items-center gap-2">
                <HeaderUserBadge />
                <ThemeToggle />
                <LanguageSwitcher />
              </div>
            </header>
            <main className="flex-1 bg-background">
              <EntityGate>
                <Outlet />
              </EntityGate>
            </main>

          </div>
        </div>
      </SidebarProvider>
    </SelectedEntityProvider>
  );
}

function HeaderEntityBadge() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (pathname === "/encyclopedia" || pathname === "/engine") return null;
  return <SelectedEntityBadge />;
}

function SelectedEntityBadge() {
  const { entity, clear } = useSelectedEntity();
  const navigate = useNavigate();
  if (!entity) return null;
  return (
    <div className="flex items-center gap-1.5 rounded-md border border-sky-300 bg-sky-100 px-2.5 py-1 text-xs text-sky-950 dark:border-sky-700 dark:bg-sky-900/40 dark:text-sky-100">
      <Building2 className="h-3.5 w-3.5 text-primary" />
      <span className="font-medium">Entidad:</span>
      <button className="font-semibold hover:underline" onClick={() => navigate({ to: "/entities" })}>
        {entity.name}
      </button>
      <Button variant="ghost" size="icon" className="h-5 w-5" onClick={clear} title="Quitar selección">
        <X className="h-3 w-3" />
      </Button>
    </div>
  );
}

function EntityGate({ children }: { children: React.ReactNode }) {
  const { entity } = useSelectedEntity();
  const navigate = useNavigate();
  const location = useRouterState({ select: (s) => s.location });
  const pathname = location.pathname;
  const canLoadExistingModelerDiagram =
    pathname === "/modeler" && typeof (location.search as { id?: unknown }).id === "string";
  const allowed =
    pathname === "/entities" ||
    pathname === "/encyclopedia" ||
    pathname.startsWith("/admin") ||
    canLoadExistingModelerDiagram;

  if (!entity && !allowed) {
    return (
      <div className="mx-auto max-w-xl px-6 py-20 text-center">
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-8 text-destructive shadow-sm">
          <Building2 className="mx-auto mb-4 h-10 w-10 text-destructive" />
          <h2 className="font-display text-xl font-semibold">Ninguna entidad seleccionada</h2>
          <p className="mt-2 text-sm opacity-90">
            Para acceder a esta sección debes seleccionar una entidad primero.
          </p>
          <Button
            variant="destructive"
            className="mt-6"
            onClick={() => void navigate({ to: "/entities" })}
          >
            Ir a Entidades
          </Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

interface RoleMeta {
  label: string;
  category: string;
  categoryClass: string;
  roleClass: string;
}

const ROLE_META: Record<AppRole, RoleMeta> = {
  administrador: {
    label: "Administrador",
    category: "Administración",
    categoryClass: "bg-sky-700 dark:bg-sky-500",
    roleClass: "bg-sky-100 text-sky-800 dark:bg-sky-900/60 dark:text-sky-100",
  },
  dueno_proceso: {
    label: "Dueño de proceso",
    category: "Permisos de Modelado",
    categoryClass: "bg-emerald-700 dark:bg-emerald-500",
    roleClass: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-100",
  },
  participante: {
    label: "Participante",
    category: "Ejecución",
    categoryClass: "bg-orange-700 dark:bg-orange-500",
    roleClass: "bg-orange-100 text-orange-800 dark:bg-orange-900/60 dark:text-orange-100",
  },
  auditor: {
    label: "Auditor",
    category: "Motor",
    categoryClass: "bg-purple-700 dark:bg-purple-500",
    roleClass: "bg-purple-100 text-purple-800 dark:bg-purple-900/60 dark:text-purple-100",
  },
};

function HeaderUserBadge() {
  const { user, roles, canEdit } = useAuth();
  if (!user) return null;
  const name = (user.user_metadata as { full_name?: string } | null)?.full_name || user.email || "Usuario";
  return (
    <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-2.5 py-1 text-xs">
      <UserCircle2 className="h-4 w-4 text-primary" />
      <span className="font-medium max-w-[180px] truncate" title={user.email ?? undefined}>{name}</span>
      <div className="flex items-center gap-1">
        {roles.length === 0 ? (
          <Badge variant="outline" className="text-[10px]">Sin roles</Badge>
        ) : (
          roles.map((r) => {
            const meta = ROLE_META[r];
            return (
              <span
                key={r}
                className="inline-flex items-center rounded border overflow-hidden text-[10px]"
                title={`${meta?.category ?? ""}: ${meta?.label ?? r}`}
              >
                <span className={`px-1.5 py-0.5 font-semibold text-white ${meta?.categoryClass ?? ""}`}>
                  {meta?.category ?? r}
                </span>
                <span className={`px-1.5 py-0.5 font-medium ${meta?.roleClass ?? ""}`}>
                  {meta?.label ?? r}
                </span>
              </span>
            );
          })
        )}
      </div>
      {!canEdit && (
        <span className="flex items-center gap-1 rounded border border-amber-300 bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-900 dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-100">
          <Eye className="h-3 w-3" /> Solo lectura
        </span>
      )}
    </div>
  );
}
