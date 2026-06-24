import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertTenantAccess } from "@/lib/tenant-admin.guards";

import { FIELD_TYPE_VALUES, type FieldType } from "@/lib/field-types";
const DATA_TYPES = FIELD_TYPE_VALUES as unknown as [FieldType, ...FieldType[]];

// ---------- Field catalog ----------

export const listFieldCatalog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ clientId: z.string().uuid().nullable().optional(), environment: z.string().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    if (data.clientId) {
      await assertTenantAccess(context.supabase, context.userId, data.clientId);
    }
    let q = context.supabase
      .from("entity_field_catalog")
      .select("id, name, data_type, description, client_id, environment, sort_order, updated_at")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
    if (data.clientId) q = q.eq("client_id", data.clientId);
    if (data.environment) q = q.eq("environment", data.environment);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];

  });

export const upsertField = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid().optional(),
      clientId: z.string().uuid(),
      environment: z.string().default("pruebas"),
      name: z.string().min(1).max(120),
      data_type: z.enum(DATA_TYPES),
      description: z.string().max(500).nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertTenantAccess(context.supabase, context.userId, data.clientId);
    const payload = {
      client_id: data.clientId,
      environment: data.environment,
      name: data.name.trim(),
      data_type: data.data_type,
      description: data.description ?? null,
    };
    if (data.id) {
      const { error } = await context.supabase.from("entity_field_catalog").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: ins, error } = await context.supabase
      .from("entity_field_catalog")
      .upsert(payload, { onConflict: "client_id,environment,name" })
      .select("id").single();
    if (error) throw new Error(error.message);
    return { id: ins.id };
  });

export const deleteField = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { count, error: cErr } = await context.supabase
      .from("entity_table_columns")
      .select("id", { count: "exact", head: true })
      .eq("field_id", data.id);
    if (cErr) throw new Error(cErr.message);
    if ((count ?? 0) > 0) throw new Error("El campo está en uso en una o más tablas y no puede borrarse");
    const { error } = await context.supabase.from("entity_field_catalog").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Diagram columns ----------

export const listDiagramColumns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ diagramId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("entity_table_columns")
      .select("id, diagram_id, node_id, field_id, position, is_primary_key, is_nullable, fk_target_node_id, fk_target_column_id, entity_field_catalog(name, data_type)")
      .eq("diagram_id", data.diagramId)
      .order("position", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const upsertColumn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid().optional(),
      clientId: z.string().uuid(),
      environment: z.string().default("pruebas"),
      diagramId: z.string().uuid(),
      nodeId: z.string().min(1),
      fieldId: z.string().uuid(),
      position: z.number().int().min(0).optional(),
      isPrimaryKey: z.boolean().optional(),
      isNullable: z.boolean().optional(),
      fkTargetNodeId: z.string().nullable().optional(),
      fkTargetColumnId: z.string().uuid().nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertTenantAccess(context.supabase, context.userId, data.clientId);
    const { data: current, error: curErr } = data.id
      ? await context.supabase
          .from("entity_table_columns")
          .select("id, node_id, field_id, position, is_primary_key, is_nullable, fk_target_node_id, fk_target_column_id")
          .eq("id", data.id)
          .eq("diagram_id", data.diagramId)
          .maybeSingle()
      : { data: null, error: null };
    if (curErr) throw new Error(curErr.message);
    if (data.id && !current) throw new Error("La columna no existe o no pertenece al diagrama");

    // ---- Coherence rules ----
    // PK implies NOT NULL
    const isPrimaryKey = data.isPrimaryKey ?? current?.is_primary_key ?? false;
    const isNullable = isPrimaryKey ? false : (data.isNullable ?? current?.is_nullable ?? true);

    // FK: both ends required together
    const fkNode = data.fkTargetNodeId !== undefined ? data.fkTargetNodeId : (current?.fk_target_node_id ?? null);
    const fkCol = data.fkTargetColumnId !== undefined ? data.fkTargetColumnId : (current?.fk_target_column_id ?? null);
    if ((fkNode && !fkCol) || (!fkNode && fkCol)) {
      throw new Error("La clave foránea debe indicar tabla destino y columna destino");
    }
    if (fkNode && fkNode === data.nodeId) {
      throw new Error("Una clave foránea no puede apuntar a la misma tabla origen");
    }

    // Load existing columns of this diagram for validations
    const { data: existing, error: exErr } = await context.supabase
      .from("entity_table_columns")
      .select("id, node_id, is_primary_key, field_id")
      .eq("diagram_id", data.diagramId);
    if (exErr) throw new Error(exErr.message);
    const rows = existing ?? [];

    // Unique PK per table: demote any previous PK in this table
    if (isPrimaryKey) {
      const otherPkIds = rows
        .filter((r) => r.node_id === data.nodeId && r.is_primary_key && r.id !== data.id)
        .map((r) => r.id);
      if (otherPkIds.length) {
        const { error: demErr } = await context.supabase
          .from("entity_table_columns")
          .update({ is_primary_key: false })
          .in("id", otherPkIds);
        if (demErr) throw new Error(demErr.message);
      }
    }

    // FK target node must exist as a column-owning node in the same diagram
    if (fkNode) {
      const targetExists = rows.some((r) => r.node_id === fkNode);
      if (!targetExists) throw new Error("La tabla destino de la FK no existe o no tiene columnas definidas");
      const targetCol = rows.find((r) => r.id === fkCol);
      if (!targetCol) throw new Error("La columna destino de la FK no existe");
      if (targetCol.node_id !== fkNode) throw new Error("La columna destino no pertenece a la tabla destino");
    }

    const payload = {
      client_id: data.clientId,
      environment: data.environment,
      diagram_id: data.diagramId,
      node_id: data.nodeId,
      field_id: data.fieldId,
      position: data.position ?? current?.position ?? 0,
      is_primary_key: isPrimaryKey,
      is_nullable: isNullable,
      fk_target_node_id: fkNode,
      fk_target_column_id: fkCol,
    };
    if (data.id) {
      const { error } = await context.supabase.from("entity_table_columns").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: ins, error } = await context.supabase
      .from("entity_table_columns").insert(payload).select("id").single();
    if (error) throw new Error(error.message);
    return { id: ins.id };
  });


export const deleteColumn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("entity_table_columns").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const reorderColumns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      diagramId: z.string().uuid(),
      nodeId: z.string().min(1),
      orderedIds: z.array(z.string().uuid()),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    // orderedIds are in the desired order; assign position = index
    for (let i = 0; i < data.orderedIds.length; i++) {
      const { error } = await context.supabase
        .from("entity_table_columns")
        .update({ position: i })
        .eq("id", data.orderedIds[i])
        .eq("diagram_id", data.diagramId)
        .eq("node_id", data.nodeId);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const reorderFieldCatalog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      clientId: z.string().uuid(),
      environment: z.string().default("pruebas"),
      orderedIds: z.array(z.string().uuid()),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertTenantAccess(context.supabase, context.userId, data.clientId);
    for (let i = 0; i < data.orderedIds.length; i++) {
      const { error } = await context.supabase
        .from("entity_field_catalog")
        .update({ sort_order: i })
        .eq("id", data.orderedIds[i])
        .eq("client_id", data.clientId)
        .eq("environment", data.environment);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

// ---------- Diagram tables (registry) ----------

export const listDiagramTables = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ diagramId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("entity_diagram_tables")
      .select("id, label, diagram_id, client_id, environment, updated_at")
      .eq("diagram_id", data.diagramId)
      .order("label", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const createDiagramTable = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      diagramId: z.string().uuid(),
      clientId: z.string().uuid(),
      environment: z.string().default("pruebas"),
      label: z.string().min(1).max(120),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertTenantAccess(context.supabase, context.userId, data.clientId);
    const { data: ins, error } = await context.supabase
      .from("entity_diagram_tables")
      .insert({
        diagram_id: data.diagramId,
        client_id: data.clientId,
        environment: data.environment,
        label: data.label.trim(),
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: ins.id };
  });

export const renameDiagramTable = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), label: z.string().min(1).max(120) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("entity_diagram_tables")
      .update({ label: data.label.trim() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteDiagramTable = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // Block if any column in another table FK-references this table.
    const { data: fkRefs, error: fkErr } = await context.supabase
      .from("entity_table_columns")
      .select("id, node_id")
      .eq("fk_target_node_id", data.id)
      .limit(1);
    if (fkErr) throw new Error(fkErr.message);
    if ((fkRefs ?? []).length > 0) {
      throw new Error("No se puede eliminar: otra tabla tiene una FK que apunta a esta. Quita primero esas FKs.");
    }
    // Delete columns of this table first
    const { error: delColsErr } = await context.supabase
      .from("entity_table_columns")
      .delete()
      .eq("node_id", data.id);
    if (delColsErr) throw new Error(delColsErr.message);
    // Then delete the table registry row
    const { error } = await context.supabase
      .from("entity_diagram_tables")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

