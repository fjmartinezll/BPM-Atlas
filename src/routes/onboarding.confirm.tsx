import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';

type State =
  | { kind: 'loading' }
  | { kind: 'success'; alreadyConfirmed: boolean }
  | { kind: 'error'; message: string };

export const Route = createFileRoute('/onboarding/confirm')({
  validateSearch: (s: Record<string, unknown>) => ({ token: String(s.token || '') }),
  component: ConfirmPage,
});

function ConfirmPage() {
  const { token } = Route.useSearch();
  const navigate = useNavigate();
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token) {
        setState({ kind: 'error', message: 'Falta el token de confirmación.' });
        return;
      }
      try {
        const res = await fetch('/api/public/confirm-signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok || !json?.ok) {
          const msg =
            json?.error === 'expired'
              ? 'El enlace ha caducado. Pide uno nuevo.'
              : json?.error === 'invalid_token'
              ? 'Enlace inválido o ya utilizado.'
              : 'No se pudo confirmar el registro.';
          setState({ kind: 'error', message: msg });
          return;
        }
        setState({ kind: 'success', alreadyConfirmed: !!json.alreadyConfirmed });
      } catch {
        if (!cancelled) setState({ kind: 'error', message: 'Error de red. Inténtalo de nuevo.' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function goToApp() {
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      void navigate({ to: '/dashboard' });
    } else {
      void navigate({ to: '/login' });
    }
  }

  return (
    <div className="min-h-screen grid place-items-center bg-background px-4">
      <div className="w-full max-w-md space-y-6 rounded-xl border bg-card p-8 shadow-sm text-center">
        {state.kind === 'loading' && (
          <>
            <Loader2 className="mx-auto h-10 w-10 animate-spin text-primary" />
            <h1 className="font-display text-xl font-semibold">Activando tu cuenta…</h1>
            <p className="text-sm text-muted-foreground">Estamos creando tu espacio privado.</p>
          </>
        )}
        {state.kind === 'success' && (
          <>
            <CheckCircle2 className="mx-auto h-12 w-12 text-green-600" />
            <h1 className="font-display text-2xl font-semibold">
              {state.alreadyConfirmed ? '¡Tu cuenta ya estaba activada!' : '¡Tu espacio está listo!'}
            </h1>
            <p className="text-sm text-muted-foreground">
              {state.alreadyConfirmed
                ? 'Ya puedes acceder a la aplicación con tus credenciales.'
                : 'Hemos creado tu tenant privado y te hemos asignado como dueño de proceso. Ya puedes empezar a modelar tus procesos.'}
            </p>
            <Button className="w-full" onClick={goToApp}>
              Ir a la aplicación
            </Button>
          </>
        )}
        {state.kind === 'error' && (
          <>
            <XCircle className="mx-auto h-12 w-12 text-destructive" />
            <h1 className="font-display text-xl font-semibold">No se pudo activar tu cuenta</h1>
            <p className="text-sm text-muted-foreground">{state.message}</p>
            <Button asChild variant="outline" className="w-full">
              <Link to="/signup">Volver al registro</Link>
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
