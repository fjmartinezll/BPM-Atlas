import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { STALE } from "@/lib/query-keys";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Trash2, Plus, Upload, Download, Pencil } from "lucide-react";
import { toast } from "sonner";
import type { LevelKey } from "@/lib/bpm";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

type Props = { level: LevelKey; id: string };

export function BpmAuxPanels({ level, id }: Props) {
  const { t } = useTranslation();
  return (
    <Tabs defaultValue="indicators" className="w-full">
      <TabsList>
        <TabsTrigger value="indicators">{t("bpmnPanel.indicators")}</TabsTrigger>
        <TabsTrigger value="risks">{t("bpmnPanel.risks")}</TabsTrigger>
        <TabsTrigger value="documents">{t("bpmnPanel.documents")}</TabsTrigger>
        <TabsTrigger value="entities">{t("bpmnPanel.entityLinks")}</TabsTrigger>
      </TabsList>
      <TabsContent value="indicators"><IndicatorsPanel level={level} id={id} /></TabsContent>
      <TabsContent value="risks"><RisksPanel level={level} id={id} /></TabsContent>
      <TabsContent value="documents"><DocumentsPanel level={level} id={id} /></TabsContent>
      <TabsContent value="entities"><EntityLinksPanel level={level} id={id} /></TabsContent>
    </Tabs>
  );
}

// ---------------- Indicators ----------------
type Indicator = { id: string; code: string | null; name: string; formula: string | null; unit: string | null; target_value: number | null; frequency: string | null };

type IndicatorForm = { code: string; name: string; formula: string; unit: string; target_value: string; frequency: string };
const emptyIndicator: IndicatorForm = { code: "", name: "", formula: "", unit: "", target_value: "", frequency: "" };
const toForm = (r: Indicator): IndicatorForm => ({
  code: r.code ?? "", name: r.name, formula: r.formula ?? "", unit: r.unit ?? "",
  target_value: r.target_value != null ? String(r.target_value) : "", frequency: r.frequency ?? "",
});
const toPayload = (f: IndicatorForm) => ({
  code: f.code || null, name: f.name,
  formula: f.formula || null, unit: f.unit || null,
  target_value: f.target_value ? Number(f.target_value) : null,
  frequency: f.frequency || null,
});

function IndicatorFormFields({ form, setForm }: { form: IndicatorForm; setForm: (f: IndicatorForm) => void }) {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
      <Input placeholder={t("fields.code")} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
      <Input required placeholder={t("fields.name")} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="md:col-span-2" />
      <Input placeholder={t("bpmnPanel.unit")} value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
      <Input placeholder={t("bpmnPanel.target")} type="number" step="any" value={form.target_value} onChange={(e) => setForm({ ...form, target_value: e.target.value })} />
      <Input placeholder={t("bpmnPanel.frequency")} value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })} />
      <Textarea placeholder={t("bpmnPanel.formula")} value={form.formula} onChange={(e) => setForm({ ...form, formula: e.target.value })} className="md:col-span-6" rows={2} />
    </div>
  );
}

function IndicatorsPanel({ level, id }: Props) {
  const { t } = useTranslation();
  const { canEdit } = useAuth();
  const qc = useQueryClient();
  const key = ["indicators", level, id];
  const q = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await sb.from("process_indicators").select("id, code, name, formula, unit, target_value, frequency").eq("target_level", level).eq("target_id", id).order("code");
      if (error) throw error;
      return (data ?? []) as Indicator[];
    },
  });
  const [form, setForm] = useState<IndicatorForm>(emptyIndicator);
  const [editing, setEditing] = useState<Indicator | null>(null);
  const [editForm, setEditForm] = useState<IndicatorForm>(emptyIndicator);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error(t("bpmnPanel.nameRequired"));
    const { error } = await sb.from("process_indicators").insert({ target_level: level, target_id: id, ...toPayload(form) });
    if (error) return toast.error(error.message);
    setForm(emptyIndicator);
    toast.success(t("bpmnPanel.indicatorAdded"));
    qc.invalidateQueries({ queryKey: key });
  };
  const openEdit = (r: Indicator) => { setEditing(r); setEditForm(toForm(r)); };
  const saveEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    if (!editForm.name.trim()) return toast.error(t("bpmnPanel.nameRequired"));
    const { error } = await sb.from("process_indicators").update(toPayload(editForm)).eq("id", editing.id);
    if (error) return toast.error(error.message);
    setEditing(null);
    toast.success(t("bpmnPanel.indicatorUpdated"));
    qc.invalidateQueries({ queryKey: key });
  };
  const remove = async (rid: string) => {
    const { error } = await sb.from("process_indicators").delete().eq("id", rid);
    if (error) return toast.error(error.message);
    toast.success(t("bpmnPanel.indicatorDeleted"));
    qc.invalidateQueries({ queryKey: key });
  };

  return (
    <div className="space-y-4 p-4">
      <ul className="divide-y rounded-md border">
        {(q.data ?? []).map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-2 px-3 py-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                {r.code && <Badge variant="outline" className="font-mono text-[10px]">{r.code}</Badge>}
                <span className="font-medium">{r.name}</span>
                {r.unit && <span className="text-xs text-muted-foreground">{r.unit}</span>}
                {r.target_value != null && <span className="text-xs">{t("bpmnPanel.metaLabel")} {r.target_value}</span>}
                {r.frequency && <span className="text-xs text-muted-foreground">· {r.frequency}</span>}
              </div>
              {r.formula && <p className="text-xs text-muted-foreground">{r.formula}</p>}
            </div>
            {canEdit && (
              <div className="flex gap-1">
                <Button size="icon" variant="ghost" onClick={() => openEdit(r)} aria-label={t("bpmnPanel.editLabel")}><Pencil className="h-4 w-4" /></Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="icon" variant="ghost" aria-label={t("bpmnPanel.deleteLabel")}><Trash2 className="h-4 w-4" /></Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t("bpmnPanel.deleteIndicatorTitle")}</AlertDialogTitle>
                      <AlertDialogDescription>{t("bpmnPanel.cannotUndo")} Se eliminará «{r.name}».</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t("bpmnPanel.cancel")}</AlertDialogCancel>
                      <AlertDialogAction onClick={() => remove(r.id)}>{t("bpmnPanel.deleteLabel")}</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            )}
          </li>
        ))}
        {!q.isLoading && (q.data ?? []).length === 0 && <li className="px-3 py-4 text-sm text-muted-foreground">{t("bpmnPanel.noIndicators")}</li>}
      </ul>
      {canEdit && (
        <form onSubmit={add} className="space-y-2 rounded-md border bg-muted/30 p-3">
          <IndicatorFormFields form={form} setForm={setForm} />
          <div className="flex justify-end">
            <Button type="submit"><Plus className="mr-1 h-4 w-4" /> {t("bpmnPanel.addIndicator")}</Button>
          </div>
        </form>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{t("bpmnPanel.editIndicator")}</DialogTitle></DialogHeader>
          <form onSubmit={saveEdit} className="space-y-4">
            <IndicatorFormFields form={editForm} setForm={setEditForm} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>{t("bpmnPanel.cancel")}</Button>
              <Button type="submit">{t("bpmnPanel.save")}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------- Risks ----------------
type Risk = { id: string; code: string | null; description: string; probability: number; impact: number; control: string | null };
function RisksPanel({ level, id }: Props) {
  const { t } = useTranslation();
  const { canEdit } = useAuth();
  const qc = useQueryClient();
  const key = ["risks", level, id];
  const q = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await sb.from("process_risks").select("id, code, description, probability, impact, control").eq("target_level", level).eq("target_id", id).order("code");
      if (error) throw error;
      return (data ?? []) as Risk[];
    },
  });
  const [form, setForm] = useState({ code: "", description: "", probability: 1, impact: 1, control: "" });
  const add = async (e: FormEvent) => {
    e.preventDefault();
    const { error } = await sb.from("process_risks").insert({
      target_level: level, target_id: id,
      code: form.code || null, description: form.description,
      probability: form.probability, impact: form.impact, control: form.control || null,
    });
    if (error) return toast.error(error.message);
    setForm({ code: "", description: "", probability: 1, impact: 1, control: "" });
    qc.invalidateQueries({ queryKey: key });
  };
  const remove = async (rid: string) => {
    const { error } = await sb.from("process_risks").delete().eq("id", rid);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: key });
  };
  const sev = (p: number, i: number) => {
    const s = p * i;
    return s >= 15 ? "destructive" : s >= 8 ? "secondary" : "outline";
  };
  return (
    <div className="space-y-4 p-4">
      <ul className="divide-y rounded-md border">
        {(q.data ?? []).map((r) => (
          <li key={r.id} className="flex items-start justify-between gap-2 px-3 py-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                {r.code && <Badge variant="outline" className="font-mono text-[10px]">{r.code}</Badge>}
                <span className="font-medium">{r.description}</span>
                <Badge variant={sev(r.probability, r.impact)}>P{r.probability}·I{r.impact} = {r.probability * r.impact}</Badge>
              </div>
              {r.control && <p className="text-xs text-muted-foreground">{t("bpmnPanel.control")}: {r.control}</p>}
            </div>
            {canEdit && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="icon" variant="ghost" aria-label={t("bpmnPanel.deleteLabel")}><Trash2 className="h-4 w-4" /></Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t("bpmnPanel.deleteRiskTitle")}</AlertDialogTitle>
                    <AlertDialogDescription>{t("bpmnPanel.cannotUndo")} Se eliminará «{r.description}».</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t("bpmnPanel.cancel")}</AlertDialogCancel>
                    <AlertDialogAction onClick={() => remove(r.id)}>{t("bpmnPanel.deleteLabel")}</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </li>
        ))}
        {!q.isLoading && (q.data ?? []).length === 0 && <li className="px-3 py-4 text-sm text-muted-foreground">{t("bpmnPanel.noRisks")}</li>}
      </ul>
      {canEdit && (
        <form onSubmit={add} className="grid grid-cols-2 gap-2 rounded-md border bg-muted/30 p-3 md:grid-cols-6">
          <Input placeholder={t("fields.code")} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
          <Input required placeholder={t("fields.description")} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="md:col-span-3" />
          <Input type="number" min={1} max={5} value={form.probability} onChange={(e) => setForm({ ...form, probability: Number(e.target.value) })} title={t("bpmnPanel.probability")} />
          <Input type="number" min={1} max={5} value={form.impact} onChange={(e) => setForm({ ...form, impact: Number(e.target.value) })} title={t("bpmnPanel.impact")} />
          <Textarea placeholder={t("bpmnPanel.control")} value={form.control} onChange={(e) => setForm({ ...form, control: e.target.value })} className="md:col-span-5" rows={1} />
          <Button type="submit"><Plus className="mr-1 h-4 w-4" /> {t("bpmnPanel.addRisk")}</Button>
        </form>
      )}
    </div>
  );
}

// ---------------- Documents ----------------
type DocRow = { id: string; name: string; version: string | null; mime_type: string | null; size_bytes: number | null; storage_path: string };
function DocumentsPanel({ level, id }: Props) {
  const { t } = useTranslation();
  const { canEdit, user } = useAuth();
  const qc = useQueryClient();
  const key = ["documents", level, id];
  const q = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await sb.from("process_documents").select("id, name, version, mime_type, size_bytes, storage_path").eq("target_level", level).eq("target_id", id).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as DocRow[];
    },
  });
  const [uploading, setUploading] = useState(false);
  const [version, setVersion] = useState("");

  const onUpload = async (file: File) => {
    if (!file || !user) return;
    setUploading(true);
    const path = `${level}/${id}/${Date.now()}-${file.name}`;
    const up = await supabase.storage.from("bpm-docs").upload(path, file, { contentType: file.type });
    if (up.error) { setUploading(false); return toast.error(up.error.message); }
    const { error } = await sb.from("process_documents").insert({
      target_level: level, target_id: id, name: file.name,
      version: version || null, mime_type: file.type || null,
      size_bytes: file.size, storage_path: path,
    });
    setUploading(false);
    setVersion("");
    if (error) return toast.error(error.message);
    toast.success(t("bpmnPanel.documentUploaded"));
    qc.invalidateQueries({ queryKey: key });
  };
  const download = async (path: string) => {
    const { data, error } = await supabase.storage.from("bpm-docs").createSignedUrl(path, 60);
    if (error || !data?.signedUrl) return toast.error(error?.message ?? "Error");
    window.open(data.signedUrl, "_blank");
  };
  const remove = async (row: DocRow) => {
    await supabase.storage.from("bpm-docs").remove([row.storage_path]);
    const { error } = await sb.from("process_documents").delete().eq("id", row.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: key });
  };
  return (
    <div className="space-y-4 p-4">
      <ul className="divide-y rounded-md border">
        {(q.data ?? []).map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-2 px-3 py-2">
            <div className="min-w-0">
              <div className="font-medium">{r.name} {r.version && <Badge variant="outline" className="ml-2 text-[10px]">v{r.version}</Badge>}</div>
              <div className="text-xs text-muted-foreground">{r.mime_type ?? ""} {r.size_bytes ? `· ${(r.size_bytes / 1024).toFixed(1)} KB` : ""}</div>
            </div>
            <div className="flex gap-1">
              <Button size="icon" variant="ghost" onClick={() => download(r.storage_path)} aria-label={t("bpmnPanel.download")}><Download className="h-4 w-4" /></Button>
              {canEdit && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="icon" variant="ghost" aria-label={t("bpmnPanel.deleteLabel")}><Trash2 className="h-4 w-4" /></Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t("bpmnPanel.deleteDocumentTitle")}</AlertDialogTitle>
                      <AlertDialogDescription>{t("bpmnPanel.deleteDocumentDesc", { name: r.name })}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t("bpmnPanel.cancel")}</AlertDialogCancel>
                      <AlertDialogAction onClick={() => remove(r)}>{t("bpmnPanel.deleteLabel")}</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </li>
        ))}
        {!q.isLoading && (q.data ?? []).length === 0 && <li className="px-3 py-4 text-sm text-muted-foreground">{t("bpmnPanel.noDocuments")}</li>}
      </ul>
      {canEdit && (
        <div className="flex items-end gap-2 rounded-md border bg-muted/30 p-3">
          <div className="space-y-1.5">
            <Label className="text-xs">{t("bpmnPanel.documentVersion")}</Label>
            <Input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="1.0" className="w-28" />
          </div>
          <div className="flex-1 space-y-1.5">
            <Label className="text-xs">{t("bpmnPanel.documentFile")}</Label>
            <Input type="file" disabled={uploading} onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])} />
          </div>
          <Button disabled={uploading} variant="outline"><Upload className="mr-1 h-4 w-4" />{uploading ? t("bpmnPanel.uploading") : t("bpmnPanel.upload")}</Button>
        </div>
      )}
    </div>
  );
}

// ---------------- Entity links ----------------
type Link = { id: string; entity_id: string; role: "proveedor" | "cliente" | "entrada" | "salida"; notes: string | null; entity?: { name: string } | null };
function EntityLinksPanel({ level, id }: Props) {
  const { t } = useTranslation();
  const { canEdit } = useAuth();
  const qc = useQueryClient();
  const key = ["entity-links", level, id];
  const q = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await sb.from("entity_process_links").select("*, entity:entities(name)").eq("target_level", level).eq("target_id", id);
      if (error) throw error;
      return (data ?? []) as Link[];
    },
  });
  const entitiesQ = useQuery({
    queryKey: ["entities-options"],
    staleTime: STALE.REFERENCE,
    queryFn: async () => {
      const { data } = await supabase.from("entities").select("id,name").order("name");
      return (data ?? []) as { id: string; name: string }[];
    },
  });
  const [form, setForm] = useState<{ entity_id: string; role: Link["role"]; notes: string }>({ entity_id: "", role: "proveedor", notes: "" });
  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.entity_id) return;
    const { error } = await sb.from("entity_process_links").insert({
      target_level: level, target_id: id, entity_id: form.entity_id, role: form.role, notes: form.notes || null,
    });
    if (error) return toast.error(error.message);
    setForm({ entity_id: "", role: "proveedor", notes: "" });
    qc.invalidateQueries({ queryKey: key });
  };
  const remove = async (rid: string) => {
    const { error } = await sb.from("entity_process_links").delete().eq("id", rid);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: key });
  };
  return (
    <div className="space-y-4 p-4">
      <ul className="divide-y rounded-md border">
        {(q.data ?? []).map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-2 px-3 py-2">
            <div>
              <span className="font-medium">{r.entity?.name ?? r.entity_id}</span>
              <Badge variant="outline" className="ml-2 capitalize">{r.role}</Badge>
              {r.notes && <p className="text-xs text-muted-foreground">{r.notes}</p>}
            </div>
            {canEdit && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="icon" variant="ghost" aria-label={t("bpmnPanel.deleteLabel")}><Trash2 className="h-4 w-4" /></Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t("bpmnPanel.deleteLinkTitle")}</AlertDialogTitle>
                      <AlertDialogDescription>{t("bpmnPanel.deleteLinkDesc", { name: r.entity?.name ?? r.entity_id })}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t("bpmnPanel.cancel")}</AlertDialogCancel>
                      <AlertDialogAction onClick={() => remove(r.id)}>{t("bpmnPanel.deleteLabel")}</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
            )}
          </li>
        ))}
        {!q.isLoading && (q.data ?? []).length === 0 && <li className="px-3 py-4 text-sm text-muted-foreground">{t("bpmnPanel.noLinks")}</li>}
      </ul>
      {canEdit && (
        <form onSubmit={add} className="grid grid-cols-1 gap-2 rounded-md border bg-muted/30 p-3 md:grid-cols-5">
          <Select value={form.entity_id} onValueChange={(v) => setForm({ ...form, entity_id: v })}>
            <SelectTrigger className="md:col-span-2"><SelectValue placeholder={t("bpmnPanel.entity")} /></SelectTrigger>
            <SelectContent>
              {(entitiesQ.data ?? []).map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as Link["role"] })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="proveedor">{t("bpmnPanel.roleProveedor")}</SelectItem>
              <SelectItem value="cliente">{t("bpmnPanel.roleCliente")}</SelectItem>
              <SelectItem value="entrada">{t("bpmnPanel.roleEntrada")}</SelectItem>
              <SelectItem value="salida">{t("bpmnPanel.roleSalida")}</SelectItem>
            </SelectContent>
          </Select>
          <Input placeholder={t("bpmnPanel.notes")} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          <Button type="submit"><Plus className="mr-1 h-4 w-4" /> {t("bpmnPanel.addLink")}</Button>
        </form>
      )}
    </div>
  );
}
