import { createFileRoute, useNavigate, useSearch, Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, CheckCircle2, XCircle, MailCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export const Route = createFileRoute('/invite/accept')({
  head: () => ({ meta: [{ title: 'Aceptar invitación — BPM Atlas' }] }),
  validateSearch: (s: Record<string, unknown>) => ({ token: String(s.token || '') }),
  component: AcceptInvitePage,
});

function AcceptInvitePage() {
  const { token } = useSearch({ from: '/invite/accept' });
  const nav = useNavigate();
  const [status, setStatus] = useState<'loading' | 'need_auth' | 'ok' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let cancel = false;
    (async () => {
      if (!token) {
        setStatus('error'); setMessage('Falta el token de invitación.'); return;
      }
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        if (!cancel) setStatus('need_auth');
        return;
      }
      try {
        const res = await fetch('/api/public/accept-invite', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ token }),
        });
        const json: any = await res.json();
        if (!cancel) {
          if (json.ok) {
            setStatus('ok');
            setMessage(json.alreadyAccepted ? 'Esta invitación ya estaba aceptada.' : '¡Te has unido al workspace!');
            setTimeout(() => nav({ to: '/dashboard' }), 1500);
          } else {
            setStatus('error');
            setMessage(json.error || 'No se pudo aceptar la invitación.');
          }
        }
      } catch (e: any) {
        if (!cancel) { setStatus('error'); setMessage(e?.message || 'Error de red'); }
      }
    })();
    return () => { cancel = true; };
  }, [token, nav]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-muted/30">
      <Card className="max-w-md w-full">
        <CardContent className="p-8 text-center space-y-4">
          {status === 'loading' && (
            <>
              <Loader2 className="h-10 w-10 animate-spin mx-auto text-primary" />
              <p className="text-sm text-muted-foreground">Procesando invitación…</p>
            </>
          )}
          {status === 'need_auth' && (
            <>
              <MailCheck className="h-10 w-10 mx-auto text-primary" />
              <h1 className="text-xl font-semibold">Inicia sesión para aceptar</h1>
              <p className="text-sm text-muted-foreground">
                Para aceptar la invitación necesitas iniciar sesión con el email al que se envió.
                Si aún no tienes cuenta, regístrate primero.
              </p>
              <div className="flex gap-2 justify-center">
                <Button asChild>
                  <Link to="/login">Iniciar sesión</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link to="/signup">Crear cuenta</Link>
                </Button>
              </div>
            </>
          )}
          {status === 'ok' && (
            <>
              <CheckCircle2 className="h-10 w-10 mx-auto text-green-600" />
              <h1 className="text-xl font-semibold">{message}</h1>
              <p className="text-sm text-muted-foreground">Redirigiendo…</p>
            </>
          )}
          {status === 'error' && (
            <>
              <XCircle className="h-10 w-10 mx-auto text-destructive" />
              <h1 className="text-xl font-semibold">No se pudo aceptar</h1>
              <p className="text-sm text-muted-foreground">{message}</p>
              <Button asChild variant="outline"><Link to="/dashboard">Ir al panel</Link></Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
