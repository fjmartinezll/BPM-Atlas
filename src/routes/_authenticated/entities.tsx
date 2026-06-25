import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { supabase } from "@/integrations/supabase/client";
import { STALE } from "@/lib/query-keys";
import { useAuth } from "@/lib/auth-context";
import { useClient } from "@/lib/client-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Building2, Plus, Pencil, Trash2, Check, Users, Workflow, ExternalLink, User, List, TreePine, GitBranch } from "lucide-react";
import { useSelectedEntity } from "@/lib/selected-entity";
import { EntityPositionsDialog } from "@/components/entity-positions-dialog";
import { OrgMembersDialog } from "@/components/org-members-dialog";
import { OrgResponsibilitiesDialog } from "@/components/org-responsibilities-dialog";
import { OrgAssignmentsDialog } from "@/components/org-assignments-dialog";
import { OrgUnitTree } from "@/components/org-unit-tree";
import { OrgChartView } from "@/components/org-chart-view";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/entities")({
  component: EntitiesPage,
});

type Entity = {
  id: string;
  name: string;
  description: string | null;
  mission: string | null;
  vision: string | null;
  strategy: string | null;
  status: string;
  parent_id: string | null;
};

function EntitiesPage() {
  const { t } = useTranslation();
  const { canEdit } = useAuth();
  const { withTenant } = useClient();
  const { entity: selected, setEntity } = useSelectedEntity();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Entity | null>(null);
  const [form, setForm] = useState({
    name: "", description: "",
    mission: "", vision: "", strategy: "",
    parent_id: "",
  });
  const [positionsFor, setPositionsFor] = useState<Entity | null>(null);
  const [membersFor, setMembersFor] = useState<Entity | null>(null);
  const [responsibilitiesFor, setResponsibilitiesFor] = useState<{ positionId: string; positionName: string } | null>(null);
  const [assignmentsFor, setAssignmentsFor] = useState<{ positionId: string; positionName: string; entityId: string } | null>(null);
  const [tab, setTab] = useState<"lista" | "arbol" | "organigrama">("lista");

  const entities = useQuery({
    queryKey: ["entities"],
    staleTime: STALE.REFERENCE,
    queryFn: async () => {
      const { data, error } = await supabase.from("entities").select("id, name, description, mission, vision, strategy, status, parent_id").order("name");
      if (error) throw error;
      return (data ?? []) as Entity[];
    },
  });

  const macros = useQuery({
    queryKey: ["entities", "all-macros"],
    staleTime: STALE.REFERENCE,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("macroprocesses")
        .select("id,name,code,entity_id")
        .order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string; code: string; entity_id: string | null }[];
    },
  });


  const startCreate = () => {
    setEditing(null);
    setForm({ name: "", description: "", mission: "", vision: "", strategy: "", parent_id: "" });
    setOpen(true);
  };
  const startEdit = (e: Entity) => {
    setEditing(e);
    setForm({
      name: e.name,
      description: e.description ?? "",
      mission: e.mission ?? "",
      vision: e.vision ?? "",
      strategy: e.strategy ?? "",
      parent_id: e.parent_id ?? "",
    });
    setOpen(true);
  };

  const save = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!canEdit) { toast.error(t("entitiesPage.noPermission")); return; }
    const base = {
      name: form.name,
      description: form.description || null,
      mission: form.mission || null,
      vision: form.vision || null,
      strategy: form.strategy || null,
      parent_id: form.parent_id || null,
    };
    const { error } = editing
      ? await supabase.from("entities").update(base).eq("id", editing.id)
      : await supabase.from("entities").insert(withTenant(base));
    if (error) { toast.error(error.message); return; }
    toast.success(t("entitiesPage.saved"));
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["entities"] });
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("entities").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success(t("entitiesPage.deleted"));
    qc.invalidateQueries({ queryKey: ["entities"] });
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-6 py-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Building2 className="h-6 w-6" />
          <h1 className="font-display text-2xl font-semibold">{t("entitiesPage.title")}</h1>
        </div>
        {canEdit && (
          <Button onClick={startCreate} size="sm"><Plus className="mr-2 h-4 w-4" /> {t("entitiesPage.newEntity")}</Button>
        )}
      </div>

      <div className="flex items-center gap-1 border-b">
        <button
          onClick={() => setTab("lista")}
          className={cn(
            "flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors",
            tab === "lista" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <List className="h-4 w-4" /> {t("entitiesPage.tabList")}
        </button>
        <button
          onClick={() => setTab("arbol")}
          className={cn(
            "flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors",
            tab === "arbol" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <TreePine className="h-4 w-4" /> {t("entitiesPage.tabTree")}
        </button>
        <button
          onClick={() => setTab("organigrama")}
          className={cn(
            "flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors",
            tab === "organigrama" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <GitBranch className="h-4 w-4" /> {t("entitiesPage.tabOrg")}
        </button>
      </div>

      {tab === "lista" && (
        <div className="rounded-xl border bg-card">
          <ul className="divide-y">
            {(entities.data ?? []).map((e) => {
              const isSelected = selected?.id === e.id;
              const entityMacro = (macros.data ?? []).find((m) => m.entity_id === e.id);
              const openMacroDiagram = () => {
                setEntity({ id: e.id, name: e.name });
                navigate({ to: "/modeler", search: (prev: Record<string, unknown>) => ({ ...prev, type: "macroprocesos" as const }) });
              };
              return (
              <li key={e.id} className={`flex items-start justify-between gap-4 px-5 py-4 ${isSelected ? "bg-primary/5" : ""}`}>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium">{e.name}</h3>
                    <Badge variant="outline" className="text-[10px]">{e.status}</Badge>
                    {isSelected && <Badge className="text-[10px]">{t("entitiesPage.selected")}</Badge>}
                  </div>
                  {e.description && <p className="mt-1 text-sm text-muted-foreground">{e.description}</p>}
                  <div className="mt-2 flex items-center gap-2 text-xs">
                    <Workflow className="h-3.5 w-3.5 text-muted-foreground" />
                    {entityMacro ? (
                      <>
                        <span className="text-muted-foreground">{t("entitiesPage.processMap")}</span>
                      <span className="font-mono text-[11px]">{entityMacro.code}</span>
                      <span>· {entityMacro.name}</span>
                      <Button type="button" variant="ghost" size="sm" className="h-6 gap-1 px-2" onClick={openMacroDiagram}>
                        <ExternalLink className="h-3 w-3" /> {t("entitiesPage.goToMap")}
                      </Button>
                      </>
                    ) : (
                      <>
                        <span className="text-muted-foreground italic">{t("entitiesPage.noProcessMap")}</span>
                        <Button type="button" variant="outline" size="sm" className="h-6 gap-1 px-2" onClick={openMacroDiagram}>
                          <ExternalLink className="h-3 w-3" /> {t("entitiesPage.selectProcessMap")}
                        </Button>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant={isSelected ? "default" : "outline"}
                    size="sm"
                    onClick={() => { setEntity(isSelected ? null : { id: e.id, name: e.name }); toast.success(isSelected ? t("entitiesPage.selectionRemoved") : t("entitiesPage.entitySelected", { name: e.name })); }}
                  >
                    <Check className="mr-1.5 h-3.5 w-3.5" />
                    {isSelected ? t("entitiesPage.selected") : t("entitiesPage.select")}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setPositionsFor(e)}>
                    <Users className="mr-1.5 h-3.5 w-3.5" /> {t("entitiesPage.positions")}
                  </Button>
                        <Button variant="outline" size="sm" onClick={() => setMembersFor(e)}>
                    <User className="mr-1.5 h-3.5 w-3.5" /> {t("entitiesPage.members")}
                  </Button>
                  {canEdit && (
                    <>
                      <Button variant="ghost" size="icon" onClick={() => startEdit(e)} aria-label={t("actions.edit")}><Pencil className="h-4 w-4" /></Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label={t("actions.delete")}><Trash2 className="h-4 w-4" /></Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>{t("entitiesPage.deleteTitle")}</AlertDialogTitle>
                            <AlertDialogDescription>{t("entitiesPage.cannotUndo")}</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>{t("actions.cancel")}</AlertDialogCancel>
                            <AlertDialogAction onClick={() => remove(e.id)}>{t("actions.delete")}</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </>
                  )}
                </div>
              </li>
              );
            })}
            {!entities.isLoading && (entities.data ?? []).length === 0 && (
              <li className="px-5 py-6 text-sm text-muted-foreground">{t("entitiesPage.noEntities")}</li>
            )}
          </ul>
        </div>
      )}

      {selected && (
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs gap-1">
            <Building2 className="h-3 w-3" /> {t("entitiesPage.selected")}: {selected.name}
          </Badge>
        </div>
      )}

      {selected && tab === "arbol" && (
        <OrgUnitTree entityId={selected.id} entityName={selected.name} />
      )}

      {selected && tab === "organigrama" && (
        <OrgChartView entityId={selected.id} entityName={selected.name} />
      )}

      {!selected && tab !== "lista" && (
        <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
          <Building2 className="mx-auto mb-2 h-8 w-8 opacity-40" />
          <p>{t("entitiesPage.selectHint", { tab: t("entitiesPage.tabList"), view: tab === "arbol" ? t("entitiesPage.treeView") : t("entitiesPage.orgView") })}</p>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? t("entitiesPage.editTitle") : t("entitiesPage.newEntity")}</DialogTitle>
          </DialogHeader>
          <form onSubmit={save} className="space-y-4">
            <div className="space-y-1.5">
              <Label>{t("fields.name")}</Label>
              <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="font-bold text-accent-foreground" />
            </div>
            <div className="space-y-1.5">
              <Label>{t("entitiesPage.parentUnit")}</Label>
              <select
                value={form.parent_id}
                onChange={(e) => setForm({ ...form, parent_id: e.target.value })}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors"
              >
                <option value="">{t("entitiesPage.noParent")}</option>
                {(entities.data ?? [])
                  .filter((e) => e.id !== editing?.id)
                  .map((e) => (
                    <option key={e.id} value={e.id}>{e.name}</option>
                  ))}
              </select>
            </div>

            <MissionStrategyVisionDiagram
              mission={form.mission}
              strategy={form.strategy}
              vision={form.vision}
            />



            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>{t("actions.cancel")}</Button>
              <Button type="submit">{t("actions.save")}</Button>
            </DialogFooter>

            <div className="space-y-1.5">
              <Label>{t("entitiesPage.description")}</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("entitiesPage.mission")} <span className="text-xs font-normal text-muted-foreground">{t("entitiesPage.missionHint")}</span></Label>
              <Textarea value={form.mission} onChange={(e) => setForm({ ...form, mission: e.target.value })} rows={2} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("entitiesPage.strategy")} <span className="text-xs font-normal text-muted-foreground">{t("entitiesPage.strategyHint")}</span></Label>
              <Textarea value={form.strategy} onChange={(e) => setForm({ ...form, strategy: e.target.value })} rows={3} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("entitiesPage.vision")} <span className="text-xs font-normal text-muted-foreground">{t("entitiesPage.visionHint")}</span></Label>
              <Textarea value={form.vision} onChange={(e) => setForm({ ...form, vision: e.target.value })} rows={2} />
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {positionsFor && (
        <EntityPositionsDialog
          open={!!positionsFor}
          onOpenChange={(o) => { if (!o) setPositionsFor(null); }}
          entityId={positionsFor.id}
          entityName={positionsFor.name}
          onOpenResponsibilities={(positionId, positionName) => {
            setResponsibilitiesFor({ positionId, positionName });
          }}
          onOpenAssignments={(positionId, positionName) => {
            setAssignmentsFor({ positionId, positionName, entityId: positionsFor.id });
          }}
        />
      )}

      {membersFor && (
        <OrgMembersDialog
          open={!!membersFor}
          onOpenChange={(o) => { if (!o) setMembersFor(null); }}
          entityId={membersFor.id}
          entityName={membersFor.name}
        />
      )}

      {responsibilitiesFor && (
        <OrgResponsibilitiesDialog
          open={!!responsibilitiesFor}
          onOpenChange={(o) => { if (!o) setResponsibilitiesFor(null); }}
          positionId={responsibilitiesFor.positionId}
          positionName={responsibilitiesFor.positionName}
        />
      )}

      {assignmentsFor && (
        <OrgAssignmentsDialog
          open={!!assignmentsFor}
          onOpenChange={(o) => { if (!o) setAssignmentsFor(null); }}
          positionId={assignmentsFor.positionId}
          positionName={assignmentsFor.positionName}
          entityId={assignmentsFor.entityId}
        />
      )}
    </div>
  );
}

function MissionStrategyVisionDiagram({
  mission, strategy, vision,
}: { mission: string; strategy: string; vision: string }) {
  const { t } = useTranslation();
  const actions = strategy
    .split(/\r?\n|·|•|;/)
    .map((s) => s.trim())
    .filter(Boolean);

  return (
    <div className="rounded-lg border bg-muted/30 p-4">
      <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {t("entitiesPage.msDiagram")}
      </div>
      <div className="flex items-stretch gap-2">
        <div className="flex w-44 shrink-0 flex-col rounded-md border-2 border-primary/50 bg-card p-3">
          <div className="text-[10px] font-bold uppercase tracking-wide text-primary">{t("entitiesPage.msInput")}</div>
          <div className="text-sm font-semibold">{t("entitiesPage.msMission")}</div>
          <div className="mt-1 text-xs text-muted-foreground whitespace-pre-wrap break-words">
            {mission || <span className="italic">{t("entitiesPage.msUndefined")}</span>}
          </div>
        </div>

        <div className="relative flex flex-1 items-center">
          <div
            className="flex w-full flex-col justify-center bg-accent/40 px-4 py-3 text-center"
            style={{
              clipPath: "polygon(0 20%, 88% 20%, 88% 0, 100% 50%, 88% 100%, 88% 80%, 0 80%)",
              minHeight: 110,
            }}
          >
            <div className="text-[10px] font-bold uppercase tracking-wide text-accent-foreground/80">
              {t("entitiesPage.msStrategy")}
            </div>
            {actions.length > 0 ? (
              <ul className="mt-1 space-y-0.5 pr-10 text-xs text-foreground">
                {actions.map((a, i) => (
                  <li key={i} className="truncate">• {a}</li>
                ))}
              </ul>
            ) : (
              <div className="mt-1 pr-10 text-xs italic text-muted-foreground">
                {t("entitiesPage.msNoActions")}
              </div>
            )}
          </div>
        </div>

        <div className="flex w-44 shrink-0 flex-col rounded-md border-2 border-emerald-500/60 bg-card p-3">
          <div className="text-[10px] font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">{t("entitiesPage.msOutput")}</div>
          <div className="text-sm font-semibold">{t("entitiesPage.msVision")}</div>
          <div className="mt-1 text-xs text-muted-foreground whitespace-pre-wrap break-words">
            {vision || <span className="italic">{t("entitiesPage.msUndefined")}</span>}
          </div>
        </div>
      </div>
      <div className="mt-2 text-[10px] text-muted-foreground">
        {t("entitiesPage.msTip")}
      </div>
    </div>
  );
}
