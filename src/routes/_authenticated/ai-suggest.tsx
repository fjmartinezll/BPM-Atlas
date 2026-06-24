import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Sparkles, Loader2, Check, RefreshCw, Wand2, X, Trash2, ChevronRight, Plus, Eye, EyeOff, ListTree } from "lucide-react";
import {
  suggestBpmStructure,
  acceptBpmStructure,
  suggestProcessDetail,
  suggestSubprocessTasks,
  suggestTaskDetail,
  loadDraftProposals,
  type AiSuggestion,
  type AiTask,
} from "@/lib/ai.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useClient } from "@/lib/client-context";
import { useSelectedEntity } from "@/lib/selected-entity";

export const Route = createFileRoute("/_authenticated/ai-suggest")({
  head: () => ({ meta: [{ title: "Sugerencia IA — BPM Atlas" }] }),
  component: AiSuggestPage,
});

type StoredState = { businessType: string; proposal: AiSuggestion | null };

const storageKey = (clientId: string | null, entityId: string | null, env: string) =>
  `bpm.ai-suggest.proposal:${clientId ?? "none"}:${entityId ?? "none"}:${env}`;

function AiSuggestPage() {
  const { t, i18n } = useTranslation();
  const { canEdit } = useAuth();
  const { currentClient, currentClientId, environment } = useClient();
  const { entity } = useSelectedEntity();
  const suggestFn = useServerFn(suggestBpmStructure);
  const acceptFn = useServerFn(acceptBpmStructure);
  const detailFn = useServerFn(suggestProcessDetail);
  const subDetailFn = useServerFn(suggestSubprocessTasks);
  const taskDetailFn = useServerFn(suggestTaskDetail);
  const loadDraftsFn = useServerFn(loadDraftProposals);
  const [businessType, setBusinessType] = useState("");
  const [language, setLanguage] = useState(i18n.language || "es");
  const [loading, setLoading] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [proposal, setProposal] = useState<AiSuggestion | null>(null);
  const [detailingKey, setDetailingKey] = useState<string | null>(null);
  const [expandedMp, setExpandedMp] = useState<Set<number>>(new Set());
  const [expandedProc, setExpandedProc] = useState<Set<string>>(new Set());
  const [expandedSub, setExpandedSub] = useState<Set<string>>(new Set());
  const [expandedTask, setExpandedTask] = useState<Set<string>>(new Set());
  const [loadingDrafts, setLoadingDrafts] = useState(false);
  const [showTree, setShowTree] = useState(true);
  const [dbTreeOpen, setDbTreeOpen] = useState(false);
  const hydratedRef = useRef(false);

  const toggleMp = (mi: number) => setExpandedMp((s) => { const n = new Set(s); if (n.has(mi)) n.delete(mi); else n.add(mi); return n; });
  const toggleProc = (k: string) => setExpandedProc((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const toggleSub = (k: string) => setExpandedSub((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const toggleTask = (k: string) => setExpandedTask((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  // Hydrate / re-hydrate when scope changes — load drafts from DB, fall back to localStorage cache
  const reloadDrafts = async (opts: { clearCache?: boolean } = {}) => {
    hydratedRef.current = false;
    setExpandedMp(new Set());
    setExpandedProc(new Set());
    setExpandedSub(new Set());
    setExpandedTask(new Set());
    setLoadingDrafts(true);
    try {
      const dbProposal = await loadDraftsFn({ data: { entityId: entity?.id } });
      if (dbProposal.macroprocesses.length > 0) {
        setProposal(dbProposal);
        if (!opts.clearCache) {
          try {
            const raw = localStorage.getItem(storageKey(currentClientId, entity?.id ?? null, environment));
            if (raw) {
              const parsed = JSON.parse(raw) as StoredState;
              setBusinessType(parsed.businessType ?? "");
            }
          } catch {}
        }
      } else {
        if (opts.clearCache) {
          setBusinessType("");
          setProposal(null);
          clearStored();
        } else {
          try {
            const raw = localStorage.getItem(storageKey(currentClientId, entity?.id ?? null, environment));
            if (raw) {
              const parsed = JSON.parse(raw) as StoredState;
              setBusinessType(parsed.businessType ?? "");
              setProposal(parsed.proposal ?? null);
            } else {
              setBusinessType("");
              setProposal(null);
            }
          } catch {
            setProposal(null);
          }
        }
      }
    } catch {
      setProposal(null);
    } finally {
      setLoadingDrafts(false);
      hydratedRef.current = true;
    }
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => { if (!cancelled) await reloadDrafts(); })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentClientId, entity?.id, environment, loadDraftsFn]);

  // Persist on change
  useEffect(() => {
    if (!hydratedRef.current) return;
    const key = storageKey(currentClientId, entity?.id ?? null, environment);
    try {
      if (!proposal && !businessType) {
        localStorage.removeItem(key);
      } else {
        localStorage.setItem(key, JSON.stringify({ businessType, proposal } satisfies StoredState));
      }
    } catch {}
  }, [businessType, proposal, currentClientId, entity?.id, environment]);

  const clearStored = () => {
    try { localStorage.removeItem(storageKey(currentClientId, entity?.id ?? null, environment)); } catch {}
  };

  const generate = async () => {
    if (businessType.trim().length < 2) return;
    setLoading(true);
    setProposal(null);
    try {
      const out = await suggestFn({ data: { businessType, language } });
      setProposal(out);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  };

  const accept = async () => {
    if (!proposal) return;
    setAccepting(true);
    try {
      const out = await acceptFn({ data: { suggestion: proposal, entityId: entity?.id } });
      const extras = (out.subprocesses || out.tasks)
        ? ` / ${out.subprocesses} SP / ${out.tasks} T`
        : "";
      toast.success(`${t("ai.accepted")} (${out.macroprocesses} MP / ${out.processes} P${extras})`);
      // Mismo comportamiento que al entrar desde "Sugerencias IA de Procesos":
      // recargar borradores desde la BD (limpiando caché local).
      await reloadDrafts({ clearCache: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setAccepting(false);
    }
  };

  // Generic helpers ------------------------------------------------
  const mutate = (fn: (p: AiSuggestion) => void) => {
    if (!proposal) return;
    const next = structuredClone(proposal);
    fn(next);
    setProposal(next);
  };
  const ensureDetail = (p: AiSuggestion, mi: number, pi: number) => {
    const proc = p.macroprocesses[mi].processes[pi];
    if (!proc.detail) proc.detail = { subprocesses: [], tasks: [] };
    if (!proc.detail.tasks) proc.detail.tasks = [];
    return proc.detail;
  };

  // ----- Edit ------
  const editProcessName = (mi: number, pi: number, value: string) =>
    mutate((p) => { p.macroprocesses[mi].processes[pi].name = value; });
  const editProcessMission = (mi: number, pi: number, value: string) =>
    mutate((p) => { p.macroprocesses[mi].processes[pi].mission = value; });
  const editMpName = (mi: number, value: string) =>
    mutate((p) => { p.macroprocesses[mi].name = value; });
  const editMpMission = (mi: number, value: string) =>
    mutate((p) => { p.macroprocesses[mi].mission = value; });
  const editSubName = (mi: number, pi: number, si: number, value: string) =>
    mutate((p) => { p.macroprocesses[mi].processes[pi].detail!.subprocesses[si].name = value; });
  const editSubMission = (mi: number, pi: number, si: number, value: string) =>
    mutate((p) => { p.macroprocesses[mi].processes[pi].detail!.subprocesses[si].mission = value; });
  const editSubTaskName = (mi: number, pi: number, si: number, ti: number, value: string) =>
    mutate((p) => { p.macroprocesses[mi].processes[pi].detail!.subprocesses[si].tasks[ti].name = value; });
  const editSubTaskDesc = (mi: number, pi: number, si: number, ti: number, value: string) =>
    mutate((p) => { p.macroprocesses[mi].processes[pi].detail!.subprocesses[si].tasks[ti].description = value; });
  const editProcTaskName = (mi: number, pi: number, ti: number, value: string) =>
    mutate((p) => { ensureDetail(p, mi, pi).tasks![ti].name = value; });
  const editProcTaskDesc = (mi: number, pi: number, ti: number, value: string) =>
    mutate((p) => { ensureDetail(p, mi, pi).tasks![ti].description = value; });

  // ----- AI detail ------
  const detailProcess = async (mi: number, pi: number) => {
    if (!proposal) return;
    const mp = proposal.macroprocesses[mi];
    const p = mp.processes[pi];
    const key = `${mi}:${pi}`;
    setDetailingKey(key);
    try {
      const out = await detailFn({
        data: {
          macroprocessName: mp.name,
          macroprocessMission: mp.mission,
          processCode: p.code,
          processName: p.name,
          processMission: p.mission,
          language,
        },
      });
      mutate((nx) => {
        const cur = nx.macroprocesses[mi].processes[pi];
        cur.detail = { subprocesses: out.subprocesses, tasks: cur.detail?.tasks ?? [] };
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setDetailingKey(null);
    }
  };

  const removeDetail = (mi: number, pi: number) =>
    mutate((p) => { p.macroprocesses[mi].processes[pi].detail = undefined; });

  const detailSubprocess = async (mi: number, pi: number, si: number) => {
    if (!proposal) return;
    const mp = proposal.macroprocesses[mi];
    const p = mp.processes[pi];
    const sp = p.detail!.subprocesses[si];
    const key = `${mi}:${pi}:${si}`;
    setDetailingKey(key);
    try {
      const out = await subDetailFn({
        data: {
          processName: p.name,
          subprocessCode: sp.code,
          subprocessName: sp.name,
          subprocessMission: sp.mission,
          language,
        },
      });
      mutate((nx) => {
        nx.macroprocesses[mi].processes[pi].detail!.subprocesses[si].tasks = out.tasks;
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setDetailingKey(null);
    }
  };

  const detailSubTask = async (mi: number, pi: number, si: number, ti: number) => {
    if (!proposal) return;
    const sp = proposal.macroprocesses[mi].processes[pi].detail!.subprocesses[si];
    const tk = sp.tasks[ti];
    const key = `t:${mi}:${pi}:${si}:${ti}`;
    setDetailingKey(key);
    try {
      const out = await taskDetailFn({
        data: { parentName: sp.name, parentKind: "subprocess", taskCode: tk.code, taskName: tk.name, language },
      });
      mutate((nx) => {
        nx.macroprocesses[mi].processes[pi].detail!.subprocesses[si].tasks[ti].description = out.description;
      });
      setExpandedTask((s) => new Set(s).add(`s:${mi}:${pi}:${si}:${ti}`));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setDetailingKey(null);
    }
  };

  const detailProcTask = async (mi: number, pi: number, ti: number) => {
    if (!proposal) return;
    const proc = proposal.macroprocesses[mi].processes[pi];
    const tk = proc.detail!.tasks![ti];
    const key = `pt:${mi}:${pi}:${ti}`;
    setDetailingKey(key);
    try {
      const out = await taskDetailFn({
        data: { parentName: proc.name, parentKind: "process", taskCode: tk.code, taskName: tk.name, language },
      });
      mutate((nx) => {
        ensureDetail(nx, mi, pi).tasks![ti].description = out.description;
      });
      setExpandedTask((s) => new Set(s).add(`p:${mi}:${pi}:${ti}`));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setDetailingKey(null);
    }
  };

  // ----- Delete ------
  const deleteMp = (mi: number) => {
    if (!proposal) return;
    const mp = proposal.macroprocesses[mi];
    const procCount = mp.processes.length;
    const subCount = mp.processes.reduce((a, p) => a + (p.detail?.subprocesses.length ?? 0), 0);
    const taskCount = mp.processes.reduce(
      (a, p) => a + (p.detail?.tasks?.length ?? 0) + (p.detail?.subprocesses.reduce((b, s) => b + s.tasks.length, 0) ?? 0),
      0,
    );
    if (procCount + subCount + taskCount > 0 && !window.confirm(`Se eliminará el Macroproceso "${mp.name}" y en cascada: ${procCount} proceso(s), ${subCount} subproceso(s), ${taskCount} tarea(s). ¿Continuar?`)) return;
    const next = structuredClone(proposal);
    next.macroprocesses.splice(mi, 1);
    setProposal(next.macroprocesses.length ? next : null);
  };
  const deleteProcess = (mi: number, pi: number) => {
    if (!proposal) return;
    const p = proposal.macroprocesses[mi].processes[pi];
    const subCount = p.detail?.subprocesses.length ?? 0;
    const procTaskCount = p.detail?.tasks?.length ?? 0;
    const subTaskCount = p.detail?.subprocesses.reduce((a, s) => a + s.tasks.length, 0) ?? 0;
    const taskCount = procTaskCount + subTaskCount;
    if (subCount + taskCount > 0 && !window.confirm(`Se eliminará el Proceso "${p.name}" y en cascada: ${subCount} subproceso(s), ${taskCount} tarea(s). ¿Continuar?`)) return;
    mutate((nx) => { nx.macroprocesses[mi].processes.splice(pi, 1); });
  };
  const deleteSubprocess = (mi: number, pi: number, si: number) => {
    if (!proposal) return;
    const sp = proposal.macroprocesses[mi].processes[pi].detail!.subprocesses[si];
    if (sp.tasks.length > 0 && !window.confirm(`Se eliminará el Subproceso "${sp.name}" y en cascada ${sp.tasks.length} tarea(s). ¿Continuar?`)) return;
    mutate((nx) => { nx.macroprocesses[mi].processes[pi].detail!.subprocesses.splice(si, 1); });
  };
  const deleteSubTask = (mi: number, pi: number, si: number, ti: number) => {
    if (!proposal) return;
    const tk = proposal.macroprocesses[mi].processes[pi].detail!.subprocesses[si].tasks[ti];
    if (!window.confirm(`Se eliminará la Tarea "${tk.name}". ¿Continuar?`)) return;
    mutate((nx) => { nx.macroprocesses[mi].processes[pi].detail!.subprocesses[si].tasks.splice(ti, 1); });
  };
  const deleteProcTask = (mi: number, pi: number, ti: number) => {
    if (!proposal) return;
    const tk = proposal.macroprocesses[mi].processes[pi].detail!.tasks![ti];
    if (!window.confirm(`Se eliminará la Tarea "${tk.name}". ¿Continuar?`)) return;
    mutate((nx) => { ensureDetail(nx, mi, pi).tasks!.splice(ti, 1); });
  };

  // ----- Add (manual) -------
  const addMp = () => {
    const next = structuredClone(proposal ?? { macroprocesses: [] });
    const n = next.macroprocesses.length + 1;
    const code = `MP-${String(n).padStart(2, "0")}`;
    next.macroprocesses.push({ code, name: "Nuevo macroproceso", mission: "", processes: [] });
    setProposal(next);
    setExpandedMp((s) => new Set(s).add(next.macroprocesses.length - 1));
  };
  const addProcess = (mi: number) => mutate((p) => {
    const mp = p.macroprocesses[mi];
    const n = mp.processes.length + 1;
    const base = mp.code.replace(/^MP-/, "");
    mp.processes.push({ code: `P-${base}-${String(n).padStart(2, "0")}`, name: "Nuevo proceso", mission: "" });
    setExpandedMp((s) => new Set(s).add(mi));
  });
  const addSubprocess = (mi: number, pi: number) => mutate((p) => {
    const d = ensureDetail(p, mi, pi);
    const proc = p.macroprocesses[mi].processes[pi];
    const n = d.subprocesses.length + 1;
    const base = proc.code.replace(/^P-/, "");
    d.subprocesses.push({ code: `SP-${base}-${String(n).padStart(2, "0")}`, name: "Nuevo subproceso", mission: "", tasks: [] });
    setExpandedProc((s) => new Set(s).add(`${mi}:${pi}`));
  });
  const addProcTask = (mi: number, pi: number) => mutate((p) => {
    const d = ensureDetail(p, mi, pi);
    const proc = p.macroprocesses[mi].processes[pi];
    const n = (d.tasks?.length ?? 0) + 1;
    const base = proc.code.replace(/^P-/, "");
    d.tasks!.push({ code: `T-${base}-${String(n).padStart(2, "0")}`, name: "Nueva tarea" });
    setExpandedProc((s) => new Set(s).add(`${mi}:${pi}`));
  });
  const addSubTask = (mi: number, pi: number, si: number) => mutate((p) => {
    const sp = p.macroprocesses[mi].processes[pi].detail!.subprocesses[si];
    const n = sp.tasks.length + 1;
    const base = sp.code.replace(/^SP-/, "");
    sp.tasks.push({ code: `T-${base}-${String(n).padStart(2, "0")}`, name: "Nueva tarea" });
    setExpandedSub((s) => new Set(s).add(`${mi}:${pi}:${si}`));
  });

  const envLabel = environment === "produccion" ? "Producción" : "Pruebas";

  // ----- Reusable task row -----
  const TaskRow = ({
    tk, taskKey, isDetailing, onDetail, onDelete, onName, onDesc,
  }: {
    tk: AiTask;
    taskKey: string;
    isDetailing: boolean;
    onDetail: () => void;
    onDelete: () => void;
    onName: (v: string) => void;
    onDesc: (v: string) => void;
  }) => {
    const open = expandedTask.has(taskKey);
    return (
      <li className="space-y-1">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => toggleTask(taskKey)} className="h-7 w-7 p-0" title={open ? "Colapsar" : "Expandir"}>
            <ChevronRight className={`h-4 w-4 transition-transform ${open ? "rotate-90" : ""}`} />
          </Button>
          <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20 text-[10px]">Tarea</Badge>
          <Badge variant="secondary" className="font-mono text-[10px]">{tk.code}</Badge>
          <Input value={tk.name} onChange={(e) => onName(e.target.value)} className="h-7 text-xs" />
          <Button size="sm" variant="outline" onClick={onDetail} disabled={isDetailing || !canEdit} title="Detallar IA" className="h-7 w-7 p-0">
            {isDetailing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
          </Button>
          <Button size="sm" variant="ghost" onClick={onDelete} title="Eliminar" className="text-destructive hover:text-destructive h-7 w-7 p-0">
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
        {open && (
          <Textarea
            value={tk.description ?? ""}
            onChange={(e) => onDesc(e.target.value)}
            rows={2}
            placeholder="Descripción / acciones de la tarea…"
            className="text-xs ml-9"
          />
        )}
      </li>
    );
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-6 py-8">
      <header>
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <h1 className="font-display text-3xl font-semibold">{t("ai.title")}</h1>
        </div>
        <p className="mt-1 text-muted-foreground">{t("ai.subtitle")}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          {t("ai.scopeHint", {
            tenant: currentClient?.name ?? "—",
            entity: entity?.name ?? t("ai.noEntity"),
            env: envLabel,
          })}
        </p>
      </header>

      <Card className="p-5 space-y-4">
        <div className="grid gap-3 md:grid-cols-[1fr_140px_auto] md:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="bt">{t("ai.businessType")}</Label>
            <Input id="bt" value={businessType} onChange={(e) => setBusinessType(e.target.value)} placeholder={t("ai.businessTypePh")} maxLength={300} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lng">{t("ai.language")}</Label>
            <Input id="lng" value={language} onChange={(e) => setLanguage(e.target.value)} maxLength={8} />
          </div>
          <Button onClick={generate} disabled={loading || businessType.trim().length < 2}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            {proposal ? t("ai.regenerate") : t("ai.generate")}
          </Button>
        </div>
      </Card>

      {(loading || loadingDrafts) && (
        <div className="rounded-xl border bg-card p-8 text-center text-muted-foreground">
          <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
          {loadingDrafts ? "Cargando propuestas guardadas…" : t("ai.thinking")}
        </div>
      )}

      {!loading && !loadingDrafts && !proposal && (
        <div className="rounded-xl border border-dashed bg-card/40 p-10 text-center space-y-4">
          <p className="text-sm text-muted-foreground">{t("ai.empty")}</p>
          <div className="flex justify-center gap-2">
            {canEdit && (
              <Button variant="outline" onClick={addMp}>
                <Plus className="mr-2 h-4 w-4" />
                Añadir Macroproceso
              </Button>
            )}
            <Button variant="outline" onClick={() => setDbTreeOpen(true)}>
              <ListTree className="mr-2 h-4 w-4" />
              Mostrar estructura jerárquica de procesos
            </Button>
          </div>
        </div>
      )}

      <DbHierarchyDialog
        open={dbTreeOpen}
        onOpenChange={setDbTreeOpen}
        entityId={entity?.id ?? null}
        entityName={entity?.name ?? null}
      />

      {proposal && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl font-semibold">
              {proposal.macroprocesses.length} {t("levels.macroprocesses")}
            </h2>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowTree((s) => !s)} title={showTree ? "Ocultar estructura" : "Mostrar estructura"}>
                {showTree ? <EyeOff className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
                {showTree ? "Ocultar" : "Mostrar"}
              </Button>
              {canEdit && (
                <Button variant="outline" onClick={addMp}>
                  <Plus className="mr-2 h-4 w-4" /> Añadir Macroproceso
                </Button>
              )}
              <Button variant="outline" onClick={generate} disabled={loading}>
                <RefreshCw className="mr-2 h-4 w-4" /> {t("ai.regenerate")}
              </Button>
              <Button onClick={accept} disabled={accepting || !canEdit}>
                {accepting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                {t("ai.accept")}
              </Button>
            </div>
          </div>

          {showTree && (
          <div className="grid gap-4">
            {proposal.macroprocesses.map((mp, mi) => {
              const mpOpen = expandedMp.has(mi);
              return (
              <Card key={mi} className="p-5 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="ghost" onClick={() => toggleMp(mi)} className="h-7 w-7 p-0" title={mpOpen ? "Colapsar" : "Expandir"}>
                        <ChevronRight className={`h-4 w-4 transition-transform ${mpOpen ? "rotate-90" : ""}`} />
                      </Button>
                      <Badge className="bg-primary/15 text-primary hover:bg-primary/20 text-[10px]">Macroproceso</Badge>
                      <Badge variant="outline" className="font-mono">{mp.code}</Badge>
                      <Input value={mp.name} onChange={(e) => editMpName(mi, e.target.value)} className="h-8 font-display text-base font-medium" />
                      <Badge variant="secondary" className="text-[10px]">{mp.processes.length} P</Badge>
                      <Button size="sm" variant="ghost" onClick={() => deleteMp(mi)} title="Eliminar" className="text-destructive hover:text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    {mpOpen && (
                      <Textarea value={mp.mission} onChange={(e) => editMpMission(mi, e.target.value)} rows={2} className="text-sm" />
                    )}
                  </div>
                </div>
                {mpOpen && (
                <>
                <ul className="divide-y rounded-lg border bg-muted/30">
                  {mp.processes.map((p, pi) => {
                    const key = `${mi}:${pi}`;
                    const isDetailing = detailingKey === key;
                    const procOpen = expandedProc.has(key);
                    const procTasks = p.detail?.tasks ?? [];
                    const hasChildren = !!p.detail && (p.detail.subprocesses.length > 0 || procTasks.length > 0);
                    return (
                      <li key={pi} className="px-3 py-2 space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Button size="sm" variant="ghost" onClick={() => toggleProc(key)} className="h-7 w-7 p-0" title={procOpen ? "Colapsar" : "Expandir"} disabled={!hasChildren}>
                            <ChevronRight className={`h-4 w-4 transition-transform ${procOpen && hasChildren ? "rotate-90" : ""} ${!hasChildren ? "opacity-30" : ""}`} />
                          </Button>
                          <Badge className="bg-blue-500/15 text-blue-700 dark:text-blue-300 hover:bg-blue-500/20 text-[10px]">Proceso</Badge>
                          <Badge variant="secondary" className="font-mono text-[10px]">{p.code}</Badge>
                          <Input value={p.name} onChange={(e) => editProcessName(mi, pi, e.target.value)} className="h-8 flex-1 min-w-[200px]" />
                          {p.detail?.subprocesses.length ? <Badge variant="outline" className="text-[10px]">{p.detail.subprocesses.length} SP</Badge> : null}
                          {procTasks.length ? <Badge variant="outline" className="text-[10px]">{procTasks.length} T</Badge> : null}
                          {p.detail ? (
                            <Button size="sm" variant="outline" onClick={() => detailProcess(mi, pi)} disabled={isDetailing || !canEdit} title={t("ai.regenerateDetail")} className="h-7 w-7 p-0">
                              {isDetailing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                            </Button>
                          ) : (
                            <Button size="sm" variant="outline" onClick={() => { detailProcess(mi, pi); setExpandedProc((s) => new Set(s).add(key)); }} disabled={isDetailing || !canEdit}>
                              {isDetailing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Wand2 className="mr-1.5 h-3.5 w-3.5" />}
                              {isDetailing ? t("ai.detailing") : t("ai.detailProcess")}
                            </Button>
                          )}
                          {canEdit && (
                            <>
                              <Button size="sm" variant="ghost" onClick={() => addSubprocess(mi, pi)} title="Añadir subproceso" className="h-7 px-2 text-[10px]">
                                <Plus className="h-3 w-3 mr-1" /> SP
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => addProcTask(mi, pi)} title="Añadir tarea" className="h-7 px-2 text-[10px]">
                                <Plus className="h-3 w-3 mr-1" /> T
                              </Button>
                            </>
                          )}
                          {p.detail && (
                            <Button size="sm" variant="ghost" onClick={() => removeDetail(mi, pi)} title={t("ai.removeDetail")} className="h-7 w-7 p-0">
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => deleteProcess(mi, pi)} title="Eliminar" className="text-destructive hover:text-destructive h-7 w-7 p-0">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>

                        {procOpen && p.detail && (
                          <div className="ml-4 space-y-2 border-l-2 border-primary/30 pl-3">
                            {p.detail.subprocesses.map((sp, si) => {
                              const spKey = `${mi}:${pi}:${si}`;
                              const isSpDetailing = detailingKey === spKey;
                              const subOpen = expandedSub.has(spKey);
                              return (
                              <div key={si} className="rounded-md border bg-background p-2 space-y-2">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <Button size="sm" variant="ghost" onClick={() => toggleSub(spKey)} className="h-7 w-7 p-0" title={subOpen ? "Colapsar" : "Expandir"}>
                                    <ChevronRight className={`h-4 w-4 transition-transform ${subOpen ? "rotate-90" : ""}`} />
                                  </Button>
                                  <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20 text-[10px]">Subproceso</Badge>
                                  <Badge variant="outline" className="font-mono text-[10px]">{sp.code}</Badge>
                                  <Input
                                    value={sp.name}
                                    onChange={(e) => editSubName(mi, pi, si, e.target.value)}
                                    className="h-7 text-sm flex-1 min-w-[180px]"
                                  />
                                  {sp.tasks.length > 0 && <Badge variant="secondary" className="text-[10px]">{sp.tasks.length} T</Badge>}
                                  <Button size="sm" variant="outline" onClick={() => { detailSubprocess(mi, pi, si); setExpandedSub((s) => new Set(s).add(spKey)); }} disabled={isSpDetailing || !canEdit} title={t("ai.detailSubprocess") ?? "Detallar IA"} className="h-7 w-7 p-0">
                                    {isSpDetailing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                                  </Button>
                                  {canEdit && (
                                    <Button size="sm" variant="ghost" onClick={() => addSubTask(mi, pi, si)} title="Añadir tarea" className="h-7 px-2 text-[10px]">
                                      <Plus className="h-3 w-3 mr-1" /> T
                                    </Button>
                                  )}
                                  <Button size="sm" variant="ghost" onClick={() => deleteSubprocess(mi, pi, si)} title="Eliminar" className="text-destructive hover:text-destructive h-7 w-7 p-0">
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                                {subOpen && (
                                  <>
                                    <Textarea
                                      value={sp.mission}
                                      onChange={(e) => editSubMission(mi, pi, si, e.target.value)}
                                      rows={2}
                                      className="text-xs"
                                    />
                                    {sp.tasks.length > 0 && (
                                      <ul className="space-y-1 pl-2">
                                        {sp.tasks.map((tk, ti) => {
                                          const tk2: AiTask = tk;
                                          const tKey = `t:${mi}:${pi}:${si}:${ti}`;
                                          const tDisplayKey = `s:${mi}:${pi}:${si}:${ti}`;
                                          return (
                                            <TaskRow
                                              key={ti}
                                              tk={tk2}
                                              taskKey={tDisplayKey}
                                              isDetailing={detailingKey === tKey}
                                              onDetail={() => detailSubTask(mi, pi, si, ti)}
                                              onDelete={() => deleteSubTask(mi, pi, si, ti)}
                                              onName={(v) => editSubTaskName(mi, pi, si, ti, v)}
                                              onDesc={(v) => editSubTaskDesc(mi, pi, si, ti, v)}
                                            />
                                          );
                                        })}
                                      </ul>
                                    )}
                                  </>
                                )}
                              </div>
                              );
                            })}

                            {procTasks.length > 0 && (
                              <ul className="space-y-1 rounded-md border bg-background p-2">
                                {procTasks.map((tk, ti) => {
                                  const tKey = `pt:${mi}:${pi}:${ti}`;
                                  const tDisplayKey = `p:${mi}:${pi}:${ti}`;
                                  return (
                                    <TaskRow
                                      key={ti}
                                      tk={tk}
                                      taskKey={tDisplayKey}
                                      isDetailing={detailingKey === tKey}
                                      onDetail={() => detailProcTask(mi, pi, ti)}
                                      onDelete={() => deleteProcTask(mi, pi, ti)}
                                      onName={(v) => editProcTaskName(mi, pi, ti, v)}
                                      onDesc={(v) => editProcTaskDesc(mi, pi, ti, v)}
                                    />
                                  );
                                })}
                              </ul>
                            )}
                          </div>
                        )}

                        {procOpen && p.detail?.subprocesses[0] && expandedSub.has(`${mi}:${pi}:0`) && (
                          <Textarea value={p.mission} onChange={(e) => editProcessMission(mi, pi, e.target.value)} rows={1} placeholder="Misión del proceso" className="text-xs ml-9" />
                        )}
                      </li>
                    );
                  })}
                </ul>
                {canEdit && (
                  <div className="flex justify-end pt-1">
                    <Button size="sm" variant="ghost" onClick={() => addProcess(mi)}>
                      <Plus className="h-3.5 w-3.5 mr-1" /> Añadir Proceso
                    </Button>
                  </div>
                )}
                </>
                )}
              </Card>
              );
            })}
          </div>
          )}
        </div>
      )}
    </div>
  );
}

type DbMacro = { id: string; code: string; name: string; entity_id: string | null };
type DbProc = { id: string; code: string; name: string; parent_id: string };
type DbSub = { id: string; code: string; name: string; parent_id: string };
type DbTask = { id: string; code: string; name: string; parent_id: string };

function DbHierarchyDialog({
  open, onOpenChange, entityId, entityName,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  entityId: string | null;
  entityName: string | null;
}) {
  const q = useQuery({
    queryKey: ["db-hierarchy", entityId],
    enabled: open,
    queryFn: async () => {
      let mpQ = supabase.from("macroprocesses").select("id,code,name,entity_id").order("code");
      if (entityId) mpQ = mpQ.eq("entity_id", entityId);
      const { data: mps, error: e1 } = await mpQ;
      if (e1) throw e1;
      const mpIds = (mps ?? []).map((m) => m.id);
      const procs = mpIds.length
        ? (await supabase.from("processes").select("id,code,name,parent_id").in("parent_id", mpIds).order("code")).data ?? []
        : [];
      const procIds = procs.map((p) => p.id);
      const subs = procIds.length
        ? (await supabase.from("subprocesses").select("id,code,name,parent_id").in("parent_id", procIds).order("code")).data ?? []
        : [];
      const subIds = subs.map((s) => s.id);
      const parentIdsForTasks = [...procIds, ...subIds];
      const tasks = parentIdsForTasks.length
        ? (await supabase.from("tasks").select("id,code,name,parent_id").in("parent_id", parentIdsForTasks).order("code")).data ?? []
        : [];
      return {
        macros: (mps ?? []) as DbMacro[],
        procs: procs as DbProc[],
        subs: subs as DbSub[],
        tasks: tasks as DbTask[],
      };
    },
  });

  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setOpenIds((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Estructura jerárquica de procesos</DialogTitle>
          <DialogDescription>
            {entityName ? `Entidad: ${entityName}` : "Todas las entidades"}
          </DialogDescription>
        </DialogHeader>
        {q.isLoading && (
          <div className="py-8 text-center text-sm text-muted-foreground">
            <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" /> Cargando…
          </div>
        )}
        {q.error && (
          <div className="py-4 text-sm text-destructive">{(q.error as Error).message}</div>
        )}
        {q.data && q.data.macros.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">No hay macroprocesos en esta entidad.</p>
        )}
        {q.data && q.data.macros.length > 0 && (
          <ul className="space-y-1 text-sm">
            {q.data.macros.map((mp) => {
              const mpOpen = openIds.has(mp.id);
              const procs = q.data!.procs.filter((p) => p.parent_id === mp.id);
              return (
                <li key={mp.id} className="rounded-md border bg-card">
                  <button onClick={() => toggle(mp.id)} className="flex w-full items-center gap-2 px-3 py-2 hover:bg-muted/50">
                    <ChevronRight className={`h-4 w-4 transition-transform ${mpOpen ? "rotate-90" : ""}`} />
                    <Badge className="bg-primary/15 text-primary hover:bg-primary/20 text-[10px]">MP</Badge>
                    <Badge variant="outline" className="font-mono text-[10px]">{mp.code}</Badge>
                    <span className="font-medium">{mp.name}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{procs.length} P</span>
                  </button>
                  {mpOpen && (
                    <ul className="space-y-1 border-t bg-muted/20 px-3 py-2">
                      {procs.length === 0 && <li className="text-xs italic text-muted-foreground">Sin procesos</li>}
                      {procs.map((p) => {
                        const pOpen = openIds.has(p.id);
                        const subs = q.data!.subs.filter((s) => s.parent_id === p.id);
                        const procTasks = q.data!.tasks.filter((t) => t.parent_id === p.id);
                        const hasChildren = subs.length + procTasks.length > 0;
                        return (
                          <li key={p.id} className="rounded border bg-background">
                            <button onClick={() => hasChildren && toggle(p.id)} className="flex w-full items-center gap-2 px-2 py-1.5 hover:bg-muted/40" disabled={!hasChildren}>
                              <ChevronRight className={`h-3.5 w-3.5 transition-transform ${pOpen && hasChildren ? "rotate-90" : ""} ${!hasChildren ? "opacity-30" : ""}`} />
                              <Badge className="bg-blue-500/15 text-blue-700 dark:text-blue-300 hover:bg-blue-500/20 text-[10px]">P</Badge>
                              <Badge variant="secondary" className="font-mono text-[10px]">{p.code}</Badge>
                              <span>{p.name}</span>
                              <span className="ml-auto text-xs text-muted-foreground">
                                {subs.length > 0 && `${subs.length} SP `}
                                {procTasks.length > 0 && `${procTasks.length} T`}
                              </span>
                            </button>
                            {pOpen && hasChildren && (
                              <ul className="space-y-1 border-t px-2 py-1.5">
                                {subs.map((s) => {
                                  const sOpen = openIds.has(s.id);
                                  const subTasks = q.data!.tasks.filter((t) => t.parent_id === s.id);
                                  return (
                                    <li key={s.id} className="rounded border bg-card">
                                      <button onClick={() => subTasks.length > 0 && toggle(s.id)} className="flex w-full items-center gap-2 px-2 py-1 hover:bg-muted/40" disabled={subTasks.length === 0}>
                                        <ChevronRight className={`h-3 w-3 transition-transform ${sOpen && subTasks.length > 0 ? "rotate-90" : ""} ${subTasks.length === 0 ? "opacity-30" : ""}`} />
                                        <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20 text-[10px]">SP</Badge>
                                        <Badge variant="outline" className="font-mono text-[10px]">{s.code}</Badge>
                                        <span className="text-xs">{s.name}</span>
                                        {subTasks.length > 0 && <span className="ml-auto text-[10px] text-muted-foreground">{subTasks.length} T</span>}
                                      </button>
                                      {sOpen && subTasks.length > 0 && (
                                        <ul className="border-t px-2 py-1 space-y-0.5">
                                          {subTasks.map((tk) => (
                                            <li key={tk.id} className="flex items-center gap-2 text-xs">
                                              <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20 text-[10px]">T</Badge>
                                              <Badge variant="outline" className="font-mono text-[10px]">{tk.code}</Badge>
                                              <span>{tk.name}</span>
                                            </li>
                                          ))}
                                        </ul>
                                      )}
                                    </li>
                                  );
                                })}
                                {procTasks.map((tk) => (
                                  <li key={tk.id} className="flex items-center gap-2 px-2 py-1 text-xs">
                                    <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20 text-[10px]">T</Badge>
                                    <Badge variant="outline" className="font-mono text-[10px]">{tk.code}</Badge>
                                    <span>{tk.name}</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
