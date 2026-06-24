## Objetivo

En la página **Sugerencias IA de Procesos** (`/ai-suggest`):

1. Añadir, en cada línea de proceso de la propuesta, un botón **"Detallar IA"** que pida al modelo subprocesos y tareas para ese proceso concreto, y los muestre debajo de la línea (anidados, editables).
2. **Persistir** la propuesta completa (macroprocesos + procesos + detalles generados) en `localStorage`, asociada al tenant + entidad + entorno actuales, hasta que el usuario pulse **Regenerar** o **Aceptar e insertar**.
3. Asegurar que tanto la generación como la inserción usan siempre el **tenant, entidad y entorno seleccionados** en la columna izquierda (los que ya expone `useClient()` + `useSelectedEntity()`).

No se cambia el texto del botón "Aceptar e insertar" — su significado ya quedó claro en la conversación previa.

## Cambios técnicos

### 1. `src/lib/ai.functions.ts`
- Nueva server fn **`suggestProcessDetail`** (protegida con `requireSupabaseAuth`):
  - Input: `{ macroprocessName, macroprocessMission, processCode, processName, language }`.
  - Llama a `google/gemini-3-flash-preview` con un tool que devuelve `{ subprocesses: [{ code, name, mission, tasks: [{ code, name }] }] }` (3–6 subprocesos, 2–5 tareas cada uno).
  - Códigos hijos derivados del código del proceso (`P-01-02` → `P-01-02-01`, …`-01-01`, etc.).
  - Devuelve la propuesta sin tocar la BD.
- Extender `AiSuggestion` para que cada `process` admita un campo opcional `detail?: { subprocesses: [...] }`.
- Extender `acceptBpmStructure` para que, si un proceso trae `detail`, inserte también sus subprocesos y tareas (reutilizando el helper `uniquify` ya existente). La entidad destino sigue siendo la primera del tenant (comportamiento actual); no se modifica esa lógica en este paso.

### 2. `src/routes/_authenticated/ai-suggest.tsx`
- Botón **"Detallar IA"** (icono `Wand2` o `Sparkles`) a la derecha de cada línea de proceso, visible solo cuando `canEdit`. Estado de carga por proceso (`detailingKey = "${mi}:${pi}"`).
- Al pulsarlo:
  - Llama a `suggestProcessDetail` con el nombre/misión del macroproceso padre y el código/nombre del proceso, más `language`.
  - Guarda el resultado en `proposal.macroprocesses[mi].processes[pi].detail`.
  - Renderiza debajo de la línea un bloque anidado con los subprocesos (input editable de nombre + textarea de misión) y, dentro de cada subproceso, una lista de tareas (input editable). Estilo coherente con la lista actual de procesos (borde, fondo `muted/30`).
  - Botón pequeño "Regenerar detalle" y "Quitar detalle" por proceso.
- Mostrar un aviso pasivo arriba ("Esta sugerencia se asocia a {tenant} · {entidad o «sin entidad»} · {entorno}") usando `useClient()` y `useSelectedEntity()`. Si no hay entidad seleccionada, mantener el comportamiento actual (el backend usa la primera entidad).

### 3. Persistencia local
- Clave: `bpm.ai-suggest.proposal:{clientId}:{entityId ?? "none"}:{environment}`.
- Al montar: hidratar `proposal` y `businessType` desde `localStorage` si existen para esa combinación.
- Al cambiar `proposal` o `businessType`: guardar (debounced o directo en setters).
- Al **Regenerar** (`generate`) o **Aceptar e insertar** con éxito: limpiar la clave correspondiente.
- Al cambiar tenant/entidad/entorno en la columna izquierda: re-hidratar desde la nueva clave (efecto que escucha esos tres valores).

### 4. i18n (`src/lib/i18n.ts`)
Añadir, en `es` y `en` (siguiendo el patrón existente):
- `ai.detailProcess` → "Detallar IA" / "Detail with AI"
- `ai.detailing` → "Detallando…" / "Detailing…"
- `ai.removeDetail` → "Quitar detalle" / "Remove detail"
- `ai.regenerateDetail` → "Regenerar detalle" / "Regenerate detail"
- `ai.scopeHint` → "Esta sugerencia se asocia a {{tenant}} · {{entity}} · {{env}}" / equivalente

## Lo que **no** se toca

- El botón "Aceptar e insertar" mantiene su texto y comportamiento.
- La página `hierarchy.$level.$id.tsx` y su flujo "Generar detalle IA" no se modifican.
- No se introduce todavía un selector de entidad de destino dentro de `acceptBpmStructure`; sigue usando la primera entidad del tenant.

## Archivos afectados

- `src/lib/ai.functions.ts`
- `src/routes/_authenticated/ai-suggest.tsx`
- `src/lib/i18n.ts`
