import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { GitBranch } from "lucide-react";
import { HierarchyManager } from "@/components/control-center-crud";

export function PlatformEntitiesPanel() {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><GitBranch className="h-5 w-5" /> Jerarquía de procesos de una Entidad</CardTitle>
          <CardDescription>Gestiona entidades, macroprocesos, procesos y subprocesos respetando las relaciones padre→hijo.</CardDescription>
        </CardHeader>
        <CardContent>
          <HierarchyManager />
        </CardContent>
      </Card>
    </div>
  );
}

