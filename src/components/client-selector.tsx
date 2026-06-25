import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Building2, FlaskConical, Rocket, Box, ListTree, ArrowRightLeft } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { STALE } from "@/lib/query-keys";
import { useClient, type Environment } from "@/lib/client-context";
import { useAuth } from "@/lib/auth-context";
import { useSelectedEntity } from "@/lib/selected-entity";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ScopeDiagramsDialog } from "@/components/scope-diagrams-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type PendingChange =
  | { kind: "entity"; value: { id: string; name: string } | null }
  | { kind: "environment"; value: Environment };

export function ClientSelector() {
  const { t } = useTranslation();
  const { currentClient, currentClientId, environment, setEnvironment } = useClient();
  const { isAdmin } = useAuth();
  const { entity, setEntity } = useSelectedEntity();
  const [pending, setPending] = useState<PendingChange | null>(null);
  const [scopeDialog, setScopeDialog] = useState<null | "view" | "migrate">(null);

  const entitiesQ = useQuery({
    queryKey: ["entities-for-selector", currentClientId, environment],
    staleTime: STALE.REFERENCE,
    enabled: !!currentClientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("entities")
        .select("id,name")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  if (!currentClient) {
    return (
      <div className="px-2 py-2 text-xs text-sidebar-foreground/70">
        {t("clientSelector.noTenant")}
      </div>
    );
  }

  const requestChange = (change: PendingChange) => setPending(change);

  const applyChange = () => {
    if (!pending) return;
    if (pending.kind === "entity") setEntity(pending.value);
    else if (pending.kind === "environment") setEnvironment(pending.value);
    setPending(null);
  };

  const dialogCopy = (() => {
    if (!pending) return { title: "", description: "" };
    if (pending.kind === "entity") {
      return {
        title: t("clientSelector.changeEntity"),
        description: pending.value
          ? t("clientSelector.confirmEntityChange", { name: pending.value.name })
          : t("clientSelector.confirmEntityRemove"),
      };
    }
    return {
      title: t("clientSelector.changeEnv"),
      description: t("clientSelector.confirmEnvChange", {
        name: pending.value === "produccion" ? t("clientSelector.production") : t("clientSelector.testing"),
      }),
    };
  })();

  return (
    <div className="flex flex-col gap-2">
      {/* Tenant (solo lectura) */}
      <div className="space-y-1">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/60">
          {t("clientSelector.tenant")}
        </div>
        <div className="flex items-center gap-2 rounded-md border border-sidebar-border bg-sidebar-accent/40 px-2 py-1.5">
          <Building2 className="h-3.5 w-3.5 shrink-0 text-sidebar-foreground/70" />
          <span className="truncate text-xs font-medium flex-1" title={currentClient.name}>
            {currentClient.name}
          </span>
          {currentClient.code && (
            <span className="text-[10px] text-sidebar-foreground/60">{currentClient.code}</span>
          )}
        </div>
      </div>

      {/* Entidad */}
      <div className="space-y-1">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/60">
          {t("clientSelector.entity")}
        </div>
        <Select
          value={entity?.id ?? "__none__"}
          onValueChange={(v) => {
            if (v === "__none__") {
              if (entity) {
                if ((entitiesQ.data ?? []).length > 0) {
                  toast.warning(t("clientSelector.cantRemoveEntity"), {
                    description: t("clientSelector.cantRemoveEntityDesc"),
                  });
                  return;
                }
                requestChange({ kind: "entity", value: null });
              }
              return;
            }
            const found = (entitiesQ.data ?? []).find((e) => e.id === v);
            if (!found || found.id === entity?.id) return;
            requestChange({ kind: "entity", value: { id: found.id, name: found.name } });
          }}
          disabled={!currentClientId}
        >
          <SelectTrigger className="h-8 w-full text-xs">
            <div className="flex items-center gap-1.5 min-w-0">
              <Box className="h-3.5 w-3.5 shrink-0" />
              <SelectValue placeholder={t("clientSelector.selectEntity")} />
            </div>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__" className="text-xs italic">
              {t("clientSelector.noEntity")}
            </SelectItem>
            {(entitiesQ.data ?? []).map((e) => (
              <SelectItem key={e.id} value={e.id} className="text-xs">
                {e.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Entorno */}
      {isAdmin && (
        <div className="space-y-1">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/60">
            {t("clientSelector.environment")}
          </div>
          <div className="grid grid-cols-2 gap-1">
            <Button
              type="button"
              size="sm"
              variant={environment === "produccion" ? "default" : "outline"}
              className={environment === "produccion" ? "h-7 px-1 text-[10px] font-medium" : "h-7 px-1 text-[10px] font-medium bg-sky-50/60 text-sky-800 border-sky-200 hover:bg-sky-100 hover:text-sky-900 hover:border-sky-400 dark:bg-sky-950/30 dark:text-sky-400 dark:border-sky-800 dark:hover:bg-sky-900/50 dark:hover:text-sky-300 dark:hover:border-sky-600"}
              onClick={() =>
                environment !== "produccion" &&
                requestChange({ kind: "environment", value: "produccion" })
              }
              title={t("clientSelector.tooltipProduction")}
            >
              <Rocket className="mr-1 h-3 w-3" /> {t("clientSelector.production")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant={environment === "pruebas" ? "default" : "outline"}
              className={environment === "pruebas" ? "h-7 px-1 text-[10px] font-medium" : "h-7 px-1 text-[10px] font-medium bg-sky-50/60 text-sky-800 border-sky-200 hover:bg-sky-100 hover:text-sky-900 hover:border-sky-400 dark:bg-sky-950/30 dark:text-sky-400 dark:border-sky-800 dark:hover:bg-sky-900/50 dark:hover:text-sky-300 dark:hover:border-sky-600"}
              onClick={() =>
                environment !== "pruebas" &&
                requestChange({ kind: "environment", value: "pruebas" })
              }
              title={t("clientSelector.tooltipTesting")}
            >
              <FlaskConical className="mr-1 h-3 w-3" /> {t("clientSelector.testing")}
            </Button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-1 pt-1">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 px-1 text-[10px] font-medium bg-sky-50/60 text-sky-800 border-sky-200 hover:bg-sky-100 hover:text-sky-900 hover:border-sky-400 dark:bg-sky-950/30 dark:text-sky-400 dark:border-sky-800 dark:hover:bg-sky-900/50 dark:hover:text-sky-300 dark:hover:border-sky-600"
          onClick={() => setScopeDialog("view")}
          disabled={!currentClientId}
          title={t("clientSelector.viewDiagrams")}
        >
          <ListTree className="mr-1 h-3 w-3" /> {t("clientSelector.diagrams")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 px-1 text-[10px] font-medium bg-sky-50/60 text-sky-800 border-sky-200 hover:bg-sky-100 hover:text-sky-900 hover:border-sky-400 dark:bg-sky-950/30 dark:text-sky-400 dark:border-sky-800 dark:hover:bg-sky-900/50 dark:hover:text-sky-300 dark:hover:border-sky-600"
          onClick={() => setScopeDialog("migrate")}
          disabled={!currentClientId}
          title={t("clientSelector.migrateDiagrams")}
        >
          <ArrowRightLeft className="mr-1 h-3 w-3" /> {t("clientSelector.migrate")}
        </Button>
      </div>

      <AlertDialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{dialogCopy.title}</AlertDialogTitle>
            <AlertDialogDescription>{dialogCopy.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("actions.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={applyChange}>{t("clientSelector.confirmChange")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {scopeDialog && (
        <ScopeDiagramsDialog
          open={!!scopeDialog}
          onOpenChange={(o) => !o && setScopeDialog(null)}
          initialMode={scopeDialog}
          clientId={currentClientId}
          environment={environment}
          entityId={entity?.id ?? null}
          entityName={entity?.name ?? null}
        />
      )}
    </div>
  );
}
