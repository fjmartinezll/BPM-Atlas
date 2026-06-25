import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Workflow, GitBranch, ListTree, CheckSquare, Shield, Inbox, ArrowRight, RefreshCcw } from "lucide-react";

export const Route = createFileRoute("/_authenticated/encyclopedia")({
  head: () => ({ meta: [{ title: "BPM Encyclopedia — BPM Atlas" }] }),
  component: EncyclopediaPage,
});

function EncyclopediaPage() {
  const { t } = useTranslation();
  const entries = [
    { icon: Workflow, title: t("levels.macroprocess"), text: t("enc.macroprocess") },
    { icon: GitBranch, title: t("levels.process"), text: t("enc.process") },
    { icon: ListTree, title: t("levels.subprocess"), text: t("enc.subprocess") },
    { icon: CheckSquare, title: t("levels.task"), text: t("enc.task") },
    { icon: Shield, title: t("fields.owner"), text: t("enc.owner") },
    { icon: Inbox, title: "SIPOC", text: t("enc.sipoc") },
    { icon: RefreshCcw, title: "PDCA", text: t("enc.pdca") },
  ];
  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="font-display text-3xl font-semibold">{t("encyclopedia.title")}</h1>
      <p className="mt-2 text-muted-foreground">{t("encyclopedia.subtitle")}</p>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {entries.map((e) => (
          <article key={e.title} className="rounded-xl border bg-card p-6">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-md bg-accent/15 text-accent">
                <e.icon className="h-5 w-5" />
              </div>
              <h2 className="font-display text-lg font-semibold">{e.title}</h2>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{e.text}</p>
          </article>
        ))}
      </div>

      <div className="mt-10 rounded-xl border bg-muted/40 p-6">
        <h3 className="font-display text-lg font-semibold">Top-Down</h3>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
          {[t("levels.macroprocess"), t("levels.process"), t("levels.subprocess"), t("levels.task")].map((n, i, a) => (
            <span key={n} className="flex items-center gap-2">
              <span className="rounded-md bg-card px-3 py-1 font-medium shadow-sm">{n}</span>
              {i < a.length - 1 && <ArrowRight className="h-4 w-4 text-muted-foreground" />}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
