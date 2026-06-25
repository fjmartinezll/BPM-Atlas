import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { STALE } from "@/lib/query-keys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "react-i18next";
import { getVarTypeLabel } from "@/lib/field-types";
import { migrateGatewayRule, type GatewayRule, type RuleOperand, type ProcessVariable, type VarType, type InputMeta, type VarsScope } from "@/lib/bpm";

const GATEWAY_OPS = ["=", "≠", "<", "≤", ">", "≥", "contiene", "vacío"] as const;
const ENTITY_ATTRS = ["name", "description", "mission", "vision", "strategy", "status", "stakeholder_inputs", "stakeholder_outputs"] as const;
const ENTITY_ATTR_LABEL: Record<string, string> = {
  name: "Nombre",
  description: "Descripción",
  mission: "Misión",
  vision: "Visión",
  strategy: "Estrategia",
  status: "Estado",
  stakeholder_inputs: "Entradas (stakeholders)",
  stakeholder_outputs: "Salidas (stakeholders)",
};

const scopeReady = (s: VarsScope | null) => !!(s && s.clientId);
const scopeKey = (s: VarsScope | null) => s ? [s.clientId, s.environment, s.entityId] : [null, null, null];

function useProcessVariables(scope: VarsScope | null) {
  return useQuery({
    queryKey: ["process-variables", ...scopeKey(scope)],
    staleTime: STALE.REFERENCE,
    enabled: scopeReady(scope),
    queryFn: async () => {
      let q = supabase
        .from("process_variables").select("id, name, label, var_type, entity_id")
        .eq("client_id", scope!.clientId!)
        .eq("environment", scope!.environment);
      q = scope!.entityId ? q.eq("entity_id", scope!.entityId) : q.is("entity_id", null);
      const { data, error } = await q.order("name");
      if (error) throw error;
      return (data ?? []) as unknown as ProcessVariable[];
    },
  });
}

function OperandPicker({
  value, onChange, vars,
}: {
  value: RuleOperand | undefined;
  onChange: (v: RuleOperand) => void;
  vars: ProcessVariable[];
}) {
  const { t } = useTranslation();
  const v = value ?? { kind: "literal" as const, value: "" };
  const kind = v.kind;
  const selectedVar = kind !== "literal" ? vars.find((x) => x.name === (v as any).name) : null;
  return (
    <div className="flex flex-1 items-center gap-1">
      <select
        className="h-7 rounded border bg-background px-1 text-sm"
        value={kind}
        onChange={(e) => {
          const k = e.target.value as RuleOperand["kind"];
          if (k === "literal") onChange({ kind: "literal", value: "" });
          else if (k === "var") onChange({ kind: "var", name: vars[0]?.name ?? "" });
          else onChange({ kind: "attr", name: vars.find((x) => x.var_type === "entity")?.name ?? "", path: ENTITY_ATTRS[0] });
        }}
      >
        <option value="literal">{t("gatewayRules.operandLiteral")}</option>
        <option value="var" disabled={vars.length === 0}>{t("gatewayRules.operandVar")}</option>
        <option value="attr" disabled={!vars.some((x) => x.var_type === "entity")}>{t("gatewayRules.operandAttr")}</option>
      </select>
      {kind === "literal" && (
        <Input className="h-7 flex-1 text-sm" value={String((v as any).value ?? "")}
          onChange={(e) => onChange({ kind: "literal", value: e.target.value })} maxLength={120} />
      )}
      {kind === "var" && (
        <select className="h-7 flex-1 rounded border bg-background px-1 text-sm"
          value={(v as any).name ?? ""} onChange={(e) => onChange({ kind: "var", name: e.target.value })}>
          {vars.map((x) => <option key={x.name} value={x.name}>{x.label || x.name}</option>)}
        </select>
      )}
      {kind === "attr" && (
        <>
          <select className="h-7 flex-1 rounded border bg-background px-1 text-sm"
            value={(v as any).name ?? ""} onChange={(e) => onChange({ kind: "attr", name: e.target.value, path: (v as any).path ?? ENTITY_ATTRS[0] })}>
            {vars.filter((x) => x.var_type === "entity").map((x) => <option key={x.name} value={x.name}>{x.label || x.name}</option>)}
          </select>
          <select className="h-7 w-24 rounded border bg-background px-1 text-sm"
            value={(v as any).path ?? ENTITY_ATTRS[0]} onChange={(e) => onChange({ kind: "attr", name: (v as any).name, path: e.target.value })}>
            {ENTITY_ATTRS.map((a) => <option key={a} value={a}>{ENTITY_ATTR_LABEL[a]}</option>)}
          </select>
          {selectedVar && <span className="text-xs text-muted-foreground">{selectedVar.label}</span>}
        </>
      )}
    </div>
  );
}

export function GatewayRulesEditor({
  rules, setRules, scope,
}: {
  rules: GatewayRule[];
  setRules: (next: GatewayRule[]) => void;
  scope: VarsScope | null;
}) {
  const { t } = useTranslation();
  const varsQ = useProcessVariables(scope);
  const vars = varsQ.data ?? [];
  const migrated = rules.map(migrateGatewayRule);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {t("gatewayRules.decisionRules")}
        </label>
        <Button size="sm" variant="outline" className="h-7 px-2 text-sm"
          disabled={migrated.length >= 2}
          onClick={() => {
            if (migrated.length >= 2) return;
            setRules([...migrated, { left: { kind: "literal" as const, value: "" }, op: "=", right: { kind: "literal" as const, value: "" } }]);
          }}>
          <Plus className="h-3 w-3 mr-1" /> {t("gatewayRules.addRule")}
        </Button>
      </div>
      {migrated.length === 0 && (
        <p className="text-xs italic text-muted-foreground">
          {t("gatewayRules.ruleHint")}
        </p>
      )}
      {migrated.map((r, idx) => (
        <div key={idx} className="space-y-1 rounded border bg-background/60 p-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase text-muted-foreground">
              {idx === 0 ? t("gatewayRules.ifLabel") : (
                <select value={r.connector ?? "Y"}
                  onChange={(e) => setRules(migrated.map((x, i) => i === idx ? { ...x, connector: e.target.value as "Y" | "O" } : x))}
                  className="h-5 rounded border bg-muted px-1 text-xs font-semibold uppercase">
                  <option value="Y">Y</option>
                  <option value="O">O</option>
                </select>
              )} {t("gatewayRules.ruleLabel")} {idx + 1}
            </span>
            <button type="button" onClick={() => setRules(migrated.filter((_, i) => i !== idx))}
              className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-destructive" title={t("gatewayRules.deleteRuleTitle")}>
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
          <div className="space-y-1">
            <OperandPicker vars={vars} value={r.left} onChange={(v) => setRules(migrated.map((x, i) => i === idx ? { ...x, left: v } : x))} />
            <div className="flex items-center gap-1">
              <select value={r.op ?? "="}
                onChange={(e) => setRules(migrated.map((x, i) => i === idx ? { ...x, op: e.target.value } : x))}
                className="h-7 rounded border bg-background px-1 text-sm">
                {GATEWAY_OPS.map((op) => <option key={op} value={op}>{op}</option>)}
              </select>
              {r.op !== "vacío" && (
                <OperandPicker vars={vars} value={r.right} onChange={(v) => setRules(migrated.map((x, i) => i === idx ? { ...x, right: v } : x))} />
              )}
            </div>
          </div>
        </div>
      ))}
      {!scopeReady(scope) && (
        <p className="text-xs text-amber-600">{t("gatewayRules.selectClientVars")}</p>
      )}
    </div>
  );
}

export function TaskIOEditor({
  inputs, outputs, setInputs, setOutputs, scope, hideOutputs, hideInputs, title, outputsTitle, outputsSubtitle, outputsColorClass,
  inputMeta, setInputMeta,
}: {
  inputs: string[];
  outputs: string[];
  setInputs: (v: string[]) => void;
  setOutputs: (v: string[]) => void;
  scope: VarsScope | null;
  hideOutputs?: boolean;
  hideInputs?: boolean;
  title?: string;
  outputsTitle?: string;
  outputsSubtitle?: string;
  outputsColorClass?: string;
  /** Per-input meta (required, defaultValue). When provided, an editor is shown below the chips. */
  inputMeta?: Record<string, InputMeta>;
  setInputMeta?: (m: Record<string, InputMeta>) => void;
}) {
  const { t } = useTranslation();
  const varsQ = useProcessVariables(scope);
  const vars = varsQ.data ?? [];
  return (
    <div className="rounded-md border bg-muted/30 p-2 space-y-3">
      <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {title ?? t("gatewayRules.taskVars")}
      </label>
      {!hideInputs && (
        <>
          <VarColumn
            title={t("gatewayRules.inputs")} subtitle={t("gatewayRules.inputsSub")}
            colorClass="border-sky-300 bg-sky-50 text-sky-800 dark:bg-sky-950/40 dark:text-sky-200"
            selected={inputs} setSelected={(next) => {
              setInputs(next);
              if (setInputMeta && inputMeta) {
                const cleaned: Record<string, InputMeta> = {};
                for (const n of next) if (inputMeta[n]) cleaned[n] = inputMeta[n];
                setInputMeta(cleaned);
              }
            }} vars={vars} scope={scope}
          />
          {setInputMeta && inputs.length > 0 && (
            <InputMetaEditor
              inputs={inputs}
              vars={vars}
              meta={inputMeta ?? {}}
              setMeta={setInputMeta}
            />
          )}
        </>
      )}
      {!hideOutputs && (
        <VarColumn
          title={outputsTitle ?? t("gatewayRules.outputs")} subtitle={outputsSubtitle ?? t("gatewayRules.outputsSub")}
          colorClass={outputsColorClass ?? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"}
          selected={outputs} setSelected={setOutputs} vars={vars} scope={scope}
        />
      )}
      {!scopeReady(scope) && (
        <p className="text-xs text-amber-600">{t("gatewayRules.selectClientCreate")}</p>
      )}
    </div>
  );
}

function InputMetaEditor({
  inputs, vars, meta, setMeta,
}: {
  inputs: string[];
  vars: ProcessVariable[];
  meta: Record<string, InputMeta>;
  setMeta: (m: Record<string, InputMeta>) => void;
}) {
  const { t } = useTranslation();
  const byName = new Map(vars.map((v) => [v.name, v] as const));
  const update = (name: string, patch: Partial<InputMeta>) => {
    const next = { ...meta, [name]: { ...(meta[name] ?? {}), ...patch } };
    // drop entry if both fields are empty/false
    const e = next[name];
    if (!e.required && (e.defaultValue === undefined || e.defaultValue === null || e.defaultValue === "")) {
      delete next[name];
    }
    setMeta(next);
  };
  return (
    <div className="rounded border border-dashed bg-background/50 p-1.5 space-y-1">
      <div className="grid grid-cols-12 gap-1 px-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        <span className="col-span-4">{t("gatewayRules.colInput")}</span>
        <span className="col-span-2 text-center">{t("gatewayRules.colRequired")}</span>
        <span className="col-span-6">{t("gatewayRules.colDefault")}</span>
      </div>
      {inputs.map((name) => {
        const v = byName.get(name);
        const m = meta[name] ?? {};
        const dv = m.defaultValue;
        const dvStr = dv === undefined || dv === null ? "" : String(dv);
        const type = v?.var_type ?? "text";
        return (
          <div key={name} className="grid grid-cols-12 items-center gap-1 rounded px-1 py-0.5 text-xs">
            <span className="col-span-4 truncate font-medium" title={name}>
              {v?.label || name} <span className="text-muted-foreground">:{t("var_type." + type, getVarTypeLabel(type))}</span>
            </span>
            <span className="col-span-2 flex justify-center">
              <input type="checkbox" checked={!!m.required}
                onChange={(e) => update(name, { required: e.target.checked })} />
            </span>
            {type === "boolean" ? (
              <select className="col-span-6 h-7 rounded border bg-background px-1"
                value={dv === true ? "true" : dv === false ? "false" : ""}
                onChange={(e) => update(name, { defaultValue: e.target.value === "" ? null : e.target.value === "true" })}>
                <option value="">—</option>
                <option value="true">true</option>
                <option value="false">false</option>
              </select>
            ) : (
              <Input className="col-span-6 h-7"
                type={type === "integer" || type === "numeric" ? "number" : type === "date" ? "date" : "text"}
                placeholder={t("gatewayRules.noDefault")}
                value={dvStr}
                onChange={(e) => {
                  const raw = e.target.value;
                  let parsed: unknown = raw;
                  if (raw === "") parsed = null;
                  else if (type === "integer" || type === "numeric") parsed = Number(raw);
                  update(name, { defaultValue: parsed });
                }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function VarColumn({
  title, subtitle, colorClass, selected, setSelected, vars, scope,
}: {
  title: string;
  subtitle: string;
  colorClass: string;
  selected: string[];
  setSelected: (v: string[]) => void;
  vars: ProcessVariable[];
  scope: VarsScope | null;
}) {
  const { t } = useTranslation();
  const chosen = vars.filter((v) => selected.includes(v.name));

  return (
    <div className="space-y-1">
      <div className="flex items-baseline gap-1">
        <span className="text-xs font-semibold uppercase tracking-wider">{title}</span>
        <span className="text-xs italic text-muted-foreground">{subtitle}</span>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {chosen.map((v) => (
          <span key={v.name} className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${colorClass}`}>
            <span className="font-medium">{v.label || v.name}</span>
            <span className="opacity-60">:{t("var_type." + v.var_type, getVarTypeLabel(v.var_type))}</span>
            <button
              type="button"
              className="ml-0.5 rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/10"
              onClick={() => setSelected(selected.filter((n) => n !== v.name))}
              aria-label={t("gatewayRules.removeVar", { name: v.name })}
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </span>
        ))}
        {chosen.length === 0 && (
          <span className="text-xs italic text-muted-foreground">{t("gatewayRules.noVars", { name: title.toLowerCase() })}</span>
        )}
        <AddVarPopover
          vars={vars}
          selectedNames={selected}
          catalogEmpty={vars.length === 0}
          onPick={(name) => {
            if (selected.includes(name)) return;
            setSelected([...selected, name]);
          }}
          onCreated={(name) => setSelected([...selected, name])}
          scope={scope}
        />
      </div>
    </div>
  );
}

function AddVarPopover({
  vars, selectedNames, catalogEmpty, onPick, onCreated, scope,
}: {
  vars: ProcessVariable[];
  selectedNames: string[];
  catalogEmpty?: boolean;
  onPick: (name: string) => void;
  onCreated: (name: string) => void;
  scope: VarsScope | null;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"pick" | "create">("pick");
  const [query, setQuery] = useState("");
  const [form, setForm] = useState<{ name: string; label: string; var_type: VarType }>({
    name: "", label: "", var_type: "text",
  });
  const [saving, setSaving] = useState(false);

  const ready = scopeReady(scope);

  useEffect(() => {
    if (open && catalogEmpty && ready) setMode("create");
  }, [open, catalogEmpty, ready]);

  const reset = () => {
    setMode("pick"); setQuery("");
    setForm({ name: "", label: "", var_type: "text" });
  };

  const selectedSet = new Set(selectedNames);
  const filtered = vars.filter((v) => {
    const q = query.toLowerCase().trim();
    if (!q) return true;
    return v.name.toLowerCase().includes(q) || (v.label || "").toLowerCase().includes(q);
  });


  const create = async () => {
    if (!ready) return;
          const name = form.name.trim();
    if (!name) { toast.error(t("gatewayRules.nameRequired")); return; }
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) { toast.error(t("gatewayRules.invalidName")); return; }
    setSaving(true);
    const { error } = await supabase.from("process_variables").insert({
      client_id: scope!.clientId,
      environment: scope!.environment,
      entity_id: scope!.entityId,
      owner_kind: null,
      owner_id: null,
      name,
      label: form.label.trim() || name,
      var_type: form.var_type,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(t("gatewayRules.varCreated"));
    await qc.invalidateQueries({ queryKey: ["process-variables"] });
    onCreated(name);
    setOpen(false); reset();
  };

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-full border border-dashed px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Plus className="h-2.5 w-2.5" /> {t("gatewayRules.addVar")}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="start">
        {mode === "pick" ? (
          <div className="space-y-2">
            <Input
              autoFocus value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder={t("gatewayRules.searchVar")} className="h-8 text-sm"
            />
            <div className="max-h-44 overflow-y-auto space-y-0.5">
              {filtered.length === 0 && (
                <p className="px-1 py-2 text-sm italic text-muted-foreground">
                  {catalogEmpty
                    ? t("gatewayRules.noVarsCatalog")
                    : t("gatewayRules.noMatches")}
                </p>
              )}
              {filtered.map((v) => {
                const isSelected = selectedSet.has(v.name);
                return (
                  <button
                    key={v.name} type="button"
                    disabled={isSelected}
                    className="flex w-full items-center justify-between rounded px-2 py-1 text-left text-sm hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent"
                    onClick={() => { onPick(v.name); setOpen(false); reset(); }}
                    title={isSelected ? t("gatewayRules.varAlreadyAdded") : ""}
                  >
                    <span className="truncate font-medium">{v.label || v.name}</span>
                    <span className="flex items-center gap-1 text-xs uppercase text-muted-foreground">
                      {isSelected && <span className="rounded bg-muted px-1 py-0.5 text-[9px] normal-case tracking-normal">{t("gatewayRules.varAddedLabel")}</span>}
                      {t("var_type." + v.var_type, getVarTypeLabel(v.var_type))}
                    </span>
                  </button>
                );
              })}

            </div>
            <Button
              type="button" size="sm" variant="secondary" className="w-full h-7 text-sm"
              disabled={!ready}
              onClick={() => setMode("create")}
            >
              <Plus className="mr-1 h-3 w-3" /> {t("gatewayRules.createNewVar")}
            </Button>
            {!ready && (
              <p className="text-xs text-amber-600">{t("gatewayRules.selectClientCreate")}</p>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <div>
              <label className="text-xs uppercase text-muted-foreground">{t("gatewayRules.techName")}</label>
              <Input className="h-8 text-sm" autoFocus value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t("gatewayRules.techNamePh")} />
            </div>
            <div>
              <label className="text-xs uppercase text-muted-foreground">{t("gatewayRules.label")}</label>
              <Input className="h-8 text-sm" value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder={t("gatewayRules.labelPh")} />
            </div>
            <div>
              <label className="text-xs uppercase text-muted-foreground">{t("gatewayRules.type")}</label>
              <select
                className="h-7 w-full rounded border bg-background px-1 text-xs"
                value={form.var_type}
                onChange={(e) => setForm({ ...form, var_type: e.target.value as VarType })}
              >
                <option value="text">{t("gatewayRules.varTypeText")}</option>
                <option value="integer">{t("gatewayRules.varTypeInteger")}</option>
                <option value="numeric">{t("gatewayRules.varTypeNumeric")}</option>
                <option value="boolean">{t("gatewayRules.varTypeBoolean")}</option>
                <option value="date">{t("gatewayRules.varTypeDate")}</option>
                <option value="timestamp">{t("gatewayRules.varTypeTimestamp")}</option>
                <option value="uuid">{t("gatewayRules.varTypeUuid")}</option>
                <option value="json">{t("gatewayRules.varTypeJson")}</option>
                <option value="entity">{t("gatewayRules.varTypeEntity")}</option>
              </select>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {t("gatewayRules.createHint")}
            </p>
            <div className="flex justify-end gap-1">
              <Button type="button" size="sm" variant="ghost" className="h-7 text-sm" onClick={() => setMode("pick")}>
                {t("gatewayRules.cancel")}
              </Button>
              <Button type="button" size="sm" className="h-7 text-sm" disabled={saving} onClick={create}>
                {t("gatewayRules.createAndAdd")}
              </Button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

