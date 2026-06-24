import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/unsubscribe")({
  validateSearch: (s: Record<string, unknown>) => ({ token: typeof s.token === "string" ? s.token : "" }),
  head: () => ({ meta: [{ title: "Cancelar suscripción — BPM Atlas" }] }),
  component: UnsubscribePage,
});

type State = "loading" | "valid" | "invalid" | "already" | "confirming" | "done" | "error";

function UnsubscribePage() {
  const { token } = useSearch({ from: "/unsubscribe" });
  const [state, setState] = useState<State>("loading");
  const [email, setEmail] = useState<string>("");

  useEffect(() => {
    if (!token) { setState("invalid"); return; }
    (async () => {
      try {
        const res = await fetch(`/email/unsubscribe?token=${encodeURIComponent(token)}`);
        const j = await res.json().catch(() => ({}));
        if (!res.ok) { setState("invalid"); return; }
        if (j.used) { setState("already"); setEmail(j.email || ""); return; }
        setState("valid"); setEmail(j.email || "");
      } catch { setState("error"); }
    })();
  }, [token]);

  const confirm = async () => {
    setState("confirming");
    try {
      const res = await fetch("/email/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (!res.ok) { setState("error"); return; }
      setState("done");
    } catch { setState("error"); }
  };

  return (
    <div className="min-h-screen grid place-items-center bg-background px-4">
      <div className="w-full max-w-md rounded-xl border bg-card p-8 shadow-sm text-center space-y-4">
        <h1 className="font-display text-2xl font-semibold">Cancelar suscripción</h1>
        {state === "loading" && <p className="text-muted-foreground">Verificando enlace…</p>}
        {state === "invalid" && <p className="text-muted-foreground">Este enlace no es válido o ha expirado.</p>}
        {state === "error" && <p className="text-destructive">No pudimos procesar tu solicitud. Inténtalo de nuevo.</p>}
        {state === "already" && (
          <p className="text-muted-foreground">
            La dirección <strong>{email}</strong> ya fue dada de baja anteriormente.
          </p>
        )}
        {state === "valid" && (
          <>
            <p className="text-muted-foreground">
              Confirma que quieres dejar de recibir correos en <strong>{email}</strong>.
            </p>
            <Button onClick={confirm} className="w-full">Confirmar baja</Button>
          </>
        )}
        {state === "confirming" && <p className="text-muted-foreground">Procesando…</p>}
        {state === "done" && (
          <p className="text-emerald-600">
            Listo. <strong>{email}</strong> ya no recibirá más correos de BPM Atlas.
          </p>
        )}
      </div>
    </div>
  );
}
