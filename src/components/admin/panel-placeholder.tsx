import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";

interface Props {
  title: string;
  description: string;
  /** Existing legacy route this panel will eventually absorb. */
  legacyRoute: string;
  legacyLabel: string;
}

/** Fase 1 placeholder — content is moved here in Fase 2. */
export function PanelPlaceholder({ title, description, legacyRoute, legacyLabel }: Props) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          {t("adminPlaceholder.notReady")}
        </p>
        <Button asChild variant="secondary" size="sm">
          <Link to={legacyRoute}>
            <ExternalLink className="h-4 w-4 mr-2" />
            {t("adminPlaceholder.goTo", { name: legacyLabel })}
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
