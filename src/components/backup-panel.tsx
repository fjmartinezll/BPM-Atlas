import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Download, Upload, DatabaseBackup, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { exportAllData, importAllData, type ImportResult, type BackupPayload } from "@/lib/backup.functions";

export function BackupPanel() {
  const exportFn = useServerFn(exportAllData);
  const importFn = useServerFn(importAllData);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [pendingPayload, setPendingPayload] = useState<BackupPayload | null>(null);
  const [results, setResults] = useState<ImportResult[] | null>(null);

  const exportMut = useMutation({
    mutationFn: () => exportFn() as Promise<BackupPayload>,
    onSuccess: (payload) => {
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 16);
      a.href = url;
      a.download = `bpm-atlas-backup-${stamp}.json`;
      a.click();
      URL.revokeObjectURL(url);
      const total = Object.values(payload.tables).reduce(
        (s, r) => s + ((r as any[])?.length ?? 0),
        0,
      );
      toast.success(`Backup descargado (${total} filas)`);
    },
    onError: (e: any) => toast.error(e?.message ?? "Error exportando"),
  });

  const importMut = useMutation({
    mutationFn: (payload: BackupPayload) => importFn({ data: { payload } }),
    onSuccess: (res) => {
      setResults(res);
      const errs = res.reduce((s, r) => s + r.errors.length, 0);
      if (errs) toast.error(`Importación finalizada con ${errs} errores`);
      else toast.success("Importación completada");
    },
    onError: (e: any) => toast.error(e?.message ?? "Error importando"),
  });

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as BackupPayload;
      if (parsed?.version !== 1 || !parsed.tables) {
        toast.error("Archivo no válido: falta version=1 o tables");
        return;
      }
      setPendingPayload(parsed);
    } catch (err: any) {
      toast.error(`No se pudo leer el archivo: ${err?.message ?? err}`);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DatabaseBackup className="h-5 w-5 text-primary" />
          Backup / Clonado de datos
        </CardTitle>
        <CardDescription>
          Exporta los datos clave a un único JSON o impórtalos en otro proyecto (por ejemplo,
          tras hacer un remix). Solo administradores.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Qué se incluye y qué NO</AlertTitle>
          <AlertDescription className="text-xs space-y-1">
            <div>
              <strong>Incluye:</strong> clientes, entidades, macroprocesos, procesos, subprocesos,
              tareas, diagramas, posiciones de entidad, vínculos entidad↔proceso, taxonomía de
              nodos y catálogo de campos.
            </div>
            <div>
              <strong>NO incluye:</strong> usuarios y roles (<code>profiles</code>, <code>user_roles</code>,{" "}
              <code>user_clients</code>), instancias en ejecución, logs, emails, ni archivos del
              bucket de Storage.
            </div>
            <div>
              El import usa <em>upsert</em> por <code>id</code>: las filas existentes con el mismo
              id se sobrescriben, las nuevas se añaden.
            </div>
          </AlertDescription>
        </Alert>

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => exportMut.mutate()} disabled={exportMut.isPending}>
            <Download className="h-4 w-4 mr-2" />
            {exportMut.isPending ? "Exportando…" : "Exportar todo a JSON"}
          </Button>
          <Button
            variant="outline"
            onClick={() => fileRef.current?.click()}
            disabled={importMut.isPending}
          >
            <Upload className="h-4 w-4 mr-2" />
            {importMut.isPending ? "Importando…" : "Importar desde JSON"}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={onFile}
          />
        </div>

        {results && (
          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tabla</TableHead>
                  <TableHead className="text-right">Filas importadas</TableHead>
                  <TableHead>Errores</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((r) => (
                  <TableRow key={r.table}>
                    <TableCell className="font-mono text-xs">{r.table}</TableCell>
                    <TableCell className="text-right">{r.inserted}</TableCell>
                    <TableCell className="text-xs text-destructive">
                      {r.errors.length === 0 ? "—" : r.errors.join("; ")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <AlertDialog
        open={!!pendingPayload}
        onOpenChange={(open) => !open && setPendingPayload(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar importación</AlertDialogTitle>
            <AlertDialogDescription>
              Esta operación insertará los datos del archivo en la base de datos actual.
              Las filas existentes con el mismo <code>id</code> serán sobrescritas (upsert).
              Esta acción no se puede deshacer fácilmente. ¿Continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingPayload) importMut.mutate(pendingPayload);
                setPendingPayload(null);
              }}
            >
              Importar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
