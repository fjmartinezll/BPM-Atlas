import { Link, useRouterState } from "@tanstack/react-router";
import { BookOpen, LogOut, Workflow, GitBranch, Sparkles, Building2, History, Database, Cog, Network, Shield, ChevronDown, Webhook, Users, Globe, Mail, UserCheck, KeyRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarMenuSub, SidebarMenuSubButton, SidebarMenuSubItem,
  SidebarHeader, SidebarFooter,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { ClientSelector } from "@/components/client-selector";

export function AppSidebar() {
  const { t } = useTranslation();
  const { isAdmin, signOut, user } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const search = useRouterState({ select: (s) => s.location.search as Record<string, unknown> });
  const isActive = (p: string) => pathname === p || pathname.startsWith(p + "/");
  const isAdminTabActive = (tab: string) => pathname === "/admin" && (search?.tab ?? "general") === tab;

  const items = [
    { to: "/modeler", label: t("nav.modeler"), icon: GitBranch },
    { to: "/engine", label: t("nav.engine"), icon: Cog },
    { to: "/modeler", label: t("modeler.dbTitle"), icon: Database, search: { type: "datos" } as Record<string, string> },
    { to: "/ai-suggest", label: t("nav.aiSuggest"), icon: Sparkles },
    { to: "/encyclopedia", label: t("nav.encyclopedia"), icon: BookOpen },
  ];

  type AdminItem = { to: string; label: string; icon: any; tab?: string };
  const adminGroups: { label: string; items: AdminItem[] }[] = [
    {
      label: t("sidebar.adminGroup.tenantActive"),
      items: [
        { to: "/admin", tab: "general", label: t("sidebar.general"), icon: Building2 },
        { to: "/admin", tab: "members", label: t("sidebar.members"), icon: Users },
        { to: "/admin", tab: "autojoin", label: t("sidebar.autojoin"), icon: Globe },
        { to: "/admin", tab: "invites", label: t("sidebar.invites"), icon: Mail },
        { to: "/admin", tab: "requests", label: t("sidebar.requests"), icon: UserCheck },
      ],
    },
    {
      label: t("sidebar.adminGroup.platform"),
      items: [
        { to: "/admin", tab: "permissions", label: t("sidebar.permissions"), icon: KeyRound },
        { to: "/admin", tab: "entities", label: t("nav.entities"), icon: Building2 },
        { to: "/admin", tab: "modeling", label: t("sidebar.modeling"), icon: GitBranch },
        { to: "/admin", tab: "execution", label: t("sidebar.execution"), icon: Cog },
        { to: "/admin", tab: "audit", label: t("sidebar.audit"), icon: History },
      ],
    },
    {
      label: t("sidebar.adminGroup.orgModel"),
      items: [
        { to: "/entities", label: t("nav.entities"), icon: Building2 },
        { to: "/admin/entities-er", label: t("sidebar.entityEr"), icon: Network },
      ],
    },
    {
      label: t("sidebar.adminGroup.bpmCatalogs"),
      items: [
        { to: "/admin/node-taxonomy", label: t("sidebar.nodeTaxonomy"), icon: Workflow },
        { to: "/node-er", label: t("sidebar.nodeEr"), icon: Network },
      ],
    },
    {
      label: t("sidebar.adminGroup.integrations"),
      items: [{ to: "/webhooks", label: t("sidebar.webhooks"), icon: Webhook }],
    },
    {
      label: t("sidebar.adminGroup.database"),
      items: [{ to: "/database", label: t("sidebar.database"), icon: Database }],
    },
  ];

  const adminOpen =
    isAdmin &&
    (pathname === "/admin" || adminGroups.some((g) => g.items.some((it) => !it.tab && isActive(it.to))));

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <Link to="/dashboard" className="flex items-center gap-2 px-2 py-3">
          <div className="grid place-items-center h-8 w-8 rounded-md bg-primary text-primary-foreground">
            <Workflow className="h-4 w-4" />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="font-display text-base font-semibold">{t("app.name")}</span>
            <span className="text-[10px] uppercase tracking-wider text-sidebar-foreground/60">BPM</span>
          </div>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <div className="px-2 pt-1">
          <ClientSelector />
        </div>
        <SidebarGroup>
          <SidebarGroupLabel>{t("nav.dashboard")}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((it) => (
                <SidebarMenuItem key={it.to + it.label}>
                  <SidebarMenuButton asChild isActive={isActive(it.to)}>
                    {it.to === "/engine" || it.to === "/modeler" ? (
                      <Link to={it.to} search={it.search ?? {}}>
                        <it.icon className="h-4 w-4" />
                        <span>{it.label}</span>
                      </Link>
                    ) : it.search ? (
                      <Link to={it.to} search={it.search as any}>
                        <it.icon className="h-4 w-4" />
                        <span>{it.label}</span>
                      </Link>
                    ) : (
                      <Link to={it.to}>
                        <it.icon className="h-4 w-4" />
                        <span>{it.label}</span>
                      </Link>
                    )}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}






              {isAdmin && (
                <Collapsible defaultOpen={adminOpen} className="group/collapsible">
                  <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton>
                        <Shield className="h-4 w-4" />
                        <span>{t("sidebar.admin")}</span>
                        <ChevronDown className="ml-auto h-4 w-4 transition-transform group-data-[state=open]/collapsible:rotate-180" />
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      {adminGroups.map((group, gi) => (
                        <div key={group.label} className={gi > 0 ? "mt-2" : ""}>
                          <div className="px-3 pt-1 pb-0.5 text-[10px] uppercase tracking-wider text-sidebar-foreground/50">
                            {group.label}
                          </div>
                          <SidebarMenuSub>
                            {group.items.map((it) => {
                              const key = it.to + (it.tab ? `?tab=${it.tab}` : "");
                              const active = it.tab ? isAdminTabActive(it.tab) : isActive(it.to);
                              return (
                                <SidebarMenuSubItem key={key}>
                                  <SidebarMenuSubButton asChild isActive={active}>
                                    {it.tab ? (
                                      <Link to={it.to} search={{ tab: it.tab } as any}>
                                        <it.icon className="h-4 w-4" />
                                        <span>{it.label}</span>
                                      </Link>
                                    ) : (
                                      <Link to={it.to}>
                                        <it.icon className="h-4 w-4" />
                                        <span>{it.label}</span>
                                      </Link>
                                    )}
                                  </SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                              );
                            })}
                          </SidebarMenuSub>
                        </div>
                      ))}
                    </CollapsibleContent>
                  </SidebarMenuItem>
                </Collapsible>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <div className="px-2 py-2 text-xs text-sidebar-foreground/70 truncate">{user?.email}</div>
        <Button variant="ghost" size="sm" onClick={signOut} className="justify-start gap-2 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
          <LogOut className="h-4 w-4" /> {t("nav.logout")}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
