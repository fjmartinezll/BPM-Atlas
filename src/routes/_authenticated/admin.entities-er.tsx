import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow, ReactFlowProvider, Background, Controls, MiniMap, Handle, Position,
  useNodesState, useEdgesState, useReactFlow,
  EdgeLabelRenderer, getSmoothStepPath,
  type Edge, type Node, type EdgeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useAuth } from "@/lib/auth-context";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSelectedEntity } from "@/lib/selected-entity";
import { EntityMaintenanceDialog } from "@/components/entity-maintenance-dialog";
import { ErEdgeMarkers } from "@/components/er-edge-markers";

export const Route = createFileRoute("/_authenticated/admin/entities-er")({
  head: () => ({ meta: [{ title: "Modelo de Tablas y Relaciones — BPM Atlas" }] }),
  component: EntitiesErPage,
});

type TableDef = {
  id: string;
  title: string;
  subtitle?: string;
  description: string;
  details?: string;
  color: string;
  fields: Array<{ name: string; type: string; pk?: boolean; fk?: string; fkField?: string; relDesc?: string }>;
  x: number;
  y: number;
  kind: "entity" | "link" | "model" | "type" | "execution";
};

const TABLES: TableDef[] = [
  {
    id: "entities",
    title: "entities",
    displayName: "Entidades",
    subtitle: "Entidades organizativas",
    description: "Tabla central. Cada fila representa una entidad (empresa, división, área, departamento) sobre la que se construye un modelo BPM independiente.",
    details: "Las entidades son el contenedor principal: todo modelo (macroproceso, proceso, subproceso, elemento ejecutable, diagrama) se asocia directa o indirectamente a una entidad. Al cambiar la entidad seleccionada en la cabecera, la aplicación filtra todos los modelos por su entity_id.",
    color: "#0ea5e9",
    kind: "entity",
    x: 0, y: 240,
    fields: [
      { name: "id", type: "uuid", pk: true },
      { name: "name", type: "text" },
      { name: "description", type: "text" },
      { name: "objectives", type: "text" },
      { name: "stakeholder_inputs", type: "text" },
      { name: "stakeholder_outputs", type: "text" },
      { name: "status", type: "enum" },
    ],
  },
  {
    id: "entity_process_links",
    title: "entity_process_links",
    displayName: "Vínculos Entidad-Proceso",
    subtitle: "Vínculo Entidad ↔ Proceso",
    description: "Tabla puente que vincula procesos con entidades y registra el dueño responsable de ese proceso dentro de la entidad.",
    details: "Permite que un mismo proceso participe en varias entidades con responsables distintos. Es la fuente de verdad para filtrar procesos por entidad cuando el proceso no nace asociado directamente vía macroproceso.",
    color: "#3b82f6",
    kind: "link",
    x: 420, y: 60,
    fields: [
      { name: "id", type: "uuid", pk: true },
      { name: "entity_id", type: "uuid", fk: "entities", fkField: "id", relDesc: "Entidad propietaria del vínculo." },
      { name: "process_id", type: "uuid", fk: "processes", fkField: "id", relDesc: "Proceso vinculado a la entidad." },
      { name: "owner_user_id", type: "uuid" },
      { name: "role", type: "text" },
    ],
  },
  {
    id: "macroprocesses",
    title: "macroprocesses",
    displayName: "Macroprocesos",
    subtitle: "Modelo: Macroproceso",
    description: "Nivel superior del mapa de procesos. Agrupa procesos relacionados que comparten un objetivo estratégico dentro de una entidad.",
    details: "Tipo de modelo: MACROPROCESO. Es el único modelo con FK directa a entities (entity_id). Los procesos cuelgan del macroproceso vía parent_id, heredando así la pertenencia a la entidad.",
    color: "#8b5cf6",
    kind: "model",
    x: 420, y: 240,
    fields: [
      { name: "id", type: "uuid", pk: true },
      { name: "entity_id", type: "uuid", fk: "entities", fkField: "id", relDesc: "Entidad a la que pertenece el macroproceso." },
      { name: "name", type: "text" },
      { name: "code", type: "text" },
      { name: "owner_id", type: "uuid" },
    ],
  },
  {
    id: "processes",
    title: "processes",
    displayName: "Procesos",
    subtitle: "Modelo: Proceso",
    description: "Procesos de negocio que materializan los objetivos del macroproceso. Hereda la entidad de su macroproceso padre.",
    details: "Tipo de modelo: PROCESO. Puede tener un process_type_id (catálogo de tipos de proceso: operativo, estratégico, soporte, etc.). Se asocia a entidades por dos vías: (1) a través del macroproceso padre y (2) directamente con entity_process_links.",
    color: "#a855f7",
    kind: "model",
    x: 840, y: 240,
    fields: [
      { name: "id", type: "uuid", pk: true },
      { name: "parent_id", type: "uuid", fk: "macroprocesses", fkField: "id", relDesc: "Macroproceso al que pertenece el proceso." },
      { name: "process_type_id", type: "uuid", fk: "process_type", relDesc: "Tipo del proceso (catálogo)." },
      { name: "name", type: "text" },
      { name: "owner_id", type: "uuid" },
    ],
  },
  {
    id: "subprocesses",
    title: "subprocesses",
    displayName: "Subprocesos",
    subtitle: "Modelo: Subproceso",
    description: "Descomposición de un proceso en pasos de negocio más pequeños y reutilizables.",
    details: "Tipo de modelo: SUBPROCESO. Hereda la entidad de su proceso padre. Está formado por elementos ejecutables enlazados mediante subprocess_elements.",
    color: "#ec4899",
    kind: "model",
    x: 1260, y: 60,
    fields: [
      { name: "id", type: "uuid", pk: true },
      { name: "parent_id", type: "uuid", fk: "processes", fkField: "id", relDesc: "Proceso padre del subproceso." },
      { name: "name", type: "text" },
      { name: "owner_id", type: "uuid" },
    ],
  },
  {
    id: "executable_elements",
    title: "executable_elements",
    displayName: "Elementos Ejecutables",
    subtitle: "Modelo: Elemento ejecutable",
    description: "Tareas, decisiones, eventos y demás nodos atómicos que componen un proceso ejecutable.",
    details: "Tipo de modelo: ELEMENTO EJECUTABLE. Tiene una columna 'kind' (taxonomía: tarea, decisión, evento, etc.) que define su comportamiento. Hereda la entidad del proceso padre.",
    color: "#f43f5e",
    kind: "model",
    x: 1260, y: 240,
    fields: [
      { name: "id", type: "uuid", pk: true },
      { name: "parent_id", type: "uuid", fk: "processes", fkField: "id", relDesc: "Proceso al que pertenece el elemento." },
      { name: "kind", type: "text", fk: "element_kind", relDesc: "Tipo de elemento (tarea, decisión, evento, …)." },
      { name: "name", type: "text" },
    ],
  },
  {
    id: "process_diagrams",
    title: "process_diagrams",
    displayName: "Diagramas de Proceso",
    subtitle: "Modelo: Diagrama de proceso",
    description: "Representación gráfica (BPMN, mapa, flujo) asociada a un proceso.",
    details: "Tipo de modelo: DIAGRAMA. La columna diagram_type indica la notación (BPMN, mapa de procesos, diagrama de flujo, etc.). Cada diagrama pertenece a un proceso y, por tanto, hereda su entidad.",
    color: "#f59e0b",
    kind: "model",
    x: 840, y: 60,
    fields: [
      { name: "id", type: "uuid", pk: true },
      { name: "process_id", type: "uuid", fk: "processes", fkField: "id", relDesc: "Proceso al que pertenece el diagrama." },
      { name: "diagram_type", type: "text", fk: "diagram_type", relDesc: "Notación del diagrama." },
      { name: "name", type: "text" },
    ],
  },
  {
    id: "subprocess_elements",
    title: "subprocess_elements",
    displayName: "Composición Subproceso-Elementos",
    subtitle: "Composición Subproceso ↔ Elementos",
    description: "Tabla puente que enlaza un subproceso con los elementos ejecutables que lo conforman.",
    details: "Permite reutilizar elementos ejecutables en varios subprocesos.",
    color: "#14b8a6",
    kind: "link",
    x: 1680, y: 240,
    fields: [
      { name: "id", type: "uuid", pk: true },
      { name: "subprocess_id", type: "uuid", fk: "subprocesses", fkField: "id" },
      { name: "executable_element_id", type: "uuid", fk: "executable_elements", fkField: "id" },
    ],
  },
  {
    id: "process_type",
    title: "process_type (catálogo)",
    displayName: "Tipos de Proceso",
    subtitle: "Tipos de proceso",
    description: "Catálogo de tipos posibles para los procesos (estratégico, operativo, soporte, gobierno, etc.).",
    details: "Define la clasificación funcional del proceso dentro del mapa de la entidad.",
    color: "#eab308",
    kind: "type",
    x: 840, y: 480,
    fields: [
      { name: "estratégico", type: "valor" },
      { name: "operativo", type: "valor" },
      { name: "soporte", type: "valor" },
      { name: "gobierno", type: "valor" },
    ],
  },
  {
    id: "element_kind",
    title: "element_kind (catálogo)",
    displayName: "Tipos de Elemento Ejecutable",
    subtitle: "Tipos de elemento ejecutable",
    description: "Catálogo de tipos de nodo atómico: tarea, decisión, evento, llamada a subproceso, etc.",
    details: "Determina cómo se ejecuta el nodo dentro del motor de procesos.",
    color: "#84cc16",
    kind: "type",
    x: 1260, y: 480,
    fields: [
      { name: "tarea", type: "valor" },
      { name: "decisión", type: "valor" },
      { name: "evento", type: "valor" },
      { name: "subproceso", type: "valor" },
    ],
  },
  {
    id: "diagram_type",
    title: "diagram_type (catálogo)",
    displayName: "Tipos de Diagrama",
    subtitle: "Tipos de diagrama",
    description: "Catálogo de notaciones gráficas: BPMN, mapa de procesos, diagrama de flujo, cadena de valor.",
    details: "Define cómo se renderiza visualmente el diagrama del proceso.",
    color: "#22c55e",
    kind: "type",
    x: 840, y: 600,
    fields: [
      { name: "BPMN", type: "valor" },
      { name: "mapa_procesos", type: "valor" },
      { name: "flujo", type: "valor" },
      { name: "cadena_valor", type: "valor" },
    ],
  },
  // ============================================================
  // Tablas que componen / ejecutan un PROCESO
  // ============================================================
  {
    id: "process_definitions",
    title: "process_definitions",
    displayName: "Definiciones Versionadas",
    subtitle: "Definición versionada del proceso",
    description: "Snapshot publicado y versionado de un proceso (nodos y aristas) que el motor puede instanciar.",
    details: "Cada versión de un proceso publicada para ejecución se guarda aquí con su grafo (nodes/edges). Las instancias en ejecución apuntan a una de estas definiciones.",
    color: "#06b6d4",
    kind: "execution",
    x: 1680, y: 60,
    fields: [
      { name: "id", type: "uuid", pk: true },
      { name: "process_id", type: "uuid", fk: "processes", fkField: "id", relDesc: "Proceso de origen de la definición." },
      { name: "diagram_id", type: "uuid", fk: "process_diagrams", fkField: "id", relDesc: "Diagrama BPMN del que se generó la definición." },
      { name: "version", type: "int" },
      { name: "status", type: "text" },
    ],
  },
  {
    id: "process_instances",
    title: "process_instances",
    displayName: "Instancias de Ejecución",
    subtitle: "Ejecuciones del proceso",
    description: "Instancias en ejecución de una definición concreta. Cada inicio del proceso crea una fila.",
    details: "Mantiene el estado (status, started_at, ended_at) y las variables del proceso en ejecución. Es el ancla de tokens, tareas y eventos.",
    color: "#0891b2",
    kind: "execution",
    x: 2100, y: 60,
    fields: [
      { name: "id", type: "uuid", pk: true },
      { name: "definition_id", type: "uuid", fk: "process_definitions", fkField: "id", relDesc: "Versión del proceso que se está ejecutando." },
      { name: "status", type: "text" },
      { name: "started_at", type: "timestamptz" },
      { name: "ended_at", type: "timestamptz" },
      { name: "variables", type: "jsonb" },
    ],
  },
  {
    id: "process_tokens",
    title: "process_tokens",
    displayName: "Tokens BPMN",
    subtitle: "Tokens del motor BPMN",
    description: "Token que representa la posición actual de ejecución dentro del grafo de una instancia.",
    details: "El motor BPMN mueve tokens por los nodos del diagrama; cada token tiene un nodo actual y un estado (esperando, activo, dormido…).",
    color: "#0e7490",
    kind: "execution",
    x: 2520, y: 60,
    fields: [
      { name: "id", type: "uuid", pk: true },
      { name: "instance_id", type: "uuid", fk: "process_instances", fkField: "id", relDesc: "Instancia a la que pertenece el token." },
      { name: "node_id", type: "text" },
      { name: "status", type: "text" },
      { name: "wake_at", type: "timestamptz" },
    ],
  },
  {
    id: "process_tasks",
    title: "process_tasks",
    displayName: "Tareas del Motor",
    subtitle: "Tareas generadas por el motor",
    description: "Tareas (humanas o automáticas) creadas durante la ejecución de una instancia.",
    details: "Cada nodo de tipo tarea/decisión/integración crea filas aquí: lleva asignado, estado, payload y resultado.",
    color: "#155e75",
    kind: "execution",
    x: 2520, y: 240,
    fields: [
      { name: "id", type: "uuid", pk: true },
      { name: "instance_id", type: "uuid", fk: "process_instances", fkField: "id", relDesc: "Instancia que generó la tarea." },
      { name: "token_id", type: "uuid", fk: "process_tokens", fkField: "id", relDesc: "Token que produjo la tarea." },
      { name: "node_id", type: "text" },
      { name: "task_kind", type: "text" },
      { name: "status", type: "text" },
      { name: "assignee_id", type: "uuid" },
    ],
  },
  {
    id: "process_events_log",
    title: "process_events_log",
    displayName: "Bitácora del Motor",
    subtitle: "Bitácora del motor",
    description: "Registro inmutable de eventos del motor: arranques, movimientos de token, errores, fin de instancia.",
    details: "Trazabilidad completa de la ejecución de cada instancia. Útil para auditoría y depuración.",
    color: "#164e63",
    kind: "execution",
    x: 2100, y: 240,
    fields: [
      { name: "id", type: "uuid", pk: true },
      { name: "instance_id", type: "uuid", fk: "process_instances", fkField: "id", relDesc: "Instancia sobre la que ocurre el evento." },
      { name: "token_id", type: "uuid", relDesc: "Token implicado (opcional)." },
      { name: "event_type", type: "text" },
      { name: "payload", type: "jsonb" },
    ],
  },
  {
    id: "executable_element_integrations",
    title: "executable_element_integrations",
    displayName: "Integraciones Externas",
    subtitle: "Integraciones del elemento ejecutable",
    description: "Vincula un elemento ejecutable (tarea automática) con su integración externa (n8n, webhook, app).",
    details: "Permite que el motor delegue la ejecución del nodo a un proveedor externo (provider) usando una referencia (external_ref / url).",
    color: "#22d3ee",
    kind: "execution",
    x: 1680, y: 420,
    fields: [
      { name: "id", type: "uuid", pk: true },
      { name: "executable_element_id", type: "uuid", fk: "executable_elements", fkField: "id", relDesc: "Elemento ejecutable al que aplica la integración." },
      { name: "provider", type: "enum" },
      { name: "external_ref", type: "text" },
      { name: "url", type: "text" },
    ],
  },
  {
    id: "process_indicators",
    title: "process_indicators",
    displayName: "Indicadores (KPIs)",
    subtitle: "Indicadores (KPIs)",
    description: "Indicadores de medición asociados de forma polimórfica a un nivel BPM (macroproceso/proceso/subproceso/elemento).",
    details: "target_level + target_id identifican el objetivo medido. No usa FK directa por ser polimórfico.",
    color: "#10b981",
    kind: "execution",
    x: 0, y: 600,
    fields: [
      { name: "id", type: "uuid", pk: true },
      { name: "target_level", type: "enum bpm_level" },
      { name: "target_id", type: "uuid", relDesc: "Apunta polimórficamente al modelo BPM medido." },
      { name: "name", type: "text" },
      { name: "formula", type: "text" },
      { name: "target_value", type: "numeric" },
    ],
  },
  {
    id: "process_risks",
    title: "process_risks",
    displayName: "Riesgos",
    subtitle: "Riesgos del proceso",
    description: "Riesgos asociados de forma polimórfica a un nivel BPM, con probabilidad, impacto y control.",
    details: "target_level + target_id apuntan al modelo afectado (proceso, subproceso, etc.).",
    color: "#ef4444",
    kind: "execution",
    x: 420, y: 600,
    fields: [
      { name: "id", type: "uuid", pk: true },
      { name: "target_level", type: "enum bpm_level" },
      { name: "target_id", type: "uuid", relDesc: "Modelo BPM al que afecta el riesgo." },
      { name: "description", type: "text" },
      { name: "probability", type: "int" },
      { name: "impact", type: "int" },
      { name: "control", type: "text" },
    ],
  },
  {
    id: "process_documents",
    title: "process_documents",
    displayName: "Documentos",
    subtitle: "Documentos adjuntos",
    description: "Documentos (en Storage) adjuntos polimórficamente a un nivel BPM.",
    details: "target_level + target_id identifican qué modelo del BPM tiene este documento adjunto.",
    color: "#f97316",
    kind: "execution",
    x: 840, y: 600,
    fields: [
      { name: "id", type: "uuid", pk: true },
      { name: "target_level", type: "enum bpm_level" },
      { name: "target_id", type: "uuid", relDesc: "Modelo BPM al que pertenece el documento." },
      { name: "name", type: "text" },
      { name: "storage_path", type: "text" },
      { name: "mime_type", type: "text" },
    ],
  },
  // ============================================================
  // Auth / usuarios
  // ============================================================
  {
    id: "profiles",
    title: "profiles",
    displayName: "Perfiles de Usuario",
    subtitle: "Perfiles de usuario",
    description: "Perfil público de cada usuario autenticado de la aplicación.",
    details: "Se crea automáticamente al registrarse el usuario (trigger handle_new_user). El id coincide con auth.users.id.",
    color: "#6366f1",
    kind: "entity",
    x: 2940, y: 60,
    fields: [
      { name: "id", type: "uuid", pk: true },
      { name: "email", type: "text" },
      { name: "full_name", type: "text" },
    ],
  },
  {
    id: "user_roles",
    title: "user_roles",
    displayName: "Roles de Usuario",
    subtitle: "Roles por usuario",
    description: "Asignación de roles de la aplicación (administrador, dueño de proceso, etc.) a cada usuario.",
    details: "Se consulta vía la función SECURITY DEFINER has_role(uid, role) para evitar recursión en las políticas RLS.",
    color: "#4f46e5",
    kind: "link",
    x: 2940, y: 240,
    fields: [
      { name: "id", type: "uuid", pk: true },
      { name: "user_id", type: "uuid", fk: "profiles", fkField: "id", relDesc: "Usuario al que se le asigna el rol." },
      { name: "role", type: "enum app_role" },
    ],
  },
  // ============================================================
  // Taxonomía de nodos del modelador
  // ============================================================
  {
    id: "node_categories",
    title: "node_categories",
    displayName: "Categorías de Nodo",
    subtitle: "Categorías de nodo",
    description: "Nivel superior de la taxonomía de nodos del modelador (actividad, evento, gateway, …).",
    color: "#65a30d",
    kind: "type",
    x: 0, y: 780,
    fields: [
      { name: "id", type: "uuid", pk: true },
      { name: "code", type: "text" },
      { name: "name", type: "text" },
      { name: "description", type: "text" },
    ],
  },
  {
    id: "node_kinds",
    title: "node_kinds",
    displayName: "Tipos Básicos de Nodo",
    subtitle: "Tipos básicos de nodo",
    description: "Tipos básicos dentro de cada categoría (tarea, decisión, evento inicio, …).",
    color: "#4d7c0f",
    kind: "type",
    x: 420, y: 780,
    fields: [
      { name: "id", type: "uuid", pk: true },
      { name: "category_id", type: "uuid", fk: "node_categories", fkField: "id", relDesc: "Categoría a la que pertenece." },
      { name: "code", type: "text" },
      { name: "name", type: "text" },
      { name: "is_container", type: "bool" },
      { name: "acts_as_action", type: "bool" },
    ],
  },
  {
    id: "node_types",
    title: "node_types",
    displayName: "Variantes de Nodo",
    subtitle: "Variantes específicas",
    description: "Variantes específicas dentro de un kind (p. ej. tarea de usuario, tarea de servicio, …).",
    color: "#15803d",
    kind: "type",
    x: 840, y: 780,
    fields: [
      { name: "id", type: "uuid", pk: true },
      { name: "kind_id", type: "uuid", fk: "node_kinds", fkField: "id", relDesc: "Kind del que es variante." },
      { name: "name", type: "text" },
      { name: "description", type: "text" },
    ],
  },
  {
    id: "node_subtypes",
    title: "node_subtypes",
    displayName: "Subtipos de Nodo",
    subtitle: "Subtipos opcionales",
    description: "Subdivisión opcional de un node_type para taxonomías muy específicas.",
    color: "#166534",
    kind: "type",
    x: 1260, y: 780,
    fields: [
      { name: "id", type: "uuid", pk: true },
      { name: "type_id", type: "uuid", fk: "node_types", fkField: "id", relDesc: "node_type al que pertenece." },
      { name: "name", type: "text" },
      { name: "description", type: "text" },
    ],
  },
  // ============================================================
  // Tareas BPM modeladas
  // ============================================================
  {
    id: "tasks",
    title: "tasks",
    displayName: "Tareas (Fichas SIPOC)",
    subtitle: "Tareas (ficha SIPOC)",
    description: "Ficha de tarea con misión, entradas, salidas, recursos, requisitos del cliente, proveedores y normativa.",
    details: "Las tareas pueden organizarse jerárquicamente con parent_id y se vinculan al diagrama del modelador a través de modeler_diagram_id + modeler_node_id.",
    color: "#db2777",
    kind: "model",
    x: 1680, y: 600,
    fields: [
      { name: "id", type: "uuid", pk: true },
      { name: "parent_id", type: "uuid", fk: "tasks", fkField: "id", relDesc: "Tarea madre (jerarquía)." },
      { name: "modeler_diagram_id", type: "uuid", fk: "process_diagrams", fkField: "id", relDesc: "Diagrama del modelador asociado." },
      { name: "modeler_node_id", type: "text" },
      { name: "name", type: "text" },
      { name: "mission", type: "text" },
      { name: "owner_id", type: "uuid" },
      { name: "status", type: "enum" },
    ],
  },
  // ============================================================
  // Auditoría y correo
  // ============================================================
  {
    id: "change_log",
    title: "change_log",
    displayName: "Bitácora de Cambios",
    subtitle: "Bitácora de cambios",
    description: "Registro inmutable de inserciones, actualizaciones y borrados sobre las tablas BPM.",
    details: "Se alimenta a través del trigger log_bpm_change(). entity_table guarda el nombre de la tabla, entity_id la fila afectada y diff el cambio en JSON.",
    color: "#525252",
    kind: "execution",
    x: 2100, y: 420,
    fields: [
      { name: "id", type: "uuid", pk: true },
      { name: "actor_id", type: "uuid" },
      { name: "entity_table", type: "text" },
      { name: "entity_id", type: "uuid" },
      { name: "action", type: "text" },
      { name: "diff", type: "jsonb" },
    ],
  },
  {
    id: "email_send_log",
    title: "email_send_log",
    displayName: "Envíos de Correo",
    subtitle: "Envíos de correo",
    description: "Histórico de envíos transaccionales y de autenticación realizados desde la plataforma.",
    color: "#737373",
    kind: "execution",
    x: 2520, y: 420,
    fields: [
      { name: "id", type: "uuid", pk: true },
      { name: "message_id", type: "text" },
      { name: "template_name", type: "text" },
      { name: "recipient_email", type: "text" },
      { name: "status", type: "text" },
      { name: "metadata", type: "jsonb" },
    ],
  },
  {
    id: "email_send_state",
    title: "email_send_state",
    displayName: "Estado de Envío",
    subtitle: "Estado del envío de correo",
    description: "Configuración global del worker de correo (ventanas de reintento, tamaño de lote, retardos, TTL).",
    color: "#a3a3a3",
    kind: "execution",
    x: 2940, y: 420,
    fields: [
      { name: "id", type: "int", pk: true },
      { name: "retry_after_until", type: "timestamptz" },
      { name: "batch_size", type: "int" },
      { name: "send_delay_ms", type: "int" },
      { name: "auth_email_ttl_minutes", type: "int" },
      { name: "transactional_email_ttl_minutes", type: "int" },
    ],
  },
  {
    id: "email_unsubscribe_tokens",
    title: "email_unsubscribe_tokens",
    displayName: "Tokens de Baja",
    subtitle: "Tokens de baja",
    description: "Tokens únicos que permiten a un destinatario darse de baja de los correos no transaccionales.",
    color: "#d4d4d4",
    kind: "execution",
    x: 2940, y: 600,
    fields: [
      { name: "id", type: "uuid", pk: true },
      { name: "token", type: "text" },
      { name: "email", type: "text" },
      { name: "used_at", type: "timestamptz" },
    ],
  },
  {
    id: "suppressed_emails",
    title: "suppressed_emails",
    displayName: "Lista de Supresión",
    subtitle: "Lista de supresión",
    description: "Correos que no deben recibir más envíos (bajas, rebotes duros, quejas de spam).",
    color: "#a1a1aa",
    kind: "execution",
    x: 2520, y: 600,
    fields: [
      { name: "id", type: "uuid", pk: true },
      { name: "email", type: "text" },
      { name: "reason", type: "text" },
      { name: "metadata", type: "jsonb" },
    ],
  },
];

type TableNodeData = TableDef & {
  recordCount?: number | null;
  countLoading?: boolean;
  entityFiltered?: boolean;
  entityName?: string | null;
};

function TableNode({ data, selected }: { data: TableNodeData; selected?: boolean }) {
  const countText = data.kind === "type"
    ? "catálogo (sin registros en BD)"
    : data.countLoading
      ? "registros: cargando…"
      : `registros${data.entityFiltered ? ` (entidad: ${data.entityName})` : " (total)"}: ${data.recordCount ?? "—"}`;
  const tooltip = `${data.displayName ?? data.title}\n\n${data.description}\n\n${countText}`;
  return (
    <div
      title={tooltip}
      className="rounded-lg border-2 bg-card shadow-md text-xs overflow-hidden relative cursor-pointer transition-shadow"
      style={{
        borderColor: data.color,
        minWidth: 260,
        boxShadow: selected ? `0 0 0 3px ${data.color}66, 0 6px 18px ${data.color}55` : undefined,
      }}
    >
      <Handle type="target" position={Position.Left} style={{ background: data.color, width: 8, height: 8 }} />
      <Handle type="source" position={Position.Right} style={{ background: data.color, width: 8, height: 8 }} />
      <Handle type="target" position={Position.Top} id="t" style={{ background: data.color, width: 8, height: 8 }} />
      <Handle type="source" position={Position.Bottom} id="b" style={{ background: data.color, width: 8, height: 8 }} />
      <div className="px-3 py-2 flex items-center justify-between gap-2" style={{ background: data.color, color: "white" }}>
        <div className="min-w-0">
          <div className="font-semibold truncate">{data.displayName ?? data.title}</div>
          <div className="text-[10px] opacity-90 flex items-center gap-1">
            <span className="font-mono truncate">{data.title}</span>
            {data.kind === "type" && (
              <span className="shrink-0 rounded bg-white/20 px-1 py-0.5 text-[9px] leading-none">catálogo</span>
            )}
          </div>
        </div>
        {data.kind !== "type" && (
          <span
            className="shrink-0 rounded-full bg-white/25 px-2 py-0.5 text-[10px] font-mono"
            title={countText}
          >
            {data.countLoading ? "…" : (data.recordCount ?? "—")}
          </span>
        )}
      </div>
      <ul className="divide-y">
        {data.fields.map((f) => (
          <li key={f.name} className="flex items-center justify-between px-3 py-1.5">
            <span className="font-mono">
              {f.pk && <span className="mr-1 text-amber-600 font-bold">🔑</span>}
              {f.fk && <span className="mr-1 text-blue-600">🔗</span>}
              {f.name}
            </span>
            <span className="text-muted-foreground font-mono text-[10px]">{f.type}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

type RelEdgeData = { tooltip: string; cardinality: string; relKind: string };

function angleFromPosition(pos: Position) {
  switch (pos) {
    case Position.Top: return -90;
    case Position.Right: return 0;
    case Position.Bottom: return 90;
    case Position.Left: return 180;
    default: return 0;
  }
}

function RelEdge(props: EdgeProps) {
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    targetX: props.targetX,
    targetY: props.targetY,
    sourcePosition: props.sourcePosition,
    targetPosition: props.targetPosition,
  });
  const d = (props.data ?? {}) as Partial<RelEdgeData>;
  const tooltip = d.tooltip ?? "";

  const edgeColor = (props.style?.stroke as string) || "#64748b";
  const srcAngle = angleFromPosition(props.sourcePosition);
  const tgtAngle = angleFromPosition(props.targetPosition);
  const off = 10;
  const srcOffX = Math.cos((srcAngle * Math.PI) / 180) * off;
  const srcOffY = Math.sin((srcAngle * Math.PI) / 180) * off;
  const tgtOffX = Math.cos((tgtAngle * Math.PI) / 180) * off;
  const tgtOffY = Math.sin((tgtAngle * Math.PI) / 180) * off;
  const barAngle = Math.abs(tgtAngle) % 180 === 0 ? 0 : 90;

  return (
    <>
      <path
        id={props.id}
        d={edgePath}
        fill="none"
        className="react-flow__edge-path er-flow-edge"
        style={{ ...props.style, strokeDasharray: "6 4" }}
      />

      {/* Crow's foot at the N / child side (source) */}
      <g transform={`translate(${props.sourceX + srcOffX}, ${props.sourceY + srcOffY}) rotate(${srcAngle})`}>
        <line x1={0} y1={0} x2={-16} y2={-8} stroke={edgeColor} strokeWidth={2.2} />
        <line x1={0} y1={0} x2={-16} y2={0} stroke={edgeColor} strokeWidth={2.2} />
        <line x1={0} y1={0} x2={-16} y2={8} stroke={edgeColor} strokeWidth={2.2} />
      </g>
      {/* Perpendicular bar at the 1 / parent side (target) */}
      <g transform={`translate(${props.targetX + tgtOffX}, ${props.targetY + tgtOffY}) rotate(${barAngle})`}>
        <line x1={0} y1={-8} x2={0} y2={8} stroke={edgeColor} strokeWidth={2.2} />
      </g>
      <EdgeLabelRenderer>
        <div
          title={tooltip}
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: "all",
          }}
          className="flex items-center gap-1 rounded border bg-card px-1.5 py-0.5 text-[10px] font-mono shadow-sm"
        >
          <span style={props.labelStyle as React.CSSProperties | undefined}>{String(props.label ?? "")}</span>
          {d.cardinality && (
            <span className="rounded bg-muted px-1 text-muted-foreground">{d.cardinality}</span>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

const nodeTypes = { table: TableNode };
const edgeTypes = { rel: RelEdge };

function AutoCenterFirst({ count, firstId }: { count: number; firstId: string | null }) {
  const rf = useReactFlow();
  const prevCount = useRef(0);
  useEffect(() => {
    if (prevCount.current === 0 && count === 1 && firstId) {
      const t = window.setTimeout(() => {
        const node = rf.getNode(firstId);
        if (node) {
          const w = (node.measured?.width ?? (node.width as number | undefined) ?? 260);
          const h = (node.measured?.height ?? (node.height as number | undefined) ?? 180);
          rf.setCenter(node.position.x + w / 2, node.position.y + h / 2, { zoom: 1.2, duration: 400 });
        }
      }, 80);
      return () => window.clearTimeout(t);
    }
    prevCount.current = count;
  }, [count, firstId, rf]);
  return null;
}

function EntitiesErPage() {
  const { isAdmin, loading } = useAuth();
  const { entity: selectedEntity } = useSelectedEntity();
  const selectedEntityId = selectedEntity?.id ?? null;
  const [selectedId, setSelectedId] = useState<string>("entities");
  const [included, setIncluded] = useState<Set<string>>(() => new Set(["entities", "entity_process_links", "macroprocesses", "processes", "subprocesses", "executable_elements", "process_diagrams", "subprocess_elements", "tasks", "process_indicators", "process_risks", "process_documents", "profiles", "user_roles", "process_type", "element_kind", "diagram_type", "node_categories", "node_kinds", "node_types", "node_subtypes"]));
  const [maintainId, setMaintainId] = useState<string | null>(null);

  // Undirected adjacency from FK edges (table -> set of related tables)
  const adjacency = useMemo(() => {
    const map = new Map<string, Set<string>>();
    const add = (a: string, b: string) => {
      if (a === b) return;
      if (!map.has(a)) map.set(a, new Set());
      map.get(a)!.add(b);
    };
    TABLES.forEach((t) => {
      t.fields.forEach((f) => {
        if (f.fk && TABLES.find((x) => x.id === f.fk)) {
          add(t.id, f.fk);
          add(f.fk, t.id);
        }
      });
    });
    return map;
  }, []);

  const expandRelated = (seed: Iterable<string>) => {
    const next = new Set<string>(seed);
    let changed = true;
    while (changed) {
      changed = false;
      for (const id of Array.from(next)) {
        const neigh = adjacency.get(id);
        if (!neigh) continue;
        neigh.forEach((n) => {
          if (!next.has(n)) {
            next.add(n);
            changed = true;
          }
        });
      }
    }
    return next;
  };

  const addRelatedTo = (id: string) =>
    setIncluded((prev) => {
      const seed = new Set(prev);
      seed.add(id);
      return expandRelated(seed);
    });

  const initial = useMemo(() => {
    const nodes: Node[] = TABLES.map((t) => ({
      id: t.id,
      type: "table",
      position: { x: t.x, y: t.y },
      data: t,
      draggable: true,
    }));

    const edges: Edge[] = [];
    TABLES.forEach((t) => {
      t.fields.forEach((f) => {
        if (f.fk && TABLES.find((x) => x.id === f.fk)) {
          const target = TABLES.find((x) => x.id === f.fk)!;
          const isLinkSource = t.kind === "link";
          const isTypeTarget = target.kind === "type";
          const cardinality = "1 — N";
          const relKind = isTypeTarget
            ? "Referencia a catálogo (clasificación)"
            : isLinkSource
              ? "Relación N–N (a través de tabla puente)"
              : "Clave foránea (pertenencia / jerarquía)";
          const tooltip =
            `${t.title}.${f.name} → ${target.title}${f.fkField ? "." + f.fkField : ""}\n\n` +
            `Cardinalidad: ${cardinality}. La pata de gallo marca el lado N (${t.title}, donde vive la FK) y la rayita marca el lado 1 (${target.title}, la tabla referenciada).\n` +
            `Tipo: ${relKind}.` +
            (f.relDesc ? `\n\n${f.relDesc}` : "");
          edges.push({
            id: `${t.id}-${f.name}->${f.fk}`,
            source: t.id,
            target: f.fk,
            label: f.name,
            type: "rel",
            animated: true,
            style: { stroke: target.color, strokeWidth: 2, color: target.color },
            labelStyle: { fontSize: 10, fill: target.color, fontWeight: 600 },
            data: { tooltip, cardinality, relKind },
          });
        }
      });
    });
    return { nodes, edges };
  }, []);

  const [nodes, , onNodesChange] = useNodesState(initial.nodes);
  const [edges, , onEdgesChange] = useEdgesState(initial.edges);

  const includedKey = useMemo(() => [...included].sort().join(","), [included]);
  const { data: counts, isLoading: countsLoading } = useQuery({
    queryKey: ["er-entities-counts", selectedEntityId, includedKey],
    queryFn: async () => {
      const result: Record<string, number> = {};
      const filterId = selectedEntityId;

      // Direct filters
      const direct = async (table: string, col: string, val: string | null) => {
        let q = supabase.from(table as any).select("*", { count: "exact", head: true });
        if (val) q = q.eq(col, val);
        const { count } = await q;
        return count ?? 0;
      };

      // entities
      result["entities"] = filterId
        ? await direct("entities", "id", filterId)
        : await direct("entities", "id", null);

      // macroprocesses
      result["macroprocesses"] = await direct("macroprocesses", "entity_id", filterId);

      // entity_process_links
      result["entity_process_links"] = await direct("entity_process_links", "entity_id", filterId);

      // processes — via macroprocesses + entity_process_links
      let processIds: string[] = [];
      if (filterId) {
        const [macros, links] = await Promise.all([
          supabase.from("macroprocesses").select("id").eq("entity_id", filterId),
          supabase.from("entity_process_links").select("process_id").eq("entity_id", filterId),
        ]);
        const macroIds = (macros.data ?? []).map((m: any) => m.id);
        const viaLinks = (links.data ?? []).map((l: any) => l.process_id).filter(Boolean);
        if (macroIds.length > 0) {
          const { data: ps } = await supabase.from("processes").select("id").in("parent_id", macroIds);
          processIds = (ps ?? []).map((p: any) => p.id);
        }
        processIds = Array.from(new Set([...processIds, ...viaLinks]));
        result["processes"] = processIds.length;
      } else {
        const { data: ps, count } = await supabase.from("processes").select("id", { count: "exact" });
        processIds = (ps ?? []).map((p: any) => p.id);
        result["processes"] = count ?? processIds.length;
      }

      // subprocesses, executable_elements, process_diagrams — via processIds
      if (processIds.length > 0) {
        const [subs, els, diags] = await Promise.all([
          supabase.from("subprocesses").select("id", { count: "exact", head: true }).in("parent_id", processIds),
          supabase.from("executable_elements").select("id", { count: "exact", head: true }).in("parent_id", processIds),
          supabase.from("process_diagrams").select("id", { count: "exact", head: true }).in("process_id", processIds),
        ]);
        result["subprocesses"] = subs.count ?? 0;
        result["executable_elements"] = els.count ?? 0;
        result["process_diagrams"] = diags.count ?? 0;
      } else {
        result["subprocesses"] = 0;
        result["executable_elements"] = 0;
        result["process_diagrams"] = 0;
      }

      // subprocess_elements — via subprocesses
      if (filterId) {
        const { data: subRows } = await supabase
          .from("subprocesses")
          .select("id")
          .in("parent_id", processIds.length > 0 ? processIds : ["00000000-0000-0000-0000-000000000000"]);
        const subIds = (subRows ?? []).map((s: any) => s.id);
        if (subIds.length > 0) {
          const { count } = await supabase
            .from("subprocess_elements")
            .select("id", { count: "exact", head: true })
            .in("subprocess_id", subIds);
          result["subprocess_elements"] = count ?? 0;
        } else {
          result["subprocess_elements"] = 0;
        }
      } else {
        const { count } = await supabase.from("subprocess_elements").select("id", { count: "exact", head: true });
        result["subprocess_elements"] = count ?? 0;
      }

      // Generic total counts for any other included real table (no entity filter)
      const handled = new Set(Object.keys(result));
      const others = TABLES.filter(
        (t) => t.kind !== "type" && included.has(t.id) && !handled.has(t.id),
      );
      await Promise.all(
        others.map(async (t) => {
          const { count } = await supabase
            .from(t.id as any)
            .select("*", { count: "exact", head: true });
          result[t.id] = count ?? 0;
        }),
      );

      return result;
    },
  });

  const visibleNodes = useMemo(
    () =>
      nodes
        .filter((n) => included.has(n.id))
        .map((n) => {
          const def = n.data as TableDef;
          const data: TableNodeData = {
            ...def,
            recordCount: counts?.[def.id] ?? null,
            countLoading: countsLoading,
            entityFiltered: !!selectedEntityId,
            entityName: selectedEntity?.name ?? null,
          };
          return { ...n, data, selected: n.id === selectedId };
        }),
    [nodes, included, selectedId, counts, countsLoading, selectedEntityId, selectedEntity],
  );
  const visibleEdges = useMemo(
    () => edges.filter((e) => included.has(e.source as string) && included.has(e.target as string)),
    [edges, included],
  );

  const selected = TABLES.find((t) => t.id === selectedId) ?? TABLES[0];

  const realTable = selected.kind !== "type";
  const { data: rows, isLoading: rowsLoading, error: rowsError } = useQuery({
    queryKey: ["er-entities-rows", selected.id],
    enabled: realTable && included.has(selected.id),
    queryFn: async () => {
      const { data, error } = await supabase.from(selected.id as any).select("*").limit(50);
      if (error) throw error;
      return ((data ?? []) as unknown) as Array<Record<string, unknown>>;
    },
  });

  if (loading) return <div className="p-6 text-muted-foreground">…</div>;
  if (!isAdmin) return <Navigate to="/dashboard" />;

  const kindLabel: Record<TableDef["kind"], string> = {
    entity: "Entidad raíz",
    link: "Tabla puente",
    model: "Modelo BPM",
    type: "Catálogo de tipos",
    execution: "Ejecución / composición del proceso",
  };

  const toggle = (id: string) =>
    setIncluded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const grouped: Array<{ kind: TableDef["kind"]; label: string }> = [
    { kind: "entity", label: "Entidades raíz" },
    { kind: "link", label: "Tablas puente" },
    { kind: "model", label: "Modelos BPM" },
    { kind: "execution", label: "Ejecución del proceso" },
    { kind: "type", label: "Catálogos de tipos" },
  ];

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      <div className="border-b bg-card px-6 py-4">
        <h1 className="font-display text-2xl font-semibold">Modelo de Tablas y Relaciones</h1>
        <p className="text-sm text-muted-foreground">
          Diagrama de las tablas y relaciones que dependen de las Entidades, los Modelos creados y sus tipos. Selecciona en el panel izquierdo qué entidades componen el diagrama, haz <strong>clic</strong> sobre una tabla para ver su descripción y <strong>doble clic</strong> para abrir el mantenimiento de sus datos (respetando las claves foráneas).
        </p>
      </div>
      <div className="flex-1 relative flex">
        <aside className="w-64 border-r bg-card overflow-y-auto p-4 space-y-4 shrink-0">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Entidades del diagrama
            </div>
            <div className="text-[10px] text-muted-foreground">{included.size}/{TABLES.length}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setIncluded(new Set(TABLES.map((t) => t.id)))}
              className="text-[11px] px-2 py-1 rounded border bg-muted/40 hover:bg-muted"
            >
              Todas
            </button>
            <button
              type="button"
              onClick={() => setIncluded(new Set())}
              className="text-[11px] px-2 py-1 rounded border bg-muted/40 hover:bg-muted"
            >
              Ninguna
            </button>
            <button
              type="button"
              onClick={() => setIncluded((prev) => expandRelated(prev))}
              disabled={included.size === 0}
              title="Añade a la selección todas las tablas relacionadas (por FK, de forma transitiva) con las actualmente seleccionadas."
              className="text-[11px] px-2 py-1 rounded border bg-muted/40 hover:bg-muted disabled:opacity-50"
            >
              + Relacionadas
            </button>
          </div>
          <div className="space-y-3">
            {grouped.map((g) => {
              const items = TABLES.filter((t) => t.kind === g.kind);
              if (items.length === 0) return null;
              return (
                <div key={g.kind}>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{g.label}</div>
                  <ul className="space-y-1">
                    {items.map((t) => {
                      const checked = included.has(t.id);
                      const hasRel = (adjacency.get(t.id)?.size ?? 0) > 0;
                      return (
                        <li key={t.id} className="flex items-center gap-1">
                          <label className="flex-1 flex items-start gap-2 text-xs cursor-pointer rounded px-1.5 py-1 hover:bg-muted/60 min-w-0">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggle(t.id)}
                              style={{ accentColor: t.color }}
                              className="mt-0.5"
                            />
                            <span
                              className="inline-block h-2 w-2 rounded-sm shrink-0 mt-1"
                              style={{ background: t.color }}
                            />
                            <span className="min-w-0 flex-1">
                              <span className="truncate block font-medium" title={t.title}>{t.displayName ?? t.title}</span>
                              <span className="block text-[10px] text-muted-foreground leading-snug font-mono" title={t.description}>
                                {t.title}{t.kind === "type" ? " (catálogo)" : ""}
                              </span>
                            </span>
                          </label>
                          {hasRel && (
                            <button
                              type="button"
                              onClick={() => addRelatedTo(t.id)}
                              title={`Añade ${t.displayName ?? t.title} y sus tablas relacionadas (transitivamente) a la selección.`}
                              className="shrink-0 text-[10px] px-1.5 py-0.5 rounded border bg-muted/40 hover:bg-muted text-muted-foreground"
                            >
                              +rel
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        </aside>
        <div className="flex-1 relative">
          <ReactFlowProvider>
            <ErEdgeMarkers />
            <AutoCenterFirst count={visibleNodes.length} firstId={visibleNodes[0]?.id ?? null} />
            <ReactFlow
              nodes={visibleNodes}
              edges={visibleEdges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              nodesDraggable
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              fitView
              fitViewOptions={{ padding: 0.2 }}
              minZoom={0.2}
              maxZoom={1.5}
              proOptions={{ hideAttribution: true }}
              onNodeClick={(_, n) => setSelectedId(n.id)}
              onNodeDoubleClick={(_, n) => {
                const t = TABLES.find((x) => x.id === n.id);
                if (t && t.kind !== "type") setMaintainId(n.id);
              }}
            >
              <Background gap={20} />
              <Controls />
              <MiniMap pannable zoomable />
            </ReactFlow>
          </ReactFlowProvider>
        </div>
        <aside className="w-96 border-l bg-card overflow-y-auto p-5 space-y-3">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
            {kindLabel[selected.kind]}
          </div>
          <div>
            <div className="font-display text-xl font-semibold" style={{ color: selected.color }}>
              {selected.displayName ?? selected.title}
            </div>
            <div className="text-sm text-muted-foreground font-mono">
              {selected.title}{selected.kind === "type" ? " (catálogo)" : ""}
            </div>
          </div>
          <p className="text-sm leading-relaxed">{selected.description}</p>
          {selected.details && (
            <div className="rounded-md border bg-muted/40 p-3 text-xs leading-relaxed">
              {selected.details}
            </div>
          )}
          <div>
            <div className="text-xs font-semibold mb-1 text-muted-foreground">Campos</div>
            <ul className="text-xs divide-y rounded-md border">
              {selected.fields.map((f) => (
                <li key={f.name} className="px-3 py-1.5 flex items-center justify-between">
                  <span className="font-mono">
                    {f.pk && <span className="mr-1 text-amber-600">🔑</span>}
                    {f.fk && <span className="mr-1 text-blue-600">🔗</span>}
                    {f.name}
                  </span>
                  <span className="text-muted-foreground font-mono text-[10px]">{f.type}</span>
                </li>
              ))}
            </ul>
          </div>
          {realTable && (
            <div>
              <div className="text-xs font-semibold mb-1 text-muted-foreground">
                Datos existentes {rows ? `(${rows.length})` : ""}
              </div>
              {rowsLoading && <div className="text-xs text-muted-foreground">Cargando…</div>}
              {rowsError && <div className="text-xs text-destructive">{(rowsError as Error).message}</div>}
              {rows && rows.length === 0 && (
                <div className="text-xs text-muted-foreground italic">Sin registros.</div>
              )}
              {rows && rows.length > 0 && (
                <ul className="space-y-2">
                  {rows.map((r, i) => {
                    const title = (r.name as string) ?? (r.code as string) ?? (r.title as string) ?? (r.id as string) ?? `#${i + 1}`;
                    return (
                      <li key={(r.id as string) ?? i} className="rounded-md border bg-muted/30 p-2 text-xs space-y-1">
                        <div className="font-semibold truncate" style={{ color: selected.color }}>{title}</div>
                        <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
                          {Object.entries(r)
                            .filter(([k]) => !["id", "created_at", "updated_at"].includes(k))
                            .slice(0, 8)
                            .map(([k, v]) => (
                              <div key={k} className="contents">
                                <dt className="font-mono text-[10px] text-muted-foreground">{k}</dt>
                                <dd className="font-mono text-[10px] truncate">
                                  {v === null || v === undefined || v === "" ? "—" : String(v).slice(0, 80)}
                                </dd>
                              </div>
                            ))}
                        </dl>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
          <div className="text-[11px] text-muted-foreground pt-2 border-t">
            Haz clic en cualquier otra tabla del diagrama para ver su información.
          </div>
        </aside>
      </div>
      {maintainId && (
        <EntityMaintenanceDialog
          open={!!maintainId}
          onOpenChange={(b) => { if (!b) setMaintainId(null); }}
          table={TABLES.find((t) => t.id === maintainId)!}
          allTables={TABLES}
        />
      )}
    </div>
  );
}
