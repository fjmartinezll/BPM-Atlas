import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useClient } from "@/lib/client-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import {
  Plus, Pencil, Trash2, ChevronRight, Building2, Layers, GitBranch, Workflow, Loader2,
} from "lucide-react";

type Status = "activo" | "borrador" | "obsoleto" | "revision";
const STATUS_OPTIONS: Status[] = ["activo", "borrador", "revision", "obsoleto"];
const MACRO_CATEGORIES = ["estrategico", "misional", "apoyo", "control", "transversal"] as const;

// ============================================================
// Generic delete with FK-aware messaging
// ============================================================
async function safeDelete(table: any, id: string, label: string) {
  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) {
    if (error.code === "23503" || /foreign key|violates/i.test(error.message)) {
      toast.error(`No se puede eliminar ${label}: tiene elementos hijos asociados. Elimina primero los dependientes.`);
    } else {
      toast.error(error.message);
    }
    return false;
  }
  toast.success(`${label} eliminado`);
  return true;
}

// ============================================================
// PROFILE EDIT DIALOG
// ============================================================
export function ProfileEditDialog({ user, trigger }: { user: { id: string; email: string | null; full_name: string | null }; trigger: React.ReactNode }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(user.full_name ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from("profiles").update({ full_name: name }).eq("id", user.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Perfil actualizado");
    qc.invalidateQueries({ queryKey: ["cc-users"] });
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) setName(user.full_name ?? ""); }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar perfil</DialogTitle>
          <DialogDescription>{user.email}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Nombre completo</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// ENTITY DIALOG (create/edit)
// ============================================================
export function EntityDialog({ entity, trigger, onDone }: { entity?: any; trigger: React.ReactNode; onDone?: () => void }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: entity?.name ?? "",
    description: entity?.description ?? "",
    status: (entity?.status ?? "activo") as Status,
  });

  const reset = () => setForm({
    name: entity?.name ?? "",
    description: entity?.description ?? "",
    status: (entity?.status ?? "activo") as Status,
  });

  const { withTenant } = useClient();
  const save = async () => {
    if (!form.name.trim()) return toast.error("El nombre es obligatorio");
    setSaving(true);
    const payload = { name: form.name, description: form.description || null, status: form.status };
    const { error } = entity
      ? await supabase.from("entities").update(payload).eq("id", entity.id)
      : await supabase.from("entities").insert(withTenant(payload));
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(entity ? "Entidad actualizada" : "Entidad creada");
    qc.invalidateQueries({ queryKey: ["cc-entities"] });
    qc.invalidateQueries({ queryKey: ["cc-counts"] });
    qc.invalidateQueries({ queryKey: ["cc-hierarchy"] });
    onDone?.();
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) reset(); }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{entity ? "Editar entidad" : "Nueva entidad"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div><Label>Nombre *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div>
            <Label>Estado</Label>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as Status })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Descripción</Label><Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// MACROPROCESS DIALOG
// ============================================================
export function MacroDialog({ entityId, macro, trigger }: { entityId: string; macro?: any; trigger: React.ReactNode }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: macro?.name ?? "", code: macro?.code ?? "",
    category: (macro?.category ?? "misional") as typeof MACRO_CATEGORIES[number],
    status: (macro?.status ?? "activo") as Status,
    mission: macro?.mission ?? "",
  });

  const { withTenant } = useClient();
  const save = async () => {
    if (!form.name.trim() || !form.code.trim()) return toast.error("Nombre y código son obligatorios");
    setSaving(true);
    const payload = { ...form, mission: form.mission || null, entity_id: entityId };
    const { error } = macro
      ? await supabase.from("macroprocesses").update(payload).eq("id", macro.id)
      : await supabase.from("macroprocesses").insert(withTenant(payload));
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(macro ? "Macroproceso actualizado" : "Macroproceso creado");
    qc.invalidateQueries({ queryKey: ["cc-hierarchy"] });
    qc.invalidateQueries({ queryKey: ["cc-counts"] });
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{macro ? "Editar macroproceso" : "Nuevo macroproceso"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Código *</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></div>
            <div>
              <Label>Categoría</Label>
              <Select value={form.category} onValueChange={(v: any) => setForm({ ...form, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{MACRO_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div><Label>Nombre *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div>
            <Label>Estado</Label>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as Status })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Misión</Label><Textarea rows={2} value={form.mission} onChange={(e) => setForm({ ...form, mission: e.target.value })} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// PROCESS / SUBPROCESS DIALOG (shared shape)
// ============================================================
function ProcOrSubDialog({
  table, parentId, item, trigger, titleNew, titleEdit,
}: {
  table: "processes" | "subprocesses";
  parentId: string; item?: any; trigger: React.ReactNode;
  titleNew: string; titleEdit: string;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: item?.name ?? "", code: item?.code ?? "",
    status: (item?.status ?? "activo") as Status, mission: item?.mission ?? "",
  });

  const { withTenant } = useClient();
  const save = async () => {
    if (!form.name.trim() || !form.code.trim()) return toast.error("Nombre y código son obligatorios");
    setSaving(true);
    const payload = { ...form, mission: form.mission || null, parent_id: parentId };
    const { error } = item
      ? await supabase.from(table).update(payload).eq("id", item.id)
      : await supabase.from(table).insert(withTenant(payload));
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Guardado");
    qc.invalidateQueries({ queryKey: ["cc-hierarchy"] });
    qc.invalidateQueries({ queryKey: ["cc-counts"] });
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{item ? titleEdit : titleNew}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Código *</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></div>
            <div>
              <Label>Estado</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as Status })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div><Label>Nombre *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><Label>Misión</Label><Textarea rows={2} value={form.mission} onChange={(e) => setForm({ ...form, mission: e.target.value })} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// DELETE CONFIRMATION
// ============================================================
function DeleteAction({ table, id, label }: { table: "entities" | "macroprocesses" | "processes" | "subprocesses"; id: string; label: string }) {
  const qc = useQueryClient();
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-rose-600 hover:text-rose-700 hover:bg-rose-500/10">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Eliminar {label}?</AlertDialogTitle>
          <AlertDialogDescription>
            Esta acción no se puede deshacer. Si existen elementos hijos relacionados la eliminación será rechazada.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            className="bg-rose-600 hover:bg-rose-700"
            onClick={async () => {
              const ok = await safeDelete(table, id, label);
              if (ok) {
                qc.invalidateQueries({ queryKey: ["cc-hierarchy"] });
                qc.invalidateQueries({ queryKey: ["cc-entities"] });
                qc.invalidateQueries({ queryKey: ["cc-counts"] });
              }
            }}
          >Eliminar</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ============================================================
// HIERARCHY MANAGER
// ============================================================
type HierEntity = {
  id: string; name: string; status: string; description: string | null;
  macros: HierMacro[];
};
type HierMacro = { id: string; name: string; code: string; status: string; category: string; mission: string | null; entity_id: string; processes: HierProcess[] };
type HierProcess = { id: string; name: string; code: string; status: string; mission: string | null; parent_id: string; subprocesses: HierSubproc[] };
type HierSubproc = { id: string; name: string; code: string; status: string; mission: string | null; parent_id: string };

export function HierarchyManager() {
  const { data, isLoading } = useQuery({
    queryKey: ["cc-hierarchy"],
    queryFn: async (): Promise<HierEntity[]> => {
      const [{ data: ents }, { data: macros }, { data: procs }, { data: subs }] = await Promise.all([
        supabase.from("entities").select("id,name,status,description").order("name"),
        supabase.from("macroprocesses").select("id,name,code,status,category,mission,entity_id").order("code"),
        supabase.from("processes").select("id,name,code,status,mission,parent_id").order("code"),
        supabase.from("subprocesses").select("id,name,code,status,mission,parent_id").order("code"),
      ]);
      const subByProc = new Map<string, HierSubproc[]>();
      (subs ?? []).forEach((s: any) => {
        const arr = subByProc.get(s.parent_id) ?? []; arr.push(s); subByProc.set(s.parent_id, arr);
      });
      const procByMacro = new Map<string, HierProcess[]>();
      (procs ?? []).forEach((p: any) => {
        const arr = procByMacro.get(p.parent_id) ?? [];
        arr.push({ ...p, subprocesses: subByProc.get(p.id) ?? [] });
        procByMacro.set(p.parent_id, arr);
      });
      const macroByEntity = new Map<string, HierMacro[]>();
      (macros ?? []).forEach((m: any) => {
        const arr = macroByEntity.get(m.entity_id) ?? [];
        arr.push({ ...m, processes: procByMacro.get(m.id) ?? [] });
        macroByEntity.set(m.entity_id, arr);
      });
      return (ents ?? []).map((e: any) => ({ ...e, macros: macroByEntity.get(e.id) ?? [] }));
    },
  });

  if (isLoading) return <div className="text-sm text-muted-foreground">Cargando jerarquía…</div>;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {data?.length ?? 0} entidad(es) · gestiona la jerarquía completa con relaciones FK.
        </div>
        <EntityDialog trigger={<Button size="sm"><Plus className="h-4 w-4 mr-1" />Nueva entidad</Button>} />
      </div>
      <div className="rounded-lg border divide-y">
        {(data ?? []).map((e) => <EntityNode key={e.id} entity={e} />)}
        {data?.length === 0 && <div className="p-6 text-center text-muted-foreground text-sm">Sin entidades. Crea la primera.</div>}
      </div>
    </div>
  );
}

function EntityNode({ entity }: { entity: HierEntity }) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="flex items-center justify-between gap-2 p-3 hover:bg-muted/40">
        <CollapsibleTrigger className="flex items-center gap-2 flex-1 text-left min-w-0">
          <ChevronRight className={`h-4 w-4 flex-shrink-0 transition-transform ${open ? "rotate-90" : ""}`} />
          <Building2 className="h-4 w-4 text-emerald-600 flex-shrink-0" />
          <span className="font-medium truncate">{entity.name}</span>
          <Badge variant="outline" className="text-xs">{entity.macros.length} macros</Badge>
          <Badge variant={entity.status === "activo" ? "default" : "secondary"} className="text-xs">{entity.status}</Badge>
        </CollapsibleTrigger>
        <div className="flex items-center gap-1 flex-shrink-0">
          <MacroDialog entityId={entity.id} trigger={<Button size="sm" variant="ghost" className="h-7 text-xs"><Plus className="h-3.5 w-3.5 mr-1" />Macro</Button>} />
          <EntityDialog entity={entity} trigger={<Button size="sm" variant="ghost" className="h-7 w-7 p-0"><Pencil className="h-3.5 w-3.5" /></Button>} />
          <DeleteAction table="entities" id={entity.id} label="entidad" />
        </div>
      </div>
      <CollapsibleContent>
        <div className="pl-8 pr-3 pb-2 space-y-1">
          {entity.macros.map((m) => <MacroNode key={m.id} macro={m} />)}
          {entity.macros.length === 0 && <div className="text-xs text-muted-foreground py-2">Sin macroprocesos.</div>}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function MacroNode({ macro }: { macro: HierMacro }) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="flex items-center justify-between gap-2 p-2 rounded hover:bg-muted/40">
        <CollapsibleTrigger className="flex items-center gap-2 flex-1 text-left min-w-0">
          <ChevronRight className={`h-3.5 w-3.5 flex-shrink-0 transition-transform ${open ? "rotate-90" : ""}`} />
          <Layers className="h-3.5 w-3.5 text-blue-600 flex-shrink-0" />
          <span className="font-mono text-xs text-muted-foreground">{macro.code}</span>
          <span className="text-sm truncate">{macro.name}</span>
          <Badge variant="outline" className="text-[10px]">{macro.category}</Badge>
          <Badge variant="outline" className="text-[10px]">{macro.processes.length} proc.</Badge>
        </CollapsibleTrigger>
        <div className="flex items-center gap-1 flex-shrink-0">
          <ProcOrSubDialog table="processes" parentId={macro.id} titleNew="Nuevo proceso" titleEdit="Editar proceso"
            trigger={<Button size="sm" variant="ghost" className="h-6 text-xs"><Plus className="h-3 w-3 mr-1" />Proceso</Button>} />
          <MacroDialog entityId={macro.entity_id} macro={macro}
            trigger={<Button size="sm" variant="ghost" className="h-6 w-6 p-0"><Pencil className="h-3 w-3" /></Button>} />
          <DeleteAction table="macroprocesses" id={macro.id} label="macroproceso" />
        </div>
      </div>
      <CollapsibleContent>
        <div className="pl-6 space-y-1">
          {macro.processes.map((p) => <ProcessNode key={p.id} process={p} />)}
          {macro.processes.length === 0 && <div className="text-xs text-muted-foreground py-1 pl-2">Sin procesos.</div>}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function ProcessNode({ process }: { process: HierProcess }) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="flex items-center justify-between gap-2 p-1.5 rounded hover:bg-muted/40">
        <CollapsibleTrigger className="flex items-center gap-2 flex-1 text-left min-w-0">
          <ChevronRight className={`h-3 w-3 flex-shrink-0 transition-transform ${open ? "rotate-90" : ""}`} />
          <GitBranch className="h-3 w-3 text-violet-600 flex-shrink-0" />
          <span className="font-mono text-[11px] text-muted-foreground">{process.code}</span>
          <span className="text-sm truncate">{process.name}</span>
          <Badge variant="outline" className="text-[10px]">{process.subprocesses.length} sub.</Badge>
        </CollapsibleTrigger>
        <div className="flex items-center gap-1 flex-shrink-0">
          <ProcOrSubDialog table="subprocesses" parentId={process.id} titleNew="Nuevo subproceso" titleEdit="Editar subproceso"
            trigger={<Button size="sm" variant="ghost" className="h-6 text-xs"><Plus className="h-3 w-3 mr-1" />Sub</Button>} />
          <ProcOrSubDialog table="processes" parentId={process.parent_id} item={process} titleNew="" titleEdit="Editar proceso"
            trigger={<Button size="sm" variant="ghost" className="h-6 w-6 p-0"><Pencil className="h-3 w-3" /></Button>} />
          <DeleteAction table="processes" id={process.id} label="proceso" />
        </div>
      </div>
      <CollapsibleContent>
        <div className="pl-6 space-y-0.5">
          {process.subprocesses.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-2 p-1 rounded hover:bg-muted/40">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <Workflow className="h-3 w-3 text-amber-600 flex-shrink-0" />
                <span className="font-mono text-[11px] text-muted-foreground">{s.code}</span>
                <span className="text-sm truncate">{s.name}</span>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <ProcOrSubDialog table="subprocesses" parentId={s.parent_id} item={s} titleNew="" titleEdit="Editar subproceso"
                  trigger={<Button size="sm" variant="ghost" className="h-6 w-6 p-0"><Pencil className="h-3 w-3" /></Button>} />
                <DeleteAction table="subprocesses" id={s.id} label="subproceso" />
              </div>
            </div>
          ))}
          {process.subprocesses.length === 0 && <div className="text-xs text-muted-foreground py-1 pl-2">Sin subprocesos.</div>}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
