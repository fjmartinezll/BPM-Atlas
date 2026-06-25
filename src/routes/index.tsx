import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Workflow, GitBranch, Shield, BookOpen } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "BPM Atlas — Modelado jerárquico de procesos" },
      { name: "description", content: "Visualiza y gobierna mapas de procesos, procesos, subprocesos y tareas de tu organización." },
    ],
  }),
  component: Landing,
});

function Landing() {
  const { t } = useTranslation();
  const { user, loading } = useAuth();
  if (!loading && user) return <Navigate to="/dashboard" />;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-md bg-primary text-primary-foreground">
              <Workflow className="h-5 w-5" />
            </div>
            <span className="font-display text-lg font-semibold">{t("app.name")}</span>
          </div>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <Button asChild variant="ghost"><Link to="/login">{t("nav.login")}</Link></Button>
            <Button asChild><Link to="/signup">{t("nav.signup")}</Link></Button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="max-w-3xl">
          <span className="inline-flex items-center rounded-full bg-accent/15 px-3 py-1 text-xs font-medium text-accent-foreground">BPM · Top-Down</span>
          <h1 className="mt-4 font-display text-5xl font-bold leading-tight tracking-tight md:text-6xl">{t("auth.welcome")}</h1>
          <p className="mt-4 text-lg text-muted-foreground">{t("auth.subtitle")}</p>
          <div className="mt-8 flex gap-3">
            <Button asChild size="lg"><Link to="/signup">{t("nav.signup")}</Link></Button>
            <Button asChild size="lg" variant="outline"><Link to="/login">{t("nav.login")}</Link></Button>
          </div>
        </div>

        <div className="mt-20 grid gap-6 md:grid-cols-3">
          {[
            { icon: GitBranch, title: t("dashboard.subtitle"), text: "Mapas de Procesos → Procesos → Subprocesos → Tareas." },
            { icon: Shield, title: t("nav.admin"), text: "Roles: Administrador, Diseñador de Procesos, Usuario, Auditor." },
            { icon: BookOpen, title: t("nav.encyclopedia"), text: t("encyclopedia.subtitle") },
          ].map((c) => (
            <div key={c.title} className="rounded-xl border bg-card p-6">
              <c.icon className="h-6 w-6 text-accent" />
              <h3 className="mt-3 font-display text-lg font-semibold">{c.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{c.text}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
