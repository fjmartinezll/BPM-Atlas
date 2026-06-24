import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/login")({ component: LoginPage });

function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // Forgot password dialog state
  const [resetOpen, setResetOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetLoading, setResetLoading] = useState(false);

  if (user) { void navigate({ to: "/entities" }); return null; }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    void navigate({ to: "/entities" });
  };

  const onResetSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!resetEmail) return;
    setResetLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setResetLoading(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Si el correo existe, recibirás un enlace para restablecer tu contraseña.");
    setResetOpen(false);
    setResetEmail("");
  };

  return (
    <div className="min-h-screen grid place-items-center bg-background px-4">
      <div className="absolute right-4 top-4"><LanguageSwitcher /></div>
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-5 rounded-xl border bg-card p-8 shadow-sm">
        <div>
          <h1 className="font-display text-2xl font-semibold">{t("nav.login")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("app.name")}</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">{t("auth.email")}</Label>
          <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">{t("auth.password")}</Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute inset-y-0 right-0 grid w-10 place-items-center text-muted-foreground hover:text-foreground"
              aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
              tabIndex={-1}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <div className="text-right">
            <Dialog open={resetOpen} onOpenChange={setResetOpen}>
              <DialogTrigger asChild>
                <button type="button" className="text-xs text-primary underline">
                  ¿Olvidó su contraseña?
                </button>
              </DialogTrigger>
              <DialogContent>
                <form onSubmit={onResetSubmit} className="space-y-4">
                  <DialogHeader>
                    <DialogTitle>Restablecer contraseña</DialogTitle>
                    <DialogDescription>
                      Introduce tu correo y te enviaremos un enlace para restablecerla.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-2">
                    <Label htmlFor="reset-email">{t("auth.email")}</Label>
                    <Input
                      id="reset-email"
                      type="email"
                      required
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                    />
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setResetOpen(false)} disabled={resetLoading}>
                      Cancelar
                    </Button>
                    <Button type="submit" disabled={resetLoading}>
                      {resetLoading ? "Enviando…" : "Enviar enlace"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>
        <Button type="submit" className="w-full" disabled={loading}>{t("auth.signIn")}</Button>
        <p className="text-center text-sm text-muted-foreground">
          {t("auth.noAccount")} <Link to="/signup" className="text-primary underline">{t("nav.signup")}</Link>
        </p>
      </form>
    </div>
  );
}
