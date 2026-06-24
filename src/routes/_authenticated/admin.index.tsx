import { createFileRoute } from "@tanstack/react-router";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { useNavigate } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Shield, Users, Globe, Mail, UserCheck, Building2, GitBranch, Cog, History, KeyRound } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useTranslation } from "react-i18next";

const TenantGeneralPanel = lazy(() => import("@/components/admin/tenant/general-panel").then(m => ({ default: m.TenantGeneralPanel })));
const TenantMembersPanel = lazy(() => import("@/components/admin/tenant/members-panel").then(m => ({ default: m.TenantMembersPanel })));
const TenantAutojoinPanel = lazy(() => import("@/components/admin/tenant/autojoin-panel").then(m => ({ default: m.TenantAutojoinPanel })));
const TenantInvitationsPanel = lazy(() => import("@/components/admin/tenant/invitations-panel").then(m => ({ default: m.TenantInvitationsPanel })));
const TenantRequestsPanel = lazy(() => import("@/components/admin/tenant/requests-panel").then(m => ({ default: m.TenantRequestsPanel })));
const PlatformPermissionsPanel = lazy(() => import("@/components/admin/platform/permissions-panel").then(m => ({ default: m.PlatformPermissionsPanel })));
const PlatformEntitiesPanel = lazy(() => import("@/components/admin/platform/entities-panel").then(m => ({ default: m.PlatformEntitiesPanel })));
const PlatformModelingPanel = lazy(() => import("@/components/admin/platform/modeling-panel").then(m => ({ default: m.PlatformModelingPanel })));
const PlatformExecutionPanel = lazy(() => import("@/components/admin/platform/execution-panel").then(m => ({ default: m.PlatformExecutionPanel })));
const PlatformAuditPanel = lazy(() => import("@/components/admin/platform/audit-panel").then(m => ({ default: m.PlatformAuditPanel })));

const TENANT_TABS = ["general", "members", "autojoin", "invites", "requests"] as const;
const PLATFORM_TABS = ["permissions", "entities", "modeling", "execution", "audit"] as const;
const ALL_TABS = [...TENANT_TABS, ...PLATFORM_TABS] as const;

const searchSchema = z.object({
  tab: fallback(z.enum(ALL_TABS), "general").default("general"),
});

export const Route = createFileRoute("/_authenticated/admin/")({
  validateSearch: zodValidator(searchSchema),
  head: () => ({ meta: [{ title: "Administración — BPM Atlas" }] }),
  component: AdminPage,
});

function Fallback() {
  return <div className="text-sm text-muted-foreground">Cargando…</div>;
}

function AdminPage() {
  const { isAdmin } = useAuth();
  const { t } = useTranslation();
  const { tab } = Route.useSearch();
  const navigate = useNavigate({ from: "/admin" });
  const setTab = (t: (typeof ALL_TABS)[number]) =>
    navigate({ search: (prev: { tab: typeof t }) => ({ ...prev, tab: t }) });

  if (!isAdmin) {
    return (
      <div className="container max-w-3xl py-10">
        <h1 className="text-2xl font-semibold">Administración</h1>
        <p className="text-muted-foreground mt-2">Requiere rol administrador.</p>
      </div>
    );
  }

  return (
    <div className="container max-w-6xl py-6 space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold flex items-center gap-2">
          <Shield className="h-6 w-6" />
          Administración
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Gestión del tenant activo y configuración global de la plataforma.
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="space-y-4">
        <div className="space-y-2">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Tenant activo</div>
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="general"><Building2 className="h-3.5 w-3.5 mr-1.5" />General</TabsTrigger>
            <TabsTrigger value="members"><Users className="h-3.5 w-3.5 mr-1.5" />Miembros y roles</TabsTrigger>
            <TabsTrigger value="autojoin"><Globe className="h-3.5 w-3.5 mr-1.5" />Auto-unión</TabsTrigger>
            <TabsTrigger value="invites"><Mail className="h-3.5 w-3.5 mr-1.5" />Invitaciones</TabsTrigger>
            <TabsTrigger value="requests"><UserCheck className="h-3.5 w-3.5 mr-1.5" />Solicitudes</TabsTrigger>
          </TabsList>
        </div>

        <div className="space-y-2">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Plataforma</div>
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="permissions"><KeyRound className="h-3.5 w-3.5 mr-1.5" />Permisos</TabsTrigger>
            <TabsTrigger value="entities"><Building2 className="h-3.5 w-3.5 mr-1.5" />{t("nav.entities")}</TabsTrigger>
            <TabsTrigger value="modeling"><GitBranch className="h-3.5 w-3.5 mr-1.5" />Permisos de Modelado</TabsTrigger>
            <TabsTrigger value="execution"><Cog className="h-3.5 w-3.5 mr-1.5" />Ejecución</TabsTrigger>
            <TabsTrigger value="audit"><History className="h-3.5 w-3.5 mr-1.5" />Auditoría</TabsTrigger>
          </TabsList>
        </div>

        <Suspense fallback={<Fallback />}>
          <TabsContent value="general"><TenantGeneralPanel /></TabsContent>
          <TabsContent value="members"><TenantMembersPanel /></TabsContent>
          <TabsContent value="autojoin"><TenantAutojoinPanel /></TabsContent>
          <TabsContent value="invites"><TenantInvitationsPanel /></TabsContent>
          <TabsContent value="requests"><TenantRequestsPanel /></TabsContent>
          <TabsContent value="permissions"><PlatformPermissionsPanel /></TabsContent>
          <TabsContent value="entities"><PlatformEntitiesPanel /></TabsContent>
          <TabsContent value="modeling"><PlatformModelingPanel /></TabsContent>
          <TabsContent value="execution"><PlatformExecutionPanel /></TabsContent>
          <TabsContent value="audit"><PlatformAuditPanel /></TabsContent>
        </Suspense>
      </Tabs>
    </div>
  );
}
