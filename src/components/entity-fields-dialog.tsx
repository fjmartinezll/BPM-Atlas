import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Plus, Trash2, Copy, ArrowUp, ArrowDown, Save, Pencil, Check, X, Table2, ListTree, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import {
  listFieldCatalog, upsertField, deleteField, reorderFieldCatalog,
  listDiagramColumns, upsertColumn, deleteColumn, reorderColumns,
  listDiagramTables, createDiagramTable, renameDiagramTable, deleteDiagramTable,
} from "@/lib/entity-fields.functions";



import { FIELD_TYPES, type FieldType } from "@/lib/field-types";
const DATA_TYPES = FIELD_TYPES;

type DataType = FieldType;

type CatalogRow = {
  id: string;
  name: string;
  data_type: DataType;
  description: string | null;
  client_id: string | null;
  environment: string;
};

type ColumnRow = {
  id: string;
  diagram_id: string;
  node_id: string;
  field_id: string;
  position: number;
  is_primary_key: boolean;
  is_nullable: boolean;
  fk_target_node_id: string | null;
  fk_target_column_id: string | null;
  entity_field_catalog: { name: string; data_type: DataType } | null;
};

export function EntityFieldsDialog({
  open, onOpenChange, diagramId, clientId, environment,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  diagramId: string;
  clientId: string;
  environment: string;
}) {
  const qc = useQueryClient();

  const listCatalogFn = useServerFn(listFieldCatalog);
  const upsertFieldFn = useServerFn(upsertField);
  const deleteFieldFn = useServerFn(deleteField);
  const reorderCatalogFn = useServerFn(reorderFieldCatalog);
  const listColumnsFn = useServerFn(listDiagramColumns);
  const upsertColumnFn = useServerFn(upsertColumn);
  const deleteColumnFn = useServerFn(deleteColumn);
  const reorderColumnsFn = useServerFn(reorderColumns);
  const listTablesFn = useServerFn(listDiagramTables);
  const createTableFn = useServerFn(createDiagramTable);
  const renameTableFn = useServerFn(renameDiagramTable);
  const deleteTableFn = useServerFn(deleteDiagramTable);

  const tablesQ = useQuery({
    queryKey: ["entity-diagram-tables", diagramId],
    enabled: open && !!diagramId,
    queryFn: async () =>
      (await listTablesFn({ data: { diagramId } })) as { id: string; label: string }[],
  });
  const tables = useMemo(
    () => (tablesQ.data ?? []).map((t) => ({ id: t.id, label: t.label })),
    [tablesQ.data],
  );

  const [activeTab, setActiveTab] = useState("catalog");
  const [selectedNodeId, setSelectedNodeId] = useState<string>("");

  const catalogQ = useQuery({
    queryKey: ["entity-field-catalog", clientId, environment],
    enabled: open,
    queryFn: async () => (await listCatalogFn({ data: { clientId, environment } })) as CatalogRow[],
  });

  const columnsQ = useQuery({
    queryKey: ["entity-table-columns", diagramId],
    enabled: open && !!diagramId,
    queryFn: async () => (await listColumnsFn({ data: { diagramId } })) as ColumnRow[],
  });

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["entity-field-catalog", clientId, environment] });
    qc.invalidateQueries({ queryKey: ["entity-table-columns", diagramId] });
    qc.invalidateQueries({ queryKey: ["entity-diagram-tables", diagramId] });
    // Force the BD modeling canvas (tables + relation lines) to rebuild after any change.
    qc.invalidateQueries({ queryKey: ["diagram"] });
  };

  // ----- Tables CRUD -----
  const [newTableLabel, setNewTableLabel] = useState("");
  const createTableMut = useMutation({
    mutationFn: (label: string) =>
      createTableFn({ data: { diagramId, clientId, environment, label } }),
    onSuccess: (res) => {
      setNewTableLabel("");
      invalidateAll();
      setSelectedNodeId((res as { id: string }).id);
      toast.success("Tabla creada");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const renameTableMut = useMutation({
    mutationFn: (vars: { id: string; label: string }) => renameTableFn({ data: vars }),
    onSuccess: () => {
      invalidateAll();
      toast.success("Tabla renombrada");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const deleteTableMut = useMutation({
    mutationFn: (id: string) => deleteTableFn({ data: { id } }),
    onSuccess: () => {
      setSelectedNodeId("");
      invalidateAll();
      toast.success("Tabla eliminada");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const [editingTableLabel, setEditingTableLabel] = useState<string | null>(null);


  // ----- Catalog form -----
  const [newField, setNewField] = useState<{ name: string; data_type: DataType; description: string }>({
    name: "", data_type: "text", description: "",
  });

  const saveFieldMut = useMutation({
    mutationFn: (vars: { id?: string; name: string; data_type: DataType; description: string }) =>
      upsertFieldFn({ data: { id: vars.id, clientId, environment, name: vars.name, data_type: vars.data_type, description: vars.description || null } }),
    onSuccess: () => { invalidateAll(); toast.success("Campo guardado"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteFieldMut = useMutation({
    mutationFn: (id: string) => deleteFieldFn({ data: { id } }),
    onSuccess: () => { invalidateAll(); toast.success("Campo borrado"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const reorderCatalogMut = useMutation({
    mutationFn: (orderedIds: string[]) =>
      reorderCatalogFn({ data: { clientId, environment, orderedIds } }),
    onSuccess: () => invalidateAll(),
    onError: (e: Error) => toast.error(e.message),
  });

  const moveCatalog = (index: number, dir: -1 | 1) => {
    const list = catalogQ.data ?? [];
    const j = index + dir;
    if (j < 0 || j >= list.length) return;
    const ids = list.map((f) => f.id);
    [ids[index], ids[j]] = [ids[j], ids[index]];
    reorderCatalogMut.mutate(ids);
  };


  // ----- Columns -----
  const columnsForSelected = useMemo(
    () => (columnsQ.data ?? []).filter((c) => c.node_id === selectedNodeId).sort((a, b) => a.position - b.position),
    [columnsQ.data, selectedNodeId],
  );

  const usedFieldIds = useMemo(
    () => new Set(columnsForSelected.map((c) => c.field_id)),
    [columnsForSelected],
  );

  // Drafts: pending edits per column id (survive refetches until saved/discarded)
  type ColDraft = {
    is_primary_key: boolean;
    is_nullable: boolean;
    fk_target_node_id: string | null;
    fk_target_column_id: string | null;
  };
  const [drafts, setDrafts] = useState<Record<string, ColDraft>>({});

  const updateDraft = (colId: string, patch: Partial<ColDraft>) => {
    setDrafts((prev) => {
      const base = prev[colId] ?? (() => {
        const c = (columnsQ.data ?? []).find((x) => x.id === colId);
        return {
          is_primary_key: c?.is_primary_key ?? false,
          is_nullable: c?.is_nullable ?? true,
          fk_target_node_id: c?.fk_target_node_id ?? null,
          fk_target_column_id: c?.fk_target_column_id ?? null,
        };
      })();
      return { ...prev, [colId]: { ...base, ...patch } };
    });
  };

  const isDirty = (c: ColumnRow): boolean => {
    const d = drafts[c.id];
    if (!d) return false;
    return (
      d.is_primary_key !== c.is_primary_key ||
      d.is_nullable !== c.is_nullable ||
      d.fk_target_node_id !== c.fk_target_node_id ||
      d.fk_target_column_id !== c.fk_target_column_id
    );
  };

  const saveColMut = useMutation({
    mutationFn: (vars: Partial<ColumnRow> & { fieldId: string }) =>
      upsertColumnFn({ data: {
        id: vars.id,
        clientId, environment,
        diagramId, nodeId: selectedNodeId,
        fieldId: vars.fieldId,
        position: vars.position,
        isPrimaryKey: vars.is_primary_key,
        isNullable: vars.is_nullable,
        fkTargetNodeId: vars.fk_target_node_id,
        fkTargetColumnId: vars.fk_target_column_id,
      } }),
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteColMut = useMutation({
    mutationFn: (id: string) => deleteColumnFn({ data: { id } }),
    onSuccess: () => invalidateAll(),
    onError: (e: Error) => toast.error(e.message),
  });

  const reorderColumnsMut = useMutation({
    mutationFn: (orderedIds: string[]) =>
      reorderColumnsFn({ data: { diagramId, nodeId: selectedNodeId, orderedIds } }),
    onSuccess: () => invalidateAll(),
    onError: (e: Error) => toast.error(e.message),
  });

  const moveColumn = (index: number, dir: -1 | 1) => {
    const j = index + dir;
    if (j < 0 || j >= columnsForSelected.length) return;
    const ids = columnsForSelected.map((c) => c.id);
    [ids[index], ids[j]] = [ids[j], ids[index]];
    reorderColumnsMut.mutate(ids);
  };

  const dirtyColumns = columnsForSelected.filter(isDirty);

  const saveAllDrafts = async () => {
    if (dirtyColumns.length === 0) return;
    // Save PK-off changes first so we never trip the "unique PK per table" rule
    // when moving the PK from one column to another in a single batch.
    const ordered = [...dirtyColumns].sort((a, b) => {
      const da = drafts[a.id]; const db = drafts[b.id];
      const aOff = !da.is_primary_key && a.is_primary_key ? 0 : 1;
      const bOff = !db.is_primary_key && b.is_primary_key ? 0 : 1;
      return aOff - bOff;
    });
    try {
      for (const c of ordered) {
        const d = drafts[c.id];
        await saveColMut.mutateAsync({
          id: c.id,
          fieldId: c.field_id,
          position: c.position,
          is_primary_key: d.is_primary_key,
          is_nullable: d.is_primary_key ? false : d.is_nullable,
          fk_target_node_id: d.fk_target_node_id,
          fk_target_column_id: d.fk_target_column_id,
        });
      }
      setDrafts({});
      invalidateAll();
      toast.success(`Configuración guardada (${ordered.length})`);
    } catch {
      // toast already raised by mutation
    }
  };

  const discardDrafts = () => setDrafts({});

  const [addFieldId, setAddFieldId] = useState<string>("");
  const availableToAdd = (catalogQ.data ?? []).filter((f) => !usedFieldIds.has(f.id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader><DialogTitle>Campos-Tablas</DialogTitle></DialogHeader>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="catalog"><ListTree className="mr-1 h-3.5 w-3.5" /> Catálogo de campos</TabsTrigger>
            <TabsTrigger value="tables"><Table2 className="mr-1 h-3.5 w-3.5" /> Catálogo de Tablas</TabsTrigger>
          </TabsList>

          <TabsContent value="tables">
            <div className="space-y-3">
              <div className="rounded border bg-muted/30 p-3 space-y-2">
                <div className="text-xs font-medium text-muted-foreground">Crear nueva tabla</div>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    className="h-9 w-72"
                    placeholder="Nombre de la nueva tabla"
                    value={newTableLabel}
                    onChange={(e) => setNewTableLabel(e.target.value)}
                  />
                  <Button size="sm"
                    disabled={!newTableLabel.trim() || createTableMut.isPending}
                    onClick={() => createTableMut.mutate(newTableLabel.trim())}>
                    <Plus className="mr-1 h-3 w-3" /> Nueva tabla
                  </Button>
                </div>
              </div>

              <div className="max-h-[55vh] space-y-1 overflow-auto rounded border">
                <div className="grid grid-cols-12 items-center gap-2 bg-muted px-3 py-1.5 text-[11px] font-semibold text-muted-foreground">
                  <span className="col-span-1">#</span>
                  <span className="col-span-5">Tabla</span>
                  <span className="col-span-2 text-center">Campos</span>
                  <span className="col-span-4 text-right">Acciones</span>
                </div>
                {tables.length === 0 && (
                  <p className="px-3 py-4 text-sm italic text-muted-foreground">Aún no hay tablas. Crea la primera arriba.</p>
                )}
                {tables.map((t, i) => {
                  const colCount = (columnsQ.data ?? []).filter((c) => c.node_id === t.id).length;
                  const isEditing = editingTableLabel !== null && selectedNodeId === t.id;
                  return (
                    <div key={t.id} className="grid grid-cols-12 items-center gap-2 border-t px-3 py-1.5 text-xs hover:bg-muted/40">
                      <span className="col-span-1 font-mono text-muted-foreground">{i + 1}</span>
                      <span className="col-span-5">
                        {isEditing ? (
                          <Input
                            className="h-8"
                            value={editingTableLabel ?? ""}
                            onChange={(e) => setEditingTableLabel(e.target.value)}
                            autoFocus
                          />
                        ) : (
                          <span className="font-medium">{t.label}</span>
                        )}
                      </span>
                      <span className="col-span-2 text-center text-muted-foreground">{colCount}</span>
                      <span className="col-span-4 flex justify-end gap-1">
                        {isEditing ? (
                          <>
                            <Button size="sm"
                              disabled={!editingTableLabel?.trim() || renameTableMut.isPending}
                              onClick={() => {
                                const label = (editingTableLabel ?? "").trim();
                                renameTableMut.mutate({ id: t.id, label }, {
                                  onSuccess: () => setEditingTableLabel(null),
                                });
                              }}>
                              <Check className="h-3 w-3" />
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditingTableLabel(null)}>
                              <X className="h-3 w-3" />
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button size="sm" variant="ghost"
                              onClick={() => { setSelectedNodeId(t.id); setEditingTableLabel(t.label); }}>
                              <Pencil className="mr-1 h-3 w-3" /> Renombrar
                            </Button>
                            <Button size="sm" variant="ghost" className="text-destructive"
                              onClick={() => {
                                if (!confirm(`¿Eliminar la tabla "${t.label}"?`)) return;
                                deleteTableMut.mutate(t.id);
                              }}
                              disabled={deleteTableMut.isPending || colCount > 0}
                              title={colCount > 0 ? "No se puede eliminar: la tabla tiene campos asociados" : undefined}>
                              <Trash2 className="mr-1 h-3 w-3" /> Eliminar
                            </Button>

                            <Button size="sm" variant="outline"
                              onClick={() => { setSelectedNodeId(t.id); setEditingTableLabel(null); setActiveTab("columns"); }}>
                              Gestionar campos <ArrowRight className="ml-1 h-3 w-3" />
                            </Button>
                          </>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </TabsContent>


          <TabsContent value="catalog">
            <div className="max-h-[60vh] space-y-2 overflow-auto">
              <div className="grid grid-cols-12 items-center gap-2 rounded border bg-muted/40 p-2 text-xs">
                <Input className="col-span-3 h-8" placeholder="nombre"
                  value={newField.name} onChange={(e) => setNewField({ ...newField, name: e.target.value })} />
                <select className="col-span-2 h-8 rounded border bg-background px-1"
                  value={newField.data_type}
                  onChange={(e) => setNewField({ ...newField, data_type: e.target.value as DataType })}>
                  {DATA_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                <Input className="col-span-5 h-8" placeholder="descripción"
                  value={newField.description} onChange={(e) => setNewField({ ...newField, description: e.target.value })} />
                <Button size="sm" className="col-span-2"
                  disabled={!newField.name.trim() || saveFieldMut.isPending}
                  onClick={() => {
                    saveFieldMut.mutate(newField, {
                      onSuccess: () => setNewField({ name: "", data_type: "text", description: "" }),
                    });
                  }}>
                  <Plus className="mr-1 h-3 w-3" /> Añadir campo
                </Button>
              </div>

              {(catalogQ.data ?? []).length === 0 && (
                <p className="text-sm italic text-muted-foreground">Aún no hay campos en el catálogo.</p>
              )}

              {(catalogQ.data ?? []).map((f, i) => {
                const inUse = (columnsQ.data ?? []).some((c) => c.field_id === f.id);
                return (
                  <CatalogEditableRow
                    key={f.id}
                    field={f}
                    canMoveUp={i > 0}
                    canMoveDown={i < (catalogQ.data ?? []).length - 1}
                    onMoveUp={() => moveCatalog(i, -1)}
                    onMoveDown={() => moveCatalog(i, 1)}
                    onSave={(patch) => saveFieldMut.mutate({ id: f.id, ...patch })}
                    onDelete={() => deleteFieldMut.mutate(f.id)}
                    onDuplicate={() => saveFieldMut.mutate({ name: f.name + " (copia)", data_type: f.data_type, description: f.description ?? "" })}
                    deleteDisabled={inUse}
                  />
                );
              })}


            </div>
          </TabsContent>

          <TabsContent value="columns">
            <div className="space-y-3">
              <div className="rounded border bg-muted/30 p-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">Tabla:</span>
                  <select
                    className="h-9 min-w-64 rounded border bg-background px-2 text-sm"
                    value={selectedNodeId}
                    onChange={(e) => { setSelectedNodeId(e.target.value); setEditingTableLabel(null); }}
                  >
                    <option value="">— elige una tabla —</option>
                    {tables.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                  </select>
                  <span className="text-[11px] text-muted-foreground">
                    Para crear, renombrar o eliminar tablas usa la pestaña <strong>Catálogo de tablas</strong>.
                  </span>
                </div>
              </div>



              {selectedNodeId && (
                <>
                  <div className="flex items-center justify-between gap-2 rounded border bg-muted/30 p-2">
                    <span className="text-xs text-muted-foreground">
                      {dirtyColumns.length > 0
                        ? `${dirtyColumns.length} cambio(s) sin guardar`
                        : "Sin cambios pendientes"}
                    </span>
                    <div className="flex gap-2">
                      <Button size="sm" variant="ghost"
                        disabled={dirtyColumns.length === 0 || saveColMut.isPending}
                        onClick={discardDrafts}>
                        Descartar
                      </Button>
                      <Button size="sm"
                        disabled={dirtyColumns.length === 0 || saveColMut.isPending}
                        onClick={saveAllDrafts}>
                        <Save className="mr-1 h-3 w-3" /> Guardar cambios
                      </Button>
                    </div>
                  </div>
                  <div className="max-h-[55vh] space-y-2 overflow-auto">
                    <div className="grid grid-cols-12 items-center gap-2 px-1 text-[11px] font-semibold text-muted-foreground">
                      <span className="col-span-3">Campo</span>
                      <span className="col-span-1">Tipo</span>
                      <span className="col-span-1">PK</span>
                      <span className="col-span-1">Nulo</span>
                      <span className="col-span-2">FK → tabla</span>
                      <span className="col-span-2">FK → campo</span>
                      <span className="col-span-2 text-right">Acciones</span>
                    </div>
                    <div className="rounded border bg-muted/20 px-2 py-1 text-[10px] leading-tight text-muted-foreground">
                      <strong>Campo</strong>: nombre del campo del catálogo. <strong>Tipo</strong>: tipo de dato. <strong>PK</strong>: clave primaria (identificador único de la fila). <strong>Nulo</strong>: permite valores vacíos. <strong>FK → tabla</strong>: tabla destino de la clave foránea. <strong>FK → campo</strong>: campo destino referenciado. <strong>Acciones</strong>: reordenar o eliminar.
                    </div>

                    {columnsForSelected.length === 0 && (
                      <p className="text-sm italic text-muted-foreground">Esta tabla aún no tiene campos.</p>
                    )}
                    {columnsForSelected.map((c, i) => {
                      const d = drafts[c.id];
                      const effective: ColumnRow = d
                        ? { ...c, is_primary_key: d.is_primary_key, is_nullable: d.is_nullable,
                            fk_target_node_id: d.fk_target_node_id, fk_target_column_id: d.fk_target_column_id }
                        : c;
                      return (
                        <ColumnEditableRow
                          key={c.id}
                          column={effective}
                          dirty={isDirty(c)}
                          tables={tables.filter((t) => t.id !== selectedNodeId)}
                          allColumns={columnsQ.data ?? []}
                          canMoveUp={i > 0}
                          canMoveDown={i < columnsForSelected.length - 1}
                          onMoveUp={() => moveColumn(i, -1)}
                          onMoveDown={() => moveColumn(i, 1)}
                          onChange={(patch) => updateDraft(c.id, patch)}
                          onDelete={() => {
                            setDrafts((p) => { const n = { ...p }; delete n[c.id]; return n; });
                            deleteColMut.mutate(c.id);
                          }}
                        />
                      );
                    })}


                    <div className="flex items-center gap-2 rounded border bg-muted/30 p-2">
                      <select className="h-8 flex-1 rounded border bg-background px-1 text-xs"
                        value={addFieldId} onChange={(e) => setAddFieldId(e.target.value)}>
                        <option value="">— elige un campo del catálogo —</option>
                        {availableToAdd.map((f) => (
                          <option key={f.id} value={f.id}>{f.name} ({f.data_type})</option>
                        ))}
                      </select>
                      <Button size="sm" disabled={!addFieldId || saveColMut.isPending}
                        onClick={() => {
                          saveColMut.mutate(
                            { fieldId: addFieldId, position: columnsForSelected.length },
                            {
                              onSuccess: () => {
                                setAddFieldId("");
                                invalidateAll();
                              },
                            },
                          );
                        }}>
                        <Plus className="mr-1 h-3 w-3" /> Añadir campo
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CatalogEditableRow({
  field, onSave, onDelete, onDuplicate, onMoveUp, onMoveDown, canMoveUp, canMoveDown, deleteDisabled,
}: {
  field: CatalogRow;
  onSave: (patch: { name: string; data_type: DataType; description: string }) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  deleteDisabled?: boolean;
}) {

  const [name, setName] = useState(field.name);
  const [dt, setDt] = useState<DataType>(field.data_type);
  const [desc, setDesc] = useState(field.description ?? "");
  const dirty = name !== field.name || dt !== field.data_type || (desc ?? "") !== (field.description ?? "");

  return (
    <div className="grid grid-cols-12 items-center gap-2 rounded border p-2 text-xs">
      <div className="col-span-1 flex flex-col">
        <button type="button" disabled={!canMoveUp} onClick={onMoveUp}
          className="text-muted-foreground hover:text-foreground disabled:opacity-30" aria-label="Subir">
          <ArrowUp className="h-3.5 w-3.5" />
        </button>
        <button type="button" disabled={!canMoveDown} onClick={onMoveDown}
          className="text-muted-foreground hover:text-foreground disabled:opacity-30" aria-label="Bajar">
          <ArrowDown className="h-3.5 w-3.5" />
        </button>
      </div>
      <Input className="col-span-3 h-8" value={name} onChange={(e) => setName(e.target.value)} />
      <select className="col-span-2 h-8 rounded border bg-background px-1"
        value={dt} onChange={(e) => setDt(e.target.value as DataType)}>
        {DATA_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
      </select>
      <Input className="col-span-3 h-8" placeholder="descripción"
        value={desc} onChange={(e) => setDesc(e.target.value)} />
      <Button size="sm" variant="outline" className="col-span-1" disabled={!dirty || !name.trim()}
        onClick={() => onSave({ name, data_type: dt, description: desc })}>
        Guardar
      </Button>
      <Button size="sm" variant="ghost" className="col-span-1 px-1"
        onClick={onDuplicate}>
        <Copy className="h-3.5 w-3.5" />
      </Button>
      <button type="button" onClick={onDelete} disabled={deleteDisabled}
        title={deleteDisabled ? "No se puede eliminar: el campo está asociado a una tabla" : undefined}
        className="col-span-1 justify-self-end text-destructive hover:opacity-70 disabled:opacity-30 disabled:cursor-not-allowed">
        <Trash2 className="h-3.5 w-3.5" />
      </button>

    </div>
  );
}


type ColumnPatch = {
  is_primary_key?: boolean;
  is_nullable?: boolean;
  fk_target_node_id?: string | null;
  fk_target_column_id?: string | null;
};

function ColumnEditableRow({
  column, dirty, tables, allColumns, onChange, onDelete, onMoveUp, onMoveDown, canMoveUp, canMoveDown,
}: {
  column: ColumnRow;
  dirty: boolean;
  tables: { id: string; label: string }[];
  allColumns: ColumnRow[];
  onChange: (patch: ColumnPatch) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  const pk = column.is_primary_key;
  const nullable = column.is_nullable;
  const fkNode = column.fk_target_node_id ?? "";
  const fkCol = column.fk_target_column_id ?? "";

  const targetCols = allColumns.filter((c) => c.node_id === fkNode);
  const validTargetNode = !fkNode || tables.some((t) => t.id === fkNode);
  const validTargetCol = !fkCol || targetCols.some((c) => c.id === fkCol);
  const fkPairOk = (!fkNode && !fkCol) || (!!fkNode && !!fkCol);

  const existingPk = allColumns.find(
    (c) => c.node_id === column.node_id && c.is_primary_key && c.id !== column.id,
  );

  const setPk = (checked: boolean) => {
    if (checked && existingPk) {
      toast.error(`Ya existe una PK en esta tabla (${existingPk.entity_field_catalog?.name})`);
      return;
    }
    onChange({ is_primary_key: checked, ...(checked ? { is_nullable: false } : {}) });
  };

  const setNullable = (checked: boolean) => {
    if (checked && pk) {
      toast.error("Una clave primaria no puede ser nula");
      return;
    }
    onChange({ is_nullable: checked });
  };

  return (
    <div className={`grid grid-cols-12 items-center gap-2 rounded border p-2 text-xs ${dirty ? "border-primary/60 bg-primary/5" : ""}`}>
      <span className="col-span-3 truncate font-medium">
        {column.entity_field_catalog?.name}
        {dirty && <span className="ml-1 text-[10px] text-primary">●</span>}
      </span>
      <span className="col-span-1 text-muted-foreground">{column.entity_field_catalog?.data_type}</span>
      <label className="col-span-1"><input type="checkbox" checked={pk} onChange={(e) => setPk(e.target.checked)} /></label>
      <label className="col-span-1"><input type="checkbox" checked={nullable} disabled={pk} onChange={(e) => setNullable(e.target.checked)} /></label>
      <select className={`col-span-2 h-8 rounded border bg-background px-1 ${!validTargetNode ? "border-destructive" : ""}`}
        value={fkNode}
        onChange={(e) => onChange({ fk_target_node_id: e.target.value || null, fk_target_column_id: null })}>
        <option value="">— ninguna —</option>
        {tables.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        {!validTargetNode && <option value={fkNode}>(tabla inexistente)</option>}
      </select>
      <select className={`col-span-2 h-8 rounded border bg-background px-1 ${(!fkPairOk || !validTargetCol) ? "border-destructive" : ""}`}
        value={fkCol} disabled={!fkNode}
        onChange={(e) => onChange({ fk_target_column_id: e.target.value || null })}>
        <option value="">— campo —</option>
        {targetCols.map((c) => (
          <option key={c.id} value={c.id}>{c.entity_field_catalog?.name}</option>
        ))}
        {!validTargetCol && <option value={fkCol}>(campo inexistente)</option>}
      </select>
      <div className="col-span-2 flex items-center justify-end gap-1">
        <button type="button" disabled={!canMoveUp} onClick={onMoveUp}
          className="text-muted-foreground hover:text-foreground disabled:opacity-30" aria-label="Subir">
          <ArrowUp className="h-3.5 w-3.5" />
        </button>
        <button type="button" disabled={!canMoveDown} onClick={onMoveDown}
          className="text-muted-foreground hover:text-foreground disabled:opacity-30" aria-label="Bajar">
          <ArrowDown className="h-3.5 w-3.5" />
        </button>
        <button type="button" onClick={onDelete} className="text-destructive hover:opacity-70">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

