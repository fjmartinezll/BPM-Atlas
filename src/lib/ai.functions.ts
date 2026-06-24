import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const inputSchema = z.object({
  businessType: z.string().trim().min(2).max(300),
  language: z.string().min(2).max(8).default("es"),
});

export type AiTask = { code: string; name: string; description?: string };

export type AiProcessDetail = {
  subprocesses: {
    code: string;
    name: string;
    mission: string;
    tasks: AiTask[];
  }[];
  tasks?: AiTask[]; // tasks attached directly to the process (same level as subprocesses)
};

export type AiSuggestion = {
  macroprocesses: {
    code: string;
    name: string;
    mission: string;
    processes: {
      code: string;
      name: string;
      mission: string;
      detail?: AiProcessDetail;
    }[];
  }[];
};

const tool = {
  type: "function" as const,
  function: {
    name: "propose_bpm_structure",
    description:
      "Propose a top-down BPM structure of macroprocesses and processes for a given business type.",
    parameters: {
      type: "object",
      properties: {
        macroprocesses: {
          type: "array",
          minItems: 3,
          maxItems: 6,
          items: {
            type: "object",
            properties: {
              code: { type: "string", description: "Short code, e.g. MP-01" },
              name: { type: "string" },
              mission: { type: "string", description: "One-sentence mission." },
              processes: {
                type: "array",
                minItems: 2,
                maxItems: 6,
                items: {
                  type: "object",
                  properties: {
                    code: { type: "string", description: "Short code, e.g. P-01-01" },
                    name: { type: "string" },
                    mission: { type: "string" },
                  },
                  required: ["code", "name", "mission"],
                  additionalProperties: false,
                },
              },
            },
            required: ["code", "name", "mission", "processes"],
            additionalProperties: false,
          },
        },
      },
      required: ["macroprocesses"],
      additionalProperties: false,
    },
  },
};

export const suggestBpmStructure = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => inputSchema.parse(d))
  .handler(async ({ data }): Promise<AiSuggestion> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    const isSpanish = data.language.toLowerCase().startsWith("es");
    const languageRule = isSpanish
      ? `RESPONDE ÍNTEGRAMENTE EN ESPAÑOL (castellano). PROHIBIDO usar palabras en inglés. Traduce TODO término técnico al castellano. Ejemplos obligatorios: "marketing"→"mercadotecnia", "compliance"→"cumplimiento normativo", "feedback"→"retroalimentación", "stakeholders"→"partes interesadas", "core"→"central", "management"→"gestión", "delivery"→"entrega", "onboarding"→"incorporación", "reporting"→"elaboración de informes", "performance"→"desempeño", "supply chain"→"cadena de suministro", "procurement"→"aprovisionamiento", "billing"→"facturación", "customer"→"cliente", "support"→"soporte", "training"→"formación", "fulfillment"→"cumplimiento de pedidos". Si dudas, usa la palabra en castellano.`
      : `Write all names and missions strictly in the requested language (ISO ${data.language}). Do not mix languages.`;
    const system = `You are a senior BPM consultant. Given a business type, produce a clean, standard BPM Top-Down structure of macroprocesses and their processes. Use codes like MP-01 and P-01-01. Respond ONLY by calling the tool. ${languageRule}`;
    const user = `Business type: ${data.businessType}\nLanguage: ${data.language}\nReturn 3-5 macroprocesses, each with 2-5 processes.\n${isSpanish ? "RECORDATORIO: nombres y misiones 100% en español, sin anglicismos." : ""}`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        tools: [tool],
        tool_choice: { type: "function", function: { name: "propose_bpm_structure" } },
      }),
    });

    if (res.status === 429) throw new Error("Lovable AI rate limit. Please try again shortly.");
    if (res.status === 402) throw new Error("Out of Lovable AI credits. Add credits in Settings → Workspace → Usage.");
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`AI gateway error ${res.status}: ${t.slice(0, 200)}`);
    }

    const payload = await res.json();
    const call = payload?.choices?.[0]?.message?.tool_calls?.[0];
    const args = call?.function?.arguments;
    if (!args) throw new Error("No tool call in AI response");
    const parsed = JSON.parse(args) as AiSuggestion;
    return parsed;
  });

const detailSchema = z.object({
  macroprocessName: z.string().min(1).max(200),
  macroprocessMission: z.string().max(2000).optional().default(""),
  processCode: z.string().min(1).max(40),
  processName: z.string().min(1).max(200),
  processMission: z.string().max(2000).optional().default(""),
  language: z.string().min(2).max(8).default("es"),
});

const detailTool = {
  type: "function" as const,
  function: {
    name: "propose_process_detail",
    description: "Propose subprocesses (with their tasks) for a given process.",
    parameters: {
      type: "object",
      properties: {
        subprocesses: {
          type: "array",
          minItems: 3,
          maxItems: 6,
          items: {
            type: "object",
            properties: {
              code: { type: "string", description: "Short code derived from parent, e.g. SP-01-01-01" },
              name: { type: "string" },
              mission: { type: "string" },
              tasks: {
                type: "array",
                minItems: 2,
                maxItems: 5,
                items: {
                  type: "object",
                  properties: {
                    code: { type: "string", description: "Short code, e.g. T-01-01-01-01" },
                    name: { type: "string", description: "Short imperative verb phrase." },
                  },
                  required: ["code", "name"],
                  additionalProperties: false,
                },
              },
            },
            required: ["code", "name", "mission", "tasks"],
            additionalProperties: false,
          },
        },
      },
      required: ["subprocesses"],
      additionalProperties: false,
    },
  },
};

export const suggestProcessDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => detailSchema.parse(d))
  .handler(async ({ data }): Promise<AiProcessDetail> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    const isSpanish = data.language.toLowerCase().startsWith("es");
    const languageRule = isSpanish
      ? "RESPONDE ÍNTEGRAMENTE EN ESPAÑOL. Sin anglicismos. Verbos en infinitivo para tareas."
      : `Write all names and missions in ISO ${data.language}.`;
    const system =
      `You are a senior BPM consultant. Decompose a single process into 3-6 subprocesses, each with 2-5 executable tasks. ` +
      `Derive child codes from the parent code (e.g. P-01-02 -> SP-01-02-01, SP-01-02-02; tasks -> T-01-02-01-01). ` +
      `Respond ONLY by calling the tool. ${languageRule}`;
    const user = [
      `Macroprocess: ${data.macroprocessName}`,
      data.macroprocessMission ? `Macroprocess mission: ${data.macroprocessMission}` : "",
      `Process code: ${data.processCode}`,
      `Process name: ${data.processName}`,
      data.processMission ? `Process mission: ${data.processMission}` : "",
      `Language: ${data.language}`,
    ].filter(Boolean).join("\n");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        tools: [detailTool],
        tool_choice: { type: "function", function: { name: "propose_process_detail" } },
      }),
    });
    if (res.status === 429) throw new Error("Lovable AI rate limit. Inténtalo en unos segundos.");
    if (res.status === 402) throw new Error("Sin créditos de Lovable AI.");
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`AI gateway error ${res.status}: ${t.slice(0, 200)}`);
    }
    const payload = await res.json();
    const args = payload?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) throw new Error("No tool call in AI response");
    return JSON.parse(args) as AiProcessDetail;
  });

// Detail a single subprocess: generate its tasks only.
const subDetailSchema = z.object({
  processName: z.string().min(1).max(200),
  subprocessCode: z.string().min(1).max(60),
  subprocessName: z.string().min(1).max(200),
  subprocessMission: z.string().max(2000).optional().default(""),
  language: z.string().min(2).max(8).default("es"),
});

const subDetailTool = {
  type: "function" as const,
  function: {
    name: "propose_subprocess_tasks",
    description: "Propose tasks for a given subprocess.",
    parameters: {
      type: "object",
      properties: {
        tasks: {
          type: "array",
          minItems: 2,
          maxItems: 6,
          items: {
            type: "object",
            properties: {
              code: { type: "string", description: "Short code derived from parent." },
              name: { type: "string", description: "Short imperative verb phrase." },
            },
            required: ["code", "name"],
            additionalProperties: false,
          },
        },
      },
      required: ["tasks"],
      additionalProperties: false,
    },
  },
};

export const suggestSubprocessTasks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => subDetailSchema.parse(d))
  .handler(async ({ data }): Promise<{ tasks: { code: string; name: string }[] }> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");
    const isSpanish = data.language.toLowerCase().startsWith("es");
    const languageRule = isSpanish
      ? "RESPONDE ÍNTEGRAMENTE EN ESPAÑOL. Verbos en infinitivo."
      : `Write tasks in ISO ${data.language}.`;
    const system = `You are a senior BPM consultant. List 2-6 executable tasks for the given subprocess. Derive codes from the parent subprocess code (e.g. SP-01-02-03 -> T-01-02-03-01). Respond ONLY by calling the tool. ${languageRule}`;
    const user = [
      `Process: ${data.processName}`,
      `Subprocess code: ${data.subprocessCode}`,
      `Subprocess name: ${data.subprocessName}`,
      data.subprocessMission ? `Subprocess mission: ${data.subprocessMission}` : "",
      `Language: ${data.language}`,
    ].filter(Boolean).join("\n");
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        tools: [subDetailTool],
        tool_choice: { type: "function", function: { name: "propose_subprocess_tasks" } },
      }),
    });
    if (res.status === 429) throw new Error("Lovable AI rate limit. Inténtalo en unos segundos.");
    if (res.status === 402) throw new Error("Sin créditos de Lovable AI.");
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`AI gateway error ${res.status}: ${t.slice(0, 200)}`);
    }
    const payload = await res.json();
    const args = payload?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) throw new Error("No tool call in AI response");
    return JSON.parse(args) as { tasks: { code: string; name: string }[] };
  });

// Detail a single task: generate a short procedural description.
const taskDetailSchema = z.object({
  parentName: z.string().min(1).max(200),
  parentKind: z.enum(["process", "subprocess"]).default("subprocess"),
  taskCode: z.string().min(1).max(60),
  taskName: z.string().min(1).max(200),
  language: z.string().min(2).max(8).default("es"),
});

const taskDetailTool = {
  type: "function" as const,
  function: {
    name: "describe_task",
    description: "Describe a task in 1-3 short sentences (what, who, how).",
    parameters: {
      type: "object",
      properties: {
        description: { type: "string", description: "Short procedural description, 1-3 sentences." },
      },
      required: ["description"],
      additionalProperties: false,
    },
  },
};

export const suggestTaskDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => taskDetailSchema.parse(d))
  .handler(async ({ data }): Promise<{ description: string }> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");
    const isSpanish = data.language.toLowerCase().startsWith("es");
    const languageRule = isSpanish
      ? "RESPONDE ÍNTEGRAMENTE EN ESPAÑOL, sin anglicismos."
      : `Write in ISO ${data.language}.`;
    const system = `You are a senior BPM consultant. Write a short procedural description for the given task (what is done, by whom, with which inputs/outputs if obvious). 1-3 short sentences. Respond ONLY by calling the tool. ${languageRule}`;
    const user = [
      `Parent ${data.parentKind}: ${data.parentName}`,
      `Task code: ${data.taskCode}`,
      `Task name: ${data.taskName}`,
      `Language: ${data.language}`,
    ].join("\n");
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        tools: [taskDetailTool],
        tool_choice: { type: "function", function: { name: "describe_task" } },
      }),
    });
    if (res.status === 429) throw new Error("Lovable AI rate limit. Inténtalo en unos segundos.");
    if (res.status === 402) throw new Error("Sin créditos de Lovable AI.");
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`AI gateway error ${res.status}: ${t.slice(0, 200)}`);
    }
    const payload = await res.json();
    const args = payload?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) throw new Error("No tool call in AI response");
    return JSON.parse(args) as { description: string };
  });

const taskSchema = z.object({
  code: z.string().min(1).max(60),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
});
const subprocessSchema = z.object({
  code: z.string().min(1).max(60),
  name: z.string().min(1).max(200),
  mission: z.string().max(2000).optional().default(""),
  tasks: z.array(taskSchema).max(50).optional().default([]),
});

const acceptSchema = z.object({
  entityId: z.string().uuid().optional(),
  suggestion: z.object({
    macroprocesses: z.array(
      z.object({
        code: z.string().min(1).max(40),
        name: z.string().min(1).max(200),
        mission: z.string().max(2000).optional().default(""),
        processes: z.array(
          z.object({
            code: z.string().min(1).max(40),
            name: z.string().min(1).max(200),
            mission: z.string().max(2000).optional().default(""),
            detail: z.object({
              subprocesses: z.array(subprocessSchema).max(50).optional().default([]),
              tasks: z.array(taskSchema).max(50).optional().default([]),
            }).optional(),
          }),
        ).max(20).optional().default([]),
      }),
    ).min(1).max(20),
  }),
});

export const acceptBpmStructure = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => acceptSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    const canEdit = (roles ?? []).some((r) => r.role === "administrador" || r.role === "dueno_proceso");
    if (!canEdit) throw new Error("Insufficient permissions to insert BPM data");

    // Target entity: explicit selection wins; fall back to first available.
    let entityId = data.entityId ?? null;
    if (!entityId) {
      const { data: ent, error: entErr } = await supabase
        .from("entities").select("id").order("created_at", { ascending: true }).limit(1).maybeSingle();
      if (entErr) throw new Error(entErr.message);
      if (!ent) throw new Error("No hay ninguna entidad creada. Crea una entidad antes de importar la estructura sugerida.");
      entityId = ent.id as string;
    }

    const created = { macroprocesses: 0, processes: 0, subprocesses: 0, tasks: 0 };

    // Wipe previously stored draft suggestions for this entity before re-inserting.
    // processes.parent_id has no FK cascade, so delete bottom-up explicitly.
    const { data: oldMps } = await supabase
      .from("macroprocesses")
      .select("id")
      .eq("entity_id", entityId)
      .eq("status", "borrador");
    const oldMpIds = (oldMps ?? []).map((r) => r.id as string);
    if (oldMpIds.length) {
      const { data: oldPs } = await supabase
        .from("processes").select("id").in("parent_id", oldMpIds);
      const oldPIds = (oldPs ?? []).map((r) => r.id as string);
      if (oldPIds.length) {
        const { data: oldSps } = await supabase
          .from("subprocesses").select("id").in("parent_id", oldPIds);
        const oldSpIds = (oldSps ?? []).map((r) => r.id as string);
        // Delete tasks attached to subprocesses AND tasks attached directly to processes.
        const allTaskParents = [...oldSpIds, ...oldPIds];
        if (allTaskParents.length) {
          await supabase.from("tasks").delete().in("parent_id", allTaskParents);
        }
        if (oldSpIds.length) {
          await supabase.from("subprocesses").delete().in("id", oldSpIds);
        }
        await supabase.from("processes").delete().in("id", oldPIds);
      }
      const { error: mpDelErr } = await supabase
        .from("macroprocesses").delete().in("id", oldMpIds);
      if (mpDelErr) throw new Error(mpDelErr.message);
    }


    const { data: existingMps } = await supabase.from("macroprocesses").select("code");
    const { data: existingPs } = await supabase.from("processes").select("code");
    const { data: existingSps } = await supabase.from("subprocesses").select("code");
    const { data: existingTs } = await supabase.from("tasks").select("code");
    const usedMp = new Set<string>((existingMps ?? []).map((r) => r.code as string));
    const usedP = new Set<string>((existingPs ?? []).map((r) => r.code as string));
    const usedSp = new Set<string>((existingSps ?? []).map((r) => r.code as string));
    const usedT = new Set<string>((existingTs ?? []).map((r) => r.code as string));
    const uniquify = (base: string, used: Set<string>) => {
      let code = base;
      let i = 2;
      while (used.has(code)) code = `${base}-${i++}`;
      used.add(code);
      return code;
    };

    for (const mp of data.suggestion.macroprocesses) {
      const mpCode = uniquify(mp.code, usedMp);
      const { data: mpRow, error: mpErr } = await supabase
        .from("macroprocesses")
        .insert({ code: mpCode, name: mp.name, mission: mp.mission, status: "borrador", entity_id: entityId, category: "misional" })
        .select("id")
        .single();
      if (mpErr) throw new Error(mpErr.message);
      created.macroprocesses++;
      for (const p of mp.processes) {
        const pCode = uniquify(p.code, usedP);
        const { data: pRow, error: pErr } = await supabase.from("processes").insert({
          code: pCode,
          name: p.name,
          mission: p.mission,
          status: "borrador",
          parent_id: mpRow!.id,
        }).select("id").single();
        if (pErr) throw new Error(pErr.message);
        created.processes++;
        if (p.detail?.subprocesses?.length) {
          for (const sp of p.detail.subprocesses) {
            const spCode = uniquify(sp.code, usedSp);
            const { data: spRow, error: spErr } = await supabase.from("subprocesses").insert({
              code: spCode,
              name: sp.name,
              mission: sp.mission,
              status: "borrador",
              parent_id: pRow!.id,
            }).select("id").single();
            if (spErr) throw new Error(spErr.message);
            created.subprocesses++;
            for (const tk of sp.tasks ?? []) {
              const tCode = uniquify(tk.code, usedT);
              const { error: tErr } = await supabase.from("tasks").insert({
                code: tCode,
                name: tk.name,
                mission: tk.description ?? null,
                status: "borrador",
                parent_id: spRow!.id,
              });
              if (tErr) throw new Error(tErr.message);
              created.tasks++;
            }
          }
        }
        // Tasks attached directly to the process (same level as subprocesses).
        if (p.detail?.tasks?.length) {
          for (const tk of p.detail.tasks) {
            const tCode = uniquify(tk.code, usedT);
            const { error: tErr } = await supabase.from("tasks").insert({
              code: tCode,
              name: tk.name,
              mission: tk.description ?? null,
              status: "borrador",
              parent_id: pRow!.id,
            });
            if (tErr) throw new Error(tErr.message);
            created.tasks++;
          }
        }
      }
    }

    return created;
  });

// ============================================================
// Generate BPMN diagram for a single process / subprocess / task
// ============================================================

const diagramInputSchema = z.object({
  level: z.enum(["processes", "subprocesses", "tasks"]),
  nodeId: z.string().uuid(),
  clientId: z.string().uuid(),
  environment: z.enum(["produccion", "pruebas"]),
  language: z.string().min(2).max(8).default("es"),
  overwrite: z.boolean().optional().default(false),
});

const diagramTool = {
  type: "function" as const,
  function: {
    name: "propose_bpm_flow",
    description:
      "Propose a BPMN flow for a single process. Use a decision gateway with branching ONLY when the mission clearly involves conditional logic (approval, validation, eligibility check, routing). Otherwise return a purely linear flow.",
    parameters: {
      type: "object",
      properties: {
        preTasks: {
          type: "array",
          minItems: 1,
          maxItems: 4,
          description: "Tasks before the decision (or all tasks if no decision).",
          items: {
            type: "object",
            properties: {
              label: { type: "string", description: "Short imperative verb phrase (e.g. 'Validar pedido')." },
            },
            required: ["label"],
            additionalProperties: false,
          },
        },
        decision: {
          type: "object",
          description: "Optional exclusive gateway with two conditional branches that re-merge.",
          properties: {
            question: { type: "string", description: "Short decision question (e.g. '¿Pedido aprobado?')." },
            yesLabel: { type: "string", description: "Label for the affirmative branch (e.g. 'Sí')." },
            noLabel: { type: "string", description: "Label for the negative branch (e.g. 'No')." },
            yesTasks: {
              type: "array", minItems: 1, maxItems: 3,
              items: { type: "object", properties: { label: { type: "string" } }, required: ["label"], additionalProperties: false },
            },
            noTasks: {
              type: "array", minItems: 1, maxItems: 3,
              items: { type: "object", properties: { label: { type: "string" } }, required: ["label"], additionalProperties: false },
            },
          },
          required: ["question", "yesLabel", "noLabel", "yesTasks", "noTasks"],
          additionalProperties: false,
        },
        postTasks: {
          type: "array",
          minItems: 0,
          maxItems: 3,
          description: "Tasks after the branches re-merge (only meaningful when decision is set).",
          items: {
            type: "object",
            properties: { label: { type: "string" } },
            required: ["label"],
            additionalProperties: false,
          },
        },
      },
      required: ["preTasks"],
      additionalProperties: false,
    },
  },
};

type DiagramNode = {
  id: string;
  type: "pool" | "bpmn";
  position: { x: number; y: number };
  style?: Record<string, number | string>;
  parentId?: string;
  extent?: "parent";
  dragHandle?: string;
  zIndex?: number;
  data: Record<string, unknown>;
};
type DiagramEdge = {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  data?: Record<string, unknown>;
  label?: string;
};

const LEVEL_TO_TABLE: Record<"processes" | "subprocesses" | "tasks", string> = {
  processes: "processes",
  subprocesses: "subprocesses",
  tasks: "tasks",
};

export const generateProcessDiagram = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => diagramInputSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    const canEdit = (roles ?? []).some((r) => r.role === "administrador" || r.role === "dueno_proceso");
    if (!canEdit) throw new Error("Insufficient permissions");

    const table = LEVEL_TO_TABLE[data.level];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: nodeRow, error: nodeErr } = await (supabase as any)
      .from(table)
      .select("id,code,name,mission,inputs,outputs,parent_id")
      .eq("id", data.nodeId)
      .maybeSingle();
    if (nodeErr) throw new Error(nodeErr.message);
    if (!nodeRow) throw new Error("Nodo no encontrado");

    const { data: existing, error: exErr } = await supabase
      .from("process_diagrams")
      .select("id,entity_id")
      .eq("level", data.level)
      .eq("node_id", data.nodeId)
      .maybeSingle();
    if (exErr) throw new Error(exErr.message);
    if (existing && !data.overwrite) throw new Error("DIAGRAM_EXISTS");

    let entityId: string | null = existing?.entity_id ?? null;
    if (!entityId && data.level === "processes" && nodeRow.parent_id) {
      const { data: mp } = await supabase
        .from("macroprocesses").select("entity_id").eq("id", nodeRow.parent_id).maybeSingle();
      entityId = (mp?.entity_id as string | null) ?? null;
    }

    const isSpanish = data.language.toLowerCase().startsWith("es");
    const languageRule = isSpanish
      ? "Responde íntegramente en español. Etiquetas cortas, verbos en infinitivo, sin anglicismos. Preguntas de decisión en forma interrogativa breve."
      : `Write all labels in language ${data.language}.`;
    const system =
      `You are a senior BPM consultant. Propose a realistic BPMN sequence for the given process. ` +
      `Use a decision gateway with two conditional branches (yes/no) ONLY when the mission clearly implies conditional logic ` +
      `(approval, validation, eligibility, routing, quality check). Otherwise return only preTasks. ` +
      `Use short imperative labels. Respond ONLY by calling the tool. ${languageRule}`;
    const user = [
      `Process name: ${nodeRow.name ?? ""}`,
      nodeRow.mission ? `Mission: ${nodeRow.mission}` : "",
      nodeRow.inputs ? `Inputs: ${nodeRow.inputs}` : "",
      nodeRow.outputs ? `Outputs: ${nodeRow.outputs}` : "",
      `Language: ${data.language}`,
    ].filter(Boolean).join("\n");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        tools: [diagramTool],
        tool_choice: { type: "function", function: { name: "propose_bpm_flow" } },
      }),
    });
    if (res.status === 429) throw new Error("Lovable AI rate limit. Inténtalo en unos segundos.");
    if (res.status === 402) throw new Error("Sin créditos de Lovable AI. Añade créditos en Settings → Workspace → Usage.");
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`AI gateway error ${res.status}: ${txt.slice(0, 200)}`);
    }
    const payload = await res.json();
    const args = payload?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) throw new Error("Respuesta IA sin tool_call");
    type ToolOut = {
      preTasks: { label: string }[];
      decision?: {
        question: string; yesLabel: string; noLabel: string;
        yesTasks: { label: string }[]; noTasks: { label: string }[];
      };
      postTasks?: { label: string }[];
    };
    const parsed = JSON.parse(args) as ToolOut;
    const cleanLabels = (arr?: { label: string }[]) =>
      (arr ?? []).map((t) => (t.label ?? "").trim()).filter(Boolean);
    const preLabels = cleanLabels(parsed.preTasks).slice(0, 4);
    if (preLabels.length < 1) throw new Error("La IA no propuso tareas");
    const decision = parsed.decision;
    const yesLabels = cleanLabels(decision?.yesTasks).slice(0, 3);
    const noLabels = cleanLabels(decision?.noTasks).slice(0, 3);
    const postLabels = cleanLabels(parsed.postTasks).slice(0, 3);
    const hasDecision = !!decision && yesLabels.length > 0 && noLabels.length > 0;

    // Layout
    const COL = 180;
    const MIDDLE_Y = 140;
    const TOP_Y = 20;
    const BOTTOM_Y = 250;
    const poolId = "pool-1";
    const laneId = "lane-1";
    const startId = "n-start";
    const endId = "n-end";

    const nodes: DiagramNode[] = [];
    const edges: DiagramEdge[] = [];
    let edgeSeq = 0;
    const addEdge = (src: string, tgt: string, extra: Partial<DiagramEdge> = {}) => {
      edges.push({ id: `e-${edgeSeq++}`, source: src, target: tgt, ...extra });
    };

    // Pre tasks
    const preIds = preLabels.map((_, i) => `n-pre${i + 1}`);
    preLabels.forEach((label, i) => {
      nodes.push({
        id: preIds[i], type: "bpmn", parentId: laneId, extent: "parent",
        position: { x: 160 + i * COL, y: MIDDLE_Y - 28 },
        style: { width: 150, height: 56 },
        data: { kind: "task", label, description: "", version: "1.0", nodeType: "" },
      });
    });

    let cursorX = 160 + preLabels.length * COL;
    let lastBeforeEnd: string[] = [preIds[preIds.length - 1]];

    if (hasDecision) {
      const gwId = "n-gw1";
      nodes.push({
        id: gwId, type: "bpmn", parentId: laneId, extent: "parent",
        position: { x: cursorX, y: MIDDLE_Y - 55 },
        style: { width: 110, height: 110 },
        data: {
          kind: "gateway",
          label: decision!.question,
          description: "",
          version: "1.0",
          nodeType: "exclusiva",
          rules: [],
          outputsTrue: [],
          outputsFalse: [],
        },
      });
      addEdge(preIds[preIds.length - 1], gwId);
      cursorX += COL;

      // Yes branch (top)
      const yesIds = yesLabels.map((_, i) => `n-yes${i + 1}`);
      yesLabels.forEach((label, i) => {
        nodes.push({
          id: yesIds[i], type: "bpmn", parentId: laneId, extent: "parent",
          position: { x: cursorX + i * COL, y: TOP_Y },
          style: { width: 150, height: 56 },
          data: { kind: "task", label, description: "", version: "1.0", nodeType: "" },
        });
      });
      addEdge(gwId, yesIds[0], { sourceHandle: "r-s", label: decision!.yesLabel || "Sí", data: { branch: "true", label: decision!.yesLabel || "Sí" } });
      for (let i = 0; i < yesIds.length - 1; i++) addEdge(yesIds[i], yesIds[i + 1]);

      // No branch (bottom)
      const noIds = noLabels.map((_, i) => `n-no${i + 1}`);
      noLabels.forEach((label, i) => {
        nodes.push({
          id: noIds[i], type: "bpmn", parentId: laneId, extent: "parent",
          position: { x: cursorX + i * COL, y: BOTTOM_Y },
          style: { width: 150, height: 56 },
          data: { kind: "task", label, description: "", version: "1.0", nodeType: "" },
        });
      });
      addEdge(gwId, noIds[0], { sourceHandle: "l-s", label: decision!.noLabel || "No", data: { branch: "false", label: decision!.noLabel || "No" } });
      for (let i = 0; i < noIds.length - 1; i++) addEdge(noIds[i], noIds[i + 1]);

      const branchLen = Math.max(yesIds.length, noIds.length);
      cursorX += branchLen * COL;
      lastBeforeEnd = [yesIds[yesIds.length - 1], noIds[noIds.length - 1]];
    }

    // Post tasks (merge point)
    const postIds = postLabels.map((_, i) => `n-post${i + 1}`);
    postLabels.forEach((label, i) => {
      nodes.push({
        id: postIds[i], type: "bpmn", parentId: laneId, extent: "parent",
        position: { x: cursorX + i * COL, y: MIDDLE_Y - 28 },
        style: { width: 150, height: 56 },
        data: { kind: "task", label, description: "", version: "1.0", nodeType: "" },
      });
    });
    if (postIds.length > 0) {
      for (const src of lastBeforeEnd) addEdge(src, postIds[0]);
      for (let i = 0; i < postIds.length - 1; i++) addEdge(postIds[i], postIds[i + 1]);
      lastBeforeEnd = [postIds[postIds.length - 1]];
      cursorX += postLabels.length * COL;
    }

    // Start + End
    nodes.unshift({
      id: startId, type: "bpmn", parentId: laneId, extent: "parent",
      position: { x: 30, y: MIDDLE_Y - 48 },
      style: { width: 96, height: 96 },
      data: { kind: "start", label: "Evento Inicio", description: "", version: "1.0", nodeType: "" },
    });
    edges.unshift({ id: `e-start`, source: startId, target: preIds[0] });

    nodes.push({
      id: endId, type: "bpmn", parentId: laneId, extent: "parent",
      position: { x: cursorX, y: MIDDLE_Y - 48 },
      style: { width: 96, height: 96 },
      data: { kind: "end", label: "Evento Fin", description: "", version: "1.0", nodeType: "" },
    });
    for (const src of lastBeforeEnd) addEdge(src, endId);

    // Pool + Lane sized to content
    const laneWidth = Math.max(720, cursorX + 140);
    const poolWidth = laneWidth + 20;
    const laneHeight = hasDecision ? 380 : 260;
    const poolHeight = laneHeight + 60;

    nodes.unshift(
      {
        id: poolId, type: "pool",
        position: { x: 80, y: 80 },
        style: { width: poolWidth, height: poolHeight },
        dragHandle: ".pool-drag-handle", zIndex: -2,
        data: { kind: "pool", label: nodeRow.name ?? "Proceso", paletteLabel: "Entidad", role: "", entity_id: null, description: "", version: "1.0", nodeType: "" },
      },
      {
        id: laneId, type: "pool", parentId: poolId, extent: "parent",
        position: { x: 10, y: 40 },
        style: { width: laneWidth, height: laneHeight },
        dragHandle: ".pool-drag-handle", zIndex: -1,
        data: { kind: "lane", label: "Equipo", role: "", position_id: null, description: "", version: "1.0", nodeType: "" },
      },
    );

    const diagramType = data.level === "subprocesses" ? "subprocesos" : "procesos";

    const basePayload = {
      name: `Diagrama IA · ${nodeRow.name ?? ""}`.slice(0, 200),
      nodes: nodes as unknown as never,
      edges: edges as unknown as never,
      diagram_type: diagramType,
      parent_table: null,
      parent_id: null,
      entity_id: entityId,
      level: data.level,
      node_id: data.nodeId,
      client_id: data.clientId,
      environment: data.environment,
    };

    const { data: saved, error: saveErr } = await supabase
      .from("process_diagrams")
      .upsert(basePayload, { onConflict: "level,node_id" })
      .select("id")
      .single();
    if (saveErr) throw new Error(saveErr.message);

    return {
      diagramId: saved.id,
      nodes: nodes.length,
      edges: edges.length,
      tasks: preLabels.length + yesLabels.length + noLabels.length + postLabels.length,
      hasDecision,
    };
  });


// ============================================================
// Generate detailed child nodes for a single MP / process / subprocess
// ============================================================

const childrenInputSchema = z.object({
  level: z.enum(["macroprocesses", "processes", "subprocesses"]),
  nodeId: z.string().uuid(),
  language: z.string().min(2).max(8).default("es"),
});

const acceptChildrenSchema = z.object({
  parentLevel: z.enum(["macroprocesses", "processes", "subprocesses"]),
  parentId: z.string().uuid(),
  proposal: z.object({
    children: z.array(z.object({
      code: z.string().min(1).max(40),
      name: z.string().min(1).max(200),
      mission: z.string().max(2000).optional().default(""),
      tasks: z.array(z.object({
        code: z.string().min(1).max(40),
        name: z.string().min(1).max(200),
        mission: z.string().max(2000).optional().default(""),
      })).optional().default([]),
    })).min(1).max(20),
  }),
});

export type NodeChildrenSuggestion = {
  children: {
    code: string;
    name: string;
    mission: string;
    tasks?: { code: string; name: string; mission: string }[];
  }[];
};

const CHILD_TABLE: Record<"macroprocesses" | "processes" | "subprocesses", "processes" | "subprocesses" | "tasks"> = {
  macroprocesses: "processes",
  processes: "subprocesses",
  subprocesses: "tasks",
};

const childrenTool = {
  type: "function" as const,
  function: {
    name: "propose_child_nodes",
    description:
      "Propose a list of direct child nodes for a given BPM node. For processes, you may also propose tasks under each subprocess.",
    parameters: {
      type: "object",
      properties: {
        children: {
          type: "array",
          minItems: 2,
          maxItems: 8,
          items: {
            type: "object",
            properties: {
              code: { type: "string", description: "Short code prefixed by the parent code (e.g. 'P-03-01')." },
              name: { type: "string" },
              mission: { type: "string", description: "One-sentence mission." },
              tasks: {
                type: "array",
                minItems: 0,
                maxItems: 6,
                description: "Only when the parent is a process: tasks for this subprocess.",
                items: {
                  type: "object",
                  properties: {
                    code: { type: "string" },
                    name: { type: "string" },
                    mission: { type: "string" },
                  },
                  required: ["code", "name", "mission"],
                  additionalProperties: false,
                },
              },
            },
            required: ["code", "name", "mission"],
            additionalProperties: false,
          },
        },
      },
      required: ["children"],
      additionalProperties: false,
    },
  },
};

export const suggestNodeChildren = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => childrenInputSchema.parse(d))
  .handler(async ({ data, context }): Promise<NodeChildrenSuggestion> => {
    const { supabase, userId } = context;
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    const canEdit = (roles ?? []).some((r) => r.role === "administrador" || r.role === "dueno_proceso");
    if (!canEdit) throw new Error("Sin permisos para generar detalle");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: parent, error: pErr } = await (supabase as any)
      .from(data.level)
      .select("id,code,name,mission,inputs,outputs")
      .eq("id", data.nodeId)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!parent) throw new Error("Nodo padre no encontrado");

    const childTable = CHILD_TABLE[data.level];
    const childLabelEs: Record<typeof childTable, string> = {
      processes: "procesos",
      subprocesses: "subprocesos",
      tasks: "tareas",
    };
    const isSpanish = data.language.toLowerCase().startsWith("es");
    const languageRule = isSpanish
      ? "Responde íntegramente en español, sin anglicismos. Nombres cortos, misiones en una frase."
      : `Write all names and missions in language ${data.language}.`;
    const tasksHint = data.level === "processes"
      ? (isSpanish
          ? "Para cada subproceso, incluye además entre 2 y 5 tareas operativas en el campo 'tasks'."
          : "For each subprocess, also include 2-5 operative tasks in the 'tasks' field.")
      : (isSpanish
          ? "No incluyas el campo 'tasks'."
          : "Do not include the 'tasks' field.");

    const system =
      `You are a senior BPM consultant. Propose the direct children (${childLabelEs[childTable]}) ` +
      `of the given parent node. Use codes prefixed by the parent code. Respond ONLY by calling the tool. ` +
      `${languageRule} ${tasksHint}`;
    const user = [
      `Parent level: ${data.level}`,
      `Parent code: ${parent.code}`,
      `Parent name: ${parent.name}`,
      parent.mission ? `Mission: ${parent.mission}` : "",
      parent.inputs ? `Inputs: ${parent.inputs}` : "",
      parent.outputs ? `Outputs: ${parent.outputs}` : "",
      `Children to propose: ${childLabelEs[childTable]} (3-6 ideally)`,
    ].filter(Boolean).join("\n");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        tools: [childrenTool],
        tool_choice: { type: "function", function: { name: "propose_child_nodes" } },
      }),
    });
    if (res.status === 429) throw new Error("Lovable AI rate limit. Inténtalo en unos segundos.");
    if (res.status === 402) throw new Error("Sin créditos de Lovable AI. Añade créditos en Settings → Workspace → Usage.");
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`AI gateway error ${res.status}: ${t.slice(0, 200)}`);
    }
    const payload = await res.json();
    const args = payload?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) throw new Error("Respuesta IA sin tool_call");
    const parsed = JSON.parse(args) as NodeChildrenSuggestion;
    // Normalize: drop tasks unless parent is a process.
    if (data.level !== "processes") {
      parsed.children = parsed.children.map((c) => ({ ...c, tasks: [] }));
    }
    return parsed;
  });

export const acceptNodeChildren = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => acceptChildrenSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    const canEdit = (roles ?? []).some((r) => r.role === "administrador" || r.role === "dueno_proceso");
    if (!canEdit) throw new Error("Sin permisos");

    const childTable = CHILD_TABLE[data.parentLevel];

    // Load existing codes for collision-free insertion.
    const [{ data: existChildren }, { data: existTasks }] = await Promise.all([
      supabase.from(childTable).select("code"),
      childTable === "subprocesses"
        ? supabase.from("tasks").select("code")
        : Promise.resolve({ data: [] as { code: string }[] }),
    ]);
    const usedChild = new Set<string>((existChildren ?? []).map((r) => r.code as string));
    const usedTask = new Set<string>((existTasks ?? []).map((r) => r.code as string));
    const uniquify = (base: string, used: Set<string>) => {
      let code = base;
      let i = 2;
      while (used.has(code)) code = `${base}-${i++}`;
      used.add(code);
      return code;
    };

    let createdChildren = 0;
    let createdTasks = 0;

    for (const child of data.proposal.children) {
      const code = uniquify(child.code, usedChild);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: row, error } = await (supabase as any)
        .from(childTable)
        .insert({
          code,
          name: child.name,
          mission: child.mission,
          status: "borrador",
          parent_id: data.parentId,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      createdChildren++;

      // If parent is a process, also insert tasks under the new subprocess.
      if (data.parentLevel === "processes" && child.tasks && child.tasks.length > 0) {
        for (const task of child.tasks) {
          const tcode = uniquify(task.code, usedTask);
          const { error: tErr } = await supabase.from("tasks").insert({
            code: tcode,
            name: task.name,
            mission: task.mission,
            status: "borrador",
            parent_id: row!.id,
          });
          if (tErr) throw new Error(tErr.message);
          createdTasks++;
        }
      }
    }

    return { children: createdChildren, tasks: createdTasks, childTable };
  });


// ============================================================
// Load existing draft (borrador) proposals for an entity
// ============================================================

const loadDraftSchema = z.object({
  entityId: z.string().uuid().optional(),
});

export const loadDraftProposals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => loadDraftSchema.parse(d))
  .handler(async ({ data, context }): Promise<AiSuggestion> => {
    const { supabase } = context;
    let entityId = data.entityId ?? null;
    if (!entityId) {
      const { data: ent } = await supabase
        .from("entities").select("id").order("created_at", { ascending: true }).limit(1).maybeSingle();
      entityId = (ent?.id as string | undefined) ?? null;
    }
    if (!entityId) return { macroprocesses: [] };

    const { data: mps } = await supabase
      .from("macroprocesses")
      .select("id,code,name,mission")
      .eq("entity_id", entityId)
      .eq("status", "borrador")
      .order("code", { ascending: true });
    const mpRows = mps ?? [];
    if (!mpRows.length) return { macroprocesses: [] };
    const mpIds = mpRows.map((m) => m.id as string);

    const { data: ps } = await supabase
      .from("processes")
      .select("id,code,name,mission,parent_id")
      .in("parent_id", mpIds)
      .eq("status", "borrador")
      .order("code", { ascending: true });
    const pRows = ps ?? [];
    const pIds = pRows.map((p) => p.id as string);

    const { data: sps } = pIds.length
      ? await supabase
          .from("subprocesses")
          .select("id,code,name,mission,parent_id")
          .in("parent_id", pIds)
          .eq("status", "borrador")
          .order("code", { ascending: true })
      : { data: [] as Array<{ id: string; code: string; name: string; mission: string | null; parent_id: string }> };
    const spRows = sps ?? [];
    const spIds = spRows.map((s) => s.id as string);

    // Tasks may be attached either to a subprocess OR directly to a process.
    const taskParentIds = [...spIds, ...pIds];
    const { data: ts } = taskParentIds.length
      ? await supabase
          .from("tasks")
          .select("id,code,name,mission,parent_id")
          .in("parent_id", taskParentIds)
          .eq("status", "borrador")
          .order("code", { ascending: true })
      : { data: [] as Array<{ id: string; code: string; name: string; mission: string | null; parent_id: string }> };
    const tRows = ts ?? [];

    return {
      macroprocesses: mpRows.map((mp) => ({
        code: mp.code as string,
        name: mp.name as string,
        mission: (mp.mission as string) ?? "",
        processes: pRows
          .filter((p) => p.parent_id === mp.id)
          .map((p) => {
            const subs = spRows.filter((s) => s.parent_id === p.id);
            const procTasks = tRows
              .filter((t) => t.parent_id === p.id)
              .map((t) => ({
                code: t.code as string,
                name: t.name as string,
                description: (t.mission as string) ?? undefined,
              }));
            const detail = subs.length || procTasks.length
              ? {
                  subprocesses: subs.map((s) => ({
                    code: s.code as string,
                    name: s.name as string,
                    mission: (s.mission as string) ?? "",
                    tasks: tRows
                      .filter((t) => t.parent_id === s.id)
                      .map((t) => ({
                        code: t.code as string,
                        name: t.name as string,
                        description: (t.mission as string) ?? undefined,
                      })),
                  })),
                  tasks: procTasks,
                }
              : undefined;
            return {
              code: p.code as string,
              name: p.name as string,
              mission: (p.mission as string) ?? "",
              detail,
            };
          }),
      })),
    };
  });
