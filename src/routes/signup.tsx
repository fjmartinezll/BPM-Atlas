import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LanguageSwitcher } from "@/components/language-switcher";
import { toast } from "sonner";

export const Route = createFileRoute("/signup")({ component: SignupPage });

function SignupPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const locale = (i18n.language || "es").split("-")[0];

    // 1. Validate that the email address exists (syntax + MX/A lookup)
    try {
      const vres = await fetch("/api/public/validate-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const vjson = await vres.json().catch(() => ({}));
      if (!vjson?.valid) {
        setLoading(false);
        toast.error(t("auth.invalidEmail"));
        return;
      }
    } catch {
      // network failure: fall through and let signUp decide
    }

    const { error } = await supabase.auth.signUp({
      email, password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { full_name: fullName, locale },
      },
    });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Te hemos enviado un email para confirmar tu registro. Revisa tu bandeja.");
    // Fire-and-forget: notify admins so they can monitor signups
    void fetch("/api/public/notify-new-signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, locale }),
    }).catch(() => {});
    // Fire-and-forget: send confirmation email to the new user with a token
    // that will auto-provision their private tenant + dueno_proceso role.
    void fetch("/api/public/send-welcome-confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    }).catch(() => {});
    void navigate({ to: "/login" });
  };

  return (
    <div className="min-h-screen grid place-items-center bg-background px-4">
      <div className="absolute right-4 top-4"><LanguageSwitcher /></div>
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-5 rounded-xl border bg-card p-8 shadow-sm">
        <div>
          <h1 className="font-display text-2xl font-semibold">{t("nav.signup")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("app.name")}</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="name">{t("auth.fullName")}</Label>
          <Input id="name" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">{t("auth.email")}</Label>
          <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">{t("auth.password")}</Label>
          <Input id="password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <Button type="submit" className="w-full" disabled={loading}>{t("auth.signUp")}</Button>
        <p className="text-center text-sm text-muted-foreground">
          {t("auth.hasAccount")} <Link to="/login" className="text-primary underline">{t("nav.login")}</Link>
        </p>
      </form>
    </div>
  );
}
