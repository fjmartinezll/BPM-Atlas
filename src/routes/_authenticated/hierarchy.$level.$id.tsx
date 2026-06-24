import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useEffect, useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useClient } from "@/lib/client-context";
import { LEVELS, LEVEL_TO_I18N, CHILD_OF, type LevelKey } from "@/lib/bpm";
import { STALE } from "@/lib/query-keys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { ArrowLeft, Plus, Trash2, GitBranch, Sparkles, Loader2, Wand2, Check, RefreshCw } from "lucide-react";
import { BpmAuxPanels } from "@/components/bpm-aux-panels";
import { generateProcessDiagram, suggestNodeChildren, acceptNodeChildren, type NodeChildrenSuggestion } from "@/lib/ai.functions";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/hierarchy/$level/$id")({
  validateSearch: (s: Record<string, unknown>) => ({ parent: typeof s.parent === "string" ? s.parent : "" }),
  component: NodePage,
});

const STATUSES = ["borrador", "activo", "revision", "obsoleto"] as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function dyn(table: string): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (supabase as any).from(table);
}

function NodePage() {
  const { level, id } = useParams({ from: "/_authenticated/hierarchy/$level/$id" });
  const search = Route.useSearch();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { canEdit } = useAuth();
  const { withTenant, currentClientId, environment } = useClient();
  const qc = useQueryClient();
  const isNew = id === "new";
  const genDiagramFn = useServerFn(generateProcessDiagram);
  const suggestChildrenFn = useServerFn(suggestNodeChildren);
  const acceptChildrenFn = useServerFn(acceptNodeChildren);
  const [genLoading, setGenLoading] = useState(false);
  const [genConfirm, setGenConfirm] = useState(false);
  const [childrenOpen, setChildrenOpen] = useState(false);
  const [childrenLoading, setChildrenLoading] = useState(false);
  const [childrenAccepting, setChildrenAccepting] = useState(false);
  const [childrenProposal, setChildrenProposal] = useState<NodeChildrenSuggestion | null>(null);
  const lvl = level as LevelKey;
  if (!LEVELS.includes(lvl)) return <div className="p-6">Invalid level</div>;
  const childLvl = CHILD_OF[lvl];

  const [form, setForm] = useState({
    code: "", name: "", mission: "", inputs: "", outputs: "",
    status: "borrador" as (typeof STATUSES)[number],
    resources: "", client_requirements: "", suppliers: "", regulations: "",
  });
  const [entityId, setEntityId] = useState<string>("");
  const [category, setCategory] = useState<string>("misional");
  const [color, setColor] = useState<string>("");
  const [position, setPosition] = useState<number>(0);
  const [isHuman, setIsHuman] = useState<boolean>(true);
  const [n8nWorkflowId, setN8nWorkflowId] = useState<string>("");

  const entitiesQ = useQuery({
    queryKey: ["entities-options"],
    staleTime: STALE.REFERENCE,
    enabled: lvl === "macroprocesses",
    queryFn: async () => {
      const { data, error } = await supabase.from("entities").select("id,name").order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  const node = useQuery({
    queryKey: ["node", lvl, id],
    staleTime: STALE.REFERENCE,
    enabled: !isNew,
    queryFn: async () => {
      const { data, error } = await dyn(lvl).select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data as {
        code: string; name: string; mission: string | null; inputs: string | null;
        outputs: string | null; status: typeof STATUSES[number]; parent_id?: string | null;
        resources: string | null; client_requirements: string | null;
        suppliers: string | null; regulations: string | null;
      } | null;
    },
  });

  useEffect(() => {
    if (node.data) {
      setForm({
        code: node.data.code, name: node.data.name,
        mission: node.data.mission ?? "", inputs: node.data.inputs ?? "",
        outputs: node.data.outputs ?? "", status: node.data.status,
        resources: node.data.resources ?? "",
        client_requirements: node.data.client_requirements ?? "",
        suppliers: node.data.suppliers ?? "",
        regulations: node.data.regulations ?? "",
      });
      const nd = node.data as unknown as { entity_id?: string | null; category?: string | null; color?: string | null; position?: number | null; is_human?: boolean; n8n_workflow_id?: string | null };
      if (lvl === "macroprocesses") {
        setEntityId(nd.entity_id ?? "");
        setCategory(nd.category ?? "misional");
        setColor(nd.color ?? "");
        setPosition(nd.position ?? 0);
      }
      if (lvl === "executable_elements") {
        setN8nWorkflowId(nd.n8n_workflow_id ?? "");
      }
    }
  }, [node.data, lvl]);

  const children = useQuery({
    queryKey: ["children", lvl, id],
    staleTime: STALE.REFERENCE,
    enabled: !isNew && !!childLvl,
    queryFn: async () => {
      // tasks → executable_elements are linked via task_id, not parent_id
      const fkCol = lvl === "tasks" ? "task_id" : "parent_id";
      const { data, error } = await dyn(childLvl!).select("id,code,name,status").eq(fkCol, id).order("code");
      if (error) throw error;
      return (data ?? []) as { id: string; code: string; name: string; status: string }[];
    },
  });

  const onSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!canEdit) { toast.error("Sin permisos"); return; }
    const payload: Record<string, unknown> = { ...form };
    if (isNew && lvl !== "macroprocesses") {
      // executable_elements created from a Task: resolve process via task.subprocess.process
      if (lvl === "executable_elements" && search.parent) {
        const { data: parentTask } = await dyn("tasks").select("id,parent_id").eq("id", search.parent).maybeSingle();
        if (parentTask?.parent_id) {
          const { data: sub } = await dyn("subprocesses").select("parent_id").eq("id", parentTask.parent_id).maybeSingle();
          payload.task_id = parentTask.id;
          payload.parent_id = sub?.parent_id ?? null;
        } else {
          payload.parent_id = search.parent;
        }
      } else {
        payload.parent_id = search.parent;
      }
    }
    if (lvl === "macroprocesses") {
      payload.entity_id = entityId || null;
      payload.category = category;
      payload.color = color || null;
      payload.position = position;
    }
    if (lvl === "executable_elements") {
      payload.n8n_workflow_id = n8nWorkflowId || null;
    }
    const op = isNew
      ? dyn(lvl).insert(withTenant(payload)).select("id").maybeSingle()
      : dyn(lvl).update(payload).eq("id", id).select("id").maybeSingle();
    const { data, error } = await op;
    if (error) { toast.error(error.message); return; }
    toast.success("Guardado");
    qc.invalidateQueries({ queryKey: ["level"] });
    qc.invalidateQueries({ queryKey: ["node", lvl] });
    qc.invalidateQueries({ queryKey: ["children"] });
    qc.invalidateQueries({ queryKey: ["dash"] });
    if (isNew && data) void navigate({ to: "/hierarchy/$level/$id", params: { level: lvl, id: (data as { id: string }).id }, search: { parent: "" } });
  };

  const onDelete = async () => {
    const { error } = await dyn(lvl).delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Eliminado");
    qc.invalidateQueries({ queryKey: ["level"] });
    void navigate({ to: "/dashboard" });
  };

  const canGenDiagram =
    !isNew && canEdit && (lvl === "processes" || lvl === "subprocesses" || lvl === "tasks");

  const runGenerate = async (overwrite: boolean) => {
    if (!currentClientId) {
      toast.error("Sin tenant asignado.");
      return;
    }
    setGenLoading(true);
    try {
      const out = await genDiagramFn({
        data: {
          level: lvl as "processes" | "subprocesses" | "tasks",
          nodeId: id,
          clientId: currentClientId,
          environment,
          language: "es",
          overwrite,
        },
      });
      toast.success(`${t("ai.diagramGenerated")} (${out.tasks} tareas)`);
      qc.invalidateQueries({ queryKey: ["diagram"] });
      qc.invalidateQueries({ queryKey: ["diagrams-list"] });
      void navigate({ to: "/modeler", search: { level: lvl, id } });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error";
      if (msg.includes("DIAGRAM_EXISTS")) {
        setGenConfirm(true);
      } else {
        toast.error(msg);
      }
    } finally {
      setGenLoading(false);
    }
  };

  const canGenChildren =
    !isNew && canEdit && (lvl === "macroprocesses" || lvl === "processes" || lvl === "subprocesses");

  const runSuggestChildren = async () => {
    setChildrenLoading(true);
    setChildrenProposal(null);
    setChildrenOpen(true);
    try {
      const out = await suggestChildrenFn({
        data: { level: lvl as "macroprocesses" | "processes" | "subprocesses", nodeId: id, language: "es" },
      });
      setChildrenProposal(out);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
      setChildrenOpen(false);
    } finally {
      setChildrenLoading(false);
    }
  };

  const acceptChildren = async () => {
    if (!childrenProposal) return;
    setChildrenAccepting(true);
    try {
      const out = await acceptChildrenFn({
        data: {
          parentLevel: lvl as "macroprocesses" | "processes" | "subprocesses",
          parentId: id,
          proposal: childrenProposal,
        },
      });
      const taskSuffix = out.tasks > 0 ? ` + ${out.tasks} tareas` : "";
      toast.success(`${t("ai.childrenAccepted")} (${out.children}${taskSuffix})`);
      qc.invalidateQueries({ queryKey: ["children", lvl, id] });
      qc.invalidateQueries({ queryKey: ["level"] });
      qc.invalidateQueries({ queryKey: ["dash"] });
      setChildrenOpen(false);
      setChildrenProposal(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setChildrenAccepting(false);
    }
  };

  const editChildField = (ci: number, field: "name" | "mission", value: string) => {
    if (!childrenProposal) return;
    const next = structuredClone(childrenProposal);
    next.children[ci][field] = value;
    setChildrenProposal(next);
  };
  const editTaskField = (ci: number, ti: number, field: "name" | "mission", value: string) => {
    if (!childrenProposal) return;
    const next = structuredClone(childrenProposal);
    const tasks = next.children[ci].tasks;
    if (tasks) tasks[ti][field] = value;
    setChildrenProposal(next);
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-6 py-8">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/dashboard"><ArrowLeft className="mr-2 h-4 w-4" /> {t("nav.dashboard")}</Link>
        </Button>
        <div className="flex items-center gap-2">
          {canGenDiagram && (
            <>
              <Button variant="outline" size="sm" onClick={() => runGenerate(false)} disabled={genLoading}>
                {genLoading
                  ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  : <Sparkles className="mr-2 h-4 w-4" />}
                {t("ai.generateDiagram")}
              </Button>
              <AlertDialog open={genConfirm} onOpenChange={setGenConfirm}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t("ai.generateDiagram")}</AlertDialogTitle>
                    <AlertDialogDescription>{t("ai.diagramExists")}</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t("actions.cancel")}</AlertDialogCancel>
                    <AlertDialogAction onClick={() => { setGenConfirm(false); void runGenerate(true); }}>
                      {t("ai.overwrite")}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}
          {canGenChildren && (
            <Button variant="outline" size="sm" onClick={runSuggestChildren} disabled={childrenLoading}>
              {childrenLoading
                ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                : <Wand2 className="mr-2 h-4 w-4" />}
              {t("ai.generateChildren")}
            </Button>
          )}
          {!isNew && (
            <Button variant="outline" size="sm" asChild>
              <Link to="/modeler" search={{ level: lvl, id }}>
                <GitBranch className="mr-2 h-4 w-4" /> {t("ficha.openModeler")}
              </Link>
            </Button>
          )}
          <Badge variant="outline">{t(LEVEL_TO_I18N[lvl].singular)}</Badge>
        </div>
      </div>


      <form onSubmit={onSave} className="rounded-xl border bg-card p-6 space-y-5">
        <h1 className="font-display text-2xl font-semibold">
          {isNew ? `${t("actions.create")} ${t(LEVEL_TO_I18N[lvl].singular)}` : `${form.code} · ${form.name}`}
        </h1>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label={t("fields.code")}>
            <Input required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} disabled={!canEdit} />
          </Field>
          <Field label={t("fields.name")}>
            <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} disabled={!canEdit} />
          </Field>
          <Field label={t("fields.status")} full>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as typeof STATUSES[number] })} disabled={!canEdit}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => <SelectItem key={s} value={s}>{t(`status.${s}`)}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label={t("fields.mission")} full>
            <Textarea value={form.mission} onChange={(e) => setForm({ ...form, mission: e.target.value })} disabled={!canEdit} rows={2} />
          </Field>
          <Field label={t("fields.inputs")}>
            <Textarea value={form.inputs} onChange={(e) => setForm({ ...form, inputs: e.target.value })} disabled={!canEdit} rows={3} />
          </Field>
          <Field label={t("fields.outputs")}>
            <Textarea value={form.outputs} onChange={(e) => setForm({ ...form, outputs: e.target.value })} disabled={!canEdit} rows={3} />
          </Field>
          {lvl === "macroprocesses" && (
            <>
              <Field label="Entidad" full>
                <Select value={entityId || "__none__"} onValueChange={(v) => setEntityId(v === "__none__" ? "" : v)} disabled={!canEdit}>
                  <SelectTrigger><SelectValue placeholder="Sin entidad" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Sin entidad —</SelectItem>
                    {(entitiesQ.data ?? []).map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Categoría en el mapa">
                <Select value={category} onValueChange={setCategory} disabled={!canEdit}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="control">Control</SelectItem>
                    <SelectItem value="estrategico">Estratégico</SelectItem>
                    <SelectItem value="misional">Misional</SelectItem>
                    <SelectItem value="transversal">Transversal</SelectItem>
                    <SelectItem value="apoyo">Apoyo</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Orden en la banda">
                <Input type="number" value={position} onChange={(e) => setPosition(parseInt(e.target.value || "0", 10))} disabled={!canEdit} />
              </Field>
              <Field label="Color (opcional)" full>
                <div className="flex items-center gap-2">
                  <Input type="color" value={color || "#6366f1"} onChange={(e) => setColor(e.target.value)} disabled={!canEdit} className="h-10 w-16 p-1" />
                  <Input value={color} onChange={(e) => setColor(e.target.value)} disabled={!canEdit} placeholder="#6366f1 (deja vacío para usar el color de la categoría)" />
                  {color && <Button type="button" variant="ghost" size="sm" onClick={() => setColor("")}>Quitar</Button>}
                </div>
              </Field>
            </>
          )}
          {lvl === "executable_elements" && (
            <Field label="ID de workflow n8n (opcional)" full>
              <Input value={n8nWorkflowId} onChange={(e) => setN8nWorkflowId(e.target.value)} disabled={!canEdit} placeholder="p.ej. abc123" />
            </Field>
          )}
        </div>


        <div className="rounded-lg border bg-muted/30 p-4 space-y-4">
          <h2 className="font-display text-base font-semibold">{t("ficha.title")}</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label={t("ficha.resources")}>
              <Textarea value={form.resources} onChange={(e) => setForm({ ...form, resources: e.target.value })} disabled={!canEdit} rows={3} />
            </Field>
            <Field label={t("ficha.clientRequirements")}>
              <Textarea value={form.client_requirements} onChange={(e) => setForm({ ...form, client_requirements: e.target.value })} disabled={!canEdit} rows={3} />
            </Field>
            <Field label={t("ficha.suppliers")}>
              <Textarea value={form.suppliers} onChange={(e) => setForm({ ...form, suppliers: e.target.value })} disabled={!canEdit} rows={3} />
            </Field>
            <Field label={t("ficha.regulations")}>
              <Textarea value={form.regulations} onChange={(e) => setForm({ ...form, regulations: e.target.value })} disabled={!canEdit} rows={3} />
            </Field>
          </div>
        </div>
        {canEdit && (
          <div className="flex justify-between">
            <div>
              {!isNew && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button type="button" variant="destructive" size="sm"><Trash2 className="mr-2 h-4 w-4" /> {t("actions.delete")}</Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t("actions.delete")}?</AlertDialogTitle>
                      <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t("actions.cancel")}</AlertDialogCancel>
                      <AlertDialogAction onClick={onDelete}>{t("actions.delete")}</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
            <Button type="submit">{t("actions.save")}</Button>
          </div>
        )}
      </form>

      {!isNew && (
        <div className="rounded-xl border bg-card">
          <BpmAuxPanels level={lvl} id={id} />
        </div>
      )}

      {!isNew && childLvl && (
        <div className="rounded-xl border bg-card">
          <div className="flex items-center justify-between border-b px-5 py-3">
            <h2 className="font-display text-lg font-semibold">{t(LEVEL_TO_I18N[childLvl].plural)}</h2>
            {canEdit && (
              <Button asChild size="sm" variant="outline">
                <Link to="/hierarchy/$level/$id" params={{ level: childLvl, id: "new" }} search={{ parent: id }}>
                  <Plus className="mr-2 h-4 w-4" /> {t("actions.create")}
                </Link>
              </Button>
            )}
          </div>
          <ul className="divide-y">
            {(children.data ?? []).map((c) => (
              <li key={c.id}>
                <Link to="/hierarchy/$level/$id" params={{ level: childLvl, id: c.id }} search={{ parent: "" }}
                  className="flex items-center justify-between px-5 py-3 hover:bg-muted/50">
                  <span><span className="font-mono text-xs text-muted-foreground">{c.code}</span> <span className="font-medium">{c.name}</span></span>
                  <Badge variant="outline" className="text-[10px]">{t(`status.${c.status}`)}</Badge>
                </Link>
              </li>
            ))}
            {!children.isLoading && (children.data ?? []).length === 0 && (
              <li className="px-5 py-6 text-sm text-muted-foreground">{t("common.noResults")}</li>
            )}
          </ul>
        </div>
      )}

      <Dialog open={childrenOpen} onOpenChange={setChildrenOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wand2 className="h-4 w-4 text-primary" /> {t("ai.generateChildren")}
            </DialogTitle>
            <DialogDescription>
              {t("ai.childrenProposal")} · {t(LEVEL_TO_I18N[lvl].singular)} {form.code}
            </DialogDescription>
          </DialogHeader>

          {childrenLoading && (
            <div className="rounded-lg border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
              <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
              {t("ai.thinking")}
            </div>
          )}

          {!childrenLoading && !childrenProposal && (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              {t("ai.childrenEmpty")}
            </div>
          )}

          {!childrenLoading && childrenProposal && (
            <div className="space-y-3">
              {childrenProposal.children.map((c, ci) => (
                <div key={ci} className="rounded-lg border bg-card p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="font-mono text-[10px]">{c.code}</Badge>
                    <Input
                      value={c.name}
                      onChange={(e) => editChildField(ci, "name", e.target.value)}
                      className="h-8 font-medium"
                    />
                  </div>
                  <Textarea
                    value={c.mission}
                    onChange={(e) => editChildField(ci, "mission", e.target.value)}
                    rows={2}
                    className="text-sm"
                  />
                  {lvl === "processes" && c.tasks && c.tasks.length > 0 && (
                    <ul className="divide-y rounded border bg-muted/30">
                      {c.tasks.map((t2, ti) => (
                        <li key={ti} className="flex items-center gap-2 px-2 py-1.5">
                          <Badge variant="secondary" className="font-mono text-[10px]">{t2.code}</Badge>
                          <Input
                            value={t2.name}
                            onChange={(e) => editTaskField(ci, ti, "name", e.target.value)}
                            className="h-7"
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={runSuggestChildren} disabled={childrenLoading || childrenAccepting}>
              <RefreshCw className="mr-2 h-4 w-4" /> {t("ai.regenerate")}
            </Button>
            <Button onClick={acceptChildren} disabled={!childrenProposal || childrenAccepting || childrenLoading}>
              {childrenAccepting
                ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                : <Check className="mr-2 h-4 w-4" />}
              {t("ai.accept")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={`space-y-1.5 ${full ? "md:col-span-2" : ""}`}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}
