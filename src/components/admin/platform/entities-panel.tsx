import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { GitBranch } from "lucide-react";
import { HierarchyManager } from "@/components/control-center-crud";

export function PlatformEntitiesPanel() {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><GitBranch className="h-5 w-5" /> {t("adminEntities.title")}</CardTitle>
          <CardDescription>{t("adminEntities.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <HierarchyManager />
        </CardContent>
      </Card>
    </div>
  );
}

