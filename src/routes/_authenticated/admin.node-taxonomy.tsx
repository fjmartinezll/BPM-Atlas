import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Bot, User } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { STALE } from "@/lib/query-keys";
import {
  listTaxonomy, upsertNodeType, deleteNodeType, upsertNodeSubtype, deleteNodeSubtype,
} from "@/lib/node-taxonomy.functions";

export const Route = createFileRoute("/_authenticated/admin/node-taxonomy")({
  head: () => ({ meta: [{ title: "Tipología de nodos — BPM Atlas" }] }),
  component: NodeTaxonomyPage,
});

type Cat = { id: string; code: string; name: string };
type Kind = { id: string; code: string; name: string; category_id: string; is_container: boolean };
type Type = { id: string; kind_id: string; name: string; description: string | null };
type Subtype = { id: string; type_id: string; name: string; description: string | null };

function isSystem(name: string) {
  const n = name.toLowerCase();
  return n.includes("sistema") || n.includes("automá") || n.includes("servicio") || n.includes("system");
}
function ModeBadge({ name }: { name: string }) {
  const { t } = useTranslation();
  const system = isSystem(name);
  return (
    <Badge variant={system ? "secondary" : "outline"} className="h-4 text-[9px] px-1 gap-0.5">
      {system ? <Bot className="h-3 w-3" /> : <User className="h-3 w-3" />}
      {system ? t("adminTaxonomy.system") : t("adminTaxonomy.human")}
    </Badge>
  );
}

function NodeTaxonomyPage() {
  const { t } = useTranslation();
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const list = useServerFn(listTaxonomy);
  const upsertType = useServerFn(upsertNodeType);
  const delType = useServerFn(deleteNodeType);
  const upsertSub = useServerFn(upsertNodeSubtype);
  const delSub = useServerFn(deleteNodeSubtype);

  const { data, isLoading } = useQuery({
    queryKey: ["node-taxonomy"],
    staleTime: STALE.REFERENCE,
    queryFn: () => list(),
    enabled: isAdmin,
  });

  const [selectedKind, setSelectedKind] = useState<string | null>(null);
  const [typeDialog, setTypeDialog] = useState<{ open: boolean; row?: Type }>({ open: false });
  const [subDialog, setSubDialog] = useState<{ open: boolean; typeId: string; row?: Subtype } | null>(null);
  const [confirm, setConfirm] = useState<{ kind: "type" | "sub"; id: string } | null>(null);

  const kindDescription = (code: string) => {
    const keyMap: Record<string, string> = {
      task: "kindDescTask",
      subprocess: "kindDescSubprocess",
      start: "kindDescStart",
      startEvent: "kindDescStart",
      end: "kindDescEnd",
      endEvent: "kindDescEnd",
      gateway: "kindDescGateway",
      intermediate: "kindDescIntermediate",
      intermediateEvent: "kindDescIntermediate",
      pool: "kindDescPool",
      lane: "kindDescPool",
    };
    return t(`adminTaxonomy.${keyMap[code] ?? "kindDescDefault"}`);
  };

  if (!isAdmin) {
    return <div className="p-4 text-sm text-muted-foreground">{t("adminTaxonomy.restrictedAccess")}</div>;
  }
  if (isLoading || !data) return <div className="p-4 text-sm text-muted-foreground">{t("adminTaxonomy.loading")}</div>;

  const cats = data.categories as Cat[];
  const kinds = data.kinds as Kind[];
  const types = data.types as Type[];
  const subtypes = data.subtypes as Subtype[];
  const maintainableKinds = kinds.filter((k) => !k.is_container || k.code === "subprocess");
  const currentKind = maintainableKinds.find((k) => k.id === selectedKind) ?? maintainableKinds[0];
  const kindTypes = types.filter((t) => t.kind_id === currentKind?.id);

  const refresh = () => qc.invalidateQueries({ queryKey: ["node-taxonomy"] });

  async function saveType(values: { name: string; description: string }) {
    if (!currentKind) return;
    try {
      const result = await upsertType({ data: { id: typeDialog.row?.id, kindId: currentKind.id, name: values.name, description: values.description } });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(t("adminTaxonomy.typeSaved"));
      setTypeDialog({ open: false });
      refresh();
    } catch (e) { toast.error((e as Error).message); }
  }
  async function saveSub(values: { name: string; description: string }) {
    if (!subDialog) return;
    try {
      const result = await upsertSub({ data: { id: subDialog.row?.id, typeId: subDialog.typeId, name: values.name, description: values.description } });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(t("adminTaxonomy.subtypeSaved"));
      setSubDialog(null);
      refresh();
    } catch (e) { toast.error((e as Error).message); }
  }
  async function doDelete() {
    if (!confirm) return;
    try {
      if (confirm.kind === "type") await delType({ data: { id: confirm.id } });
      else await delSub({ data: { id: confirm.id } });
      toast.success(t("adminTaxonomy.deleted"));
      setConfirm(null);
      refresh();
    } catch (e) { toast.error((e as Error).message); }
  }

  return (
    <div className="flex h-full">
      <aside className="w-56 shrink-0 border-r bg-card/30">
        <div className="border-b px-3 py-2">
          <h1 className="text-sm font-semibold">{t("adminTaxonomy.title")}</h1>
          <p className="text-[10px] text-muted-foreground leading-tight">{t("adminTaxonomy.subtitle")}</p>
        </div>
        <TooltipProvider delayDuration={100}>
          <nav className="space-y-2 p-2">
            {cats.map((c) => {
              const ks = maintainableKinds.filter((k) => k.category_id === c.id);
              if (!ks.length) return null;
              return (
                <div key={c.id}>
                  <div className="px-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{c.name}</div>
                  <ul className="mt-0.5 space-y-0">
                    {ks.map((k) => {
                      const active = (currentKind?.id ?? null) === k.id;
                      return (
                        <li key={k.id}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                onClick={() => setSelectedKind(k.id)}
                                className={`flex w-full items-center justify-between rounded px-1.5 py-1 text-left text-xs ${active ? "bg-primary/10 text-primary" : "hover:bg-accent"}`}
                              >
                                <span className="truncate">{k.name}</span>
                                <Badge variant="secondary" className="h-4 text-[10px] px-1">{types.filter((t) => t.kind_id === k.id).length}</Badge>
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="right" className="max-w-[220px]">
                              <p>{kindDescription(k.code)}</p>
                            </TooltipContent>
                          </Tooltip>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </nav>
        </TooltipProvider>
      </aside>

      <main className="flex-1 overflow-auto p-3">
        {currentKind && (
          <>
            <div className="mb-2 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold">{currentKind.name}</h2>
                <p className="text-[10px] text-muted-foreground">{t("adminTaxonomy.typesAndSubtypes")}</p>
              </div>
              <Button size="sm" className="h-7 text-xs px-2" onClick={() => setTypeDialog({ open: true })}>
                <Plus className="mr-1 h-3 w-3" /> {t("adminTaxonomy.newType")}
              </Button>
            </div>
            {currentKind.code === "task" && (
              <div className="mb-2 rounded border border-dashed bg-muted/30 px-2 py-2 text-[10px] text-muted-foreground flex items-start gap-2">
                <div className="mt-0.5 shrink-0"><Bot className="h-3.5 w-3.5 text-muted-foreground" /></div>
                <div>
                  <span className="font-semibold text-foreground">{t("adminTaxonomy.autoVsAssignable")}</span>
                  <div className="mt-0.5">
                    {t("adminTaxonomy.infoDesc1")} <span className="font-medium text-foreground">{t("adminTaxonomy.infoDescKeywords")}</span>
                    {t("adminTaxonomy.infoDesc2")} (<ModeBadge name={t("adminTaxonomy.system")} />).
                    {t("adminTaxonomy.infoDesc3")} (<ModeBadge name={t("adminTaxonomy.human")} />).
                  </div>
                </div>
              </div>
            )}


            <div className="space-y-1.5">
              {kindTypes.length === 0 && (
                <div className="rounded border border-dashed p-3 text-center text-xs text-muted-foreground">
                  {t("adminTaxonomy.noTypes")}
                </div>
              )}
              {kindTypes.map((type) => {
                const subs = subtypes.filter((s) => s.type_id === type.id);
                return (
                  <div key={type.id} className="rounded border bg-card">
                    {/* Type header */}
                    <div className="flex items-center justify-between gap-2 border-b bg-muted/30 px-2 py-1.5">
                      <div className="min-w-0 flex items-center gap-1.5">
                        <Badge variant="default" className="text-[9px] uppercase tracking-wider h-4 px-1">{t("adminTaxonomy.typeBadge")}</Badge>
                        <span className="text-xs font-semibold truncate">{type.name}</span>
                        {currentKind.code === "task" && <ModeBadge name={type.name} />}
                      </div>
                      <div className="flex gap-0.5 shrink-0">
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setTypeDialog({ open: true, row: type })}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setConfirm({ kind: "type", id: type.id })}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                        <Button size="sm" variant="outline" className="h-6 text-[10px] px-1.5" onClick={() => setSubDialog({ open: true, typeId: type.id })}>
                          <Plus className="mr-0.5 h-3 w-3" /> Sub
                        </Button>
                      </div>
                    </div>
                    {type.description && (
                      <div className="px-2 py-0.5 text-[10px] text-muted-foreground border-b">{type.description}</div>
                    )}
                    {/* Subtypes list */}
                    {subs.length > 0 && (
                      <div className="bg-background/50">
                        <div className="border-b px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                          {t("adminTaxonomy.subtypesLabel", { count: subs.length })}
                        </div>
                        <ul className="divide-y">
                          {subs.map((s) => (
                            <li key={s.id} className="flex items-center justify-between gap-2 px-2 py-1">
                              <div className="min-w-0 flex items-center gap-1.5">
                                <Badge variant="outline" className="text-[9px] uppercase tracking-wider text-muted-foreground h-4 px-1 shrink-0">{t("adminTaxonomy.subBadge")}</Badge>
                                <span className="text-xs truncate">{s.name}</span>
                                {currentKind.code === "task" && <ModeBadge name={s.name} />}
                              </div>
                              <div className="flex gap-0.5 shrink-0">
                                <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => setSubDialog({ open: true, typeId: type.id, row: s })} aria-label={t("adminTaxonomy.editLabel")}>
                                  <Pencil className="h-3 w-3" />
                                </Button>
                                <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => setConfirm({ kind: "sub", id: s.id })} aria-label={t("adminTaxonomy.deleteLabel")}>
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </main>

      <EditDialog
        open={typeDialog.open}
        title={typeDialog.row ? t("adminTaxonomy.editType") : t("adminTaxonomy.newType")}
        initial={typeDialog.row ? { name: typeDialog.row.name, description: typeDialog.row.description ?? "" } : undefined}
        onClose={() => setTypeDialog({ open: false })}
        onSave={saveType}
      />
      <EditDialog
        open={!!subDialog?.open}
        title={subDialog?.row ? t("adminTaxonomy.editSubtype") : t("adminTaxonomy.newSubtype")}
        initial={subDialog?.row ? { name: subDialog.row.name, description: subDialog.row.description ?? "" } : undefined}
        onClose={() => setSubDialog(null)}
        onSave={saveSub}
      />
      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("adminTaxonomy.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("adminTaxonomy.cannotUndo")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("adminTaxonomy.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={doDelete}>{t("adminTaxonomy.delete")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function EditDialog({
  open, title, initial, onClose, onSave,
}: {
  open: boolean;
  title: string;
  initial?: { name: string; description: string };
  onClose: () => void;
  onSave: (v: { name: string; description: string }) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (open) {
      setName(initial?.name ?? "");
      setDescription(initial?.description ?? "");
    }
  }, [open, initial]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium">{t("adminTaxonomy.name")}</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoFocus />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">{t("adminTaxonomy.description")}</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-[80px] w-full resize-y rounded-md border bg-background px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-primary"
              maxLength={2000}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("adminTaxonomy.cancel")}</Button>
          <Button onClick={() => name.trim() && onSave({ name: name.trim(), description: description.trim() })}>{t("adminTaxonomy.save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
