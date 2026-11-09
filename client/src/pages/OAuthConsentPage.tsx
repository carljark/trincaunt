import React, { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './OAuthConsentPage.scss';

const apiHost = import.meta.env.VITE_API_HOST || '';
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '/api/v1';

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; cliente: string }
  | { kind: 'sending' ; cliente: string }
  | { kind: 'error'; message: string };

/**
 * Pantalla de permiso del conector (OAuth): una aplicación como Claude pide acceso a tu
 * cuenta; al permitirlo vuelve a ella con un código que canjea por un token de API, que
 * luego aparece en Preferencias y se puede borrar allí.
 */
const OAuthConsentPage: React.FC = () => {
  const { token, user } = useAuth();
  const { search } = useLocation();
  const params = useMemo(() => Object.fromEntries(new URLSearchParams(search)), [search]);
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    fetch(`${apiHost}${apiBaseUrl}/oauth/authorize${search}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async res => {
        const body = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) setState({ kind: 'error', message: body.message || 'No se ha podido leer la petición.' });
        else setState({ kind: 'ready', cliente: body.data.cliente });
      })
      .catch(() => { if (!cancelled) setState({ kind: 'error', message: 'Error de red. Inténtalo de nuevo.' }); });
    return () => { cancelled = true; };
  }, [search, token]);

  const decide = async (permitir: boolean) => {
    if (state.kind !== 'ready') return;
    setState({ kind: 'sending', cliente: state.cliente });
    try {
      const res = await fetch(`${apiHost}${apiBaseUrl}/oauth/authorize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ params, permitir })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || 'No se ha podido completar.');
      window.location.assign(body.data.redirect);
    } catch (err) {
      setState({ kind: 'error', message: err instanceof Error ? err.message : 'No se ha podido completar.' });
    }
  };

  return (
    <main className="oauth-consent">
      <section className="oauth-consent__card" aria-labelledby="oauth-consent-title">
        <h1 id="oauth-consent-title" className="oauth-consent__title">Conectar con Trincaunt</h1>
        {state.kind === 'loading' && <p className="oauth-consent__text" role="status">Cargando…</p>}
        {state.kind === 'error' && <p className="oauth-consent__error" role="alert">{state.message}</p>}
        {(state.kind === 'ready' || state.kind === 'sending') && (
          <>
            <p className="oauth-consent__text">
              <strong>{state.cliente}</strong> quiere acceder a tu cuenta{user?.nombre ? ` (${user.nombre})` : ''}: ver y cambiar
              tus gastos, grupos y presupuesto, como desde la app.
            </p>
            <p className="oauth-consent__hint">
              Se creará un token de acceso que puedes borrar cuando quieras en Preferencias → Acceso para asistentes.
            </p>
            <div className="oauth-consent__actions">
              <button
                type="button"
                className="oauth-consent__button oauth-consent__button--secondary"
                onClick={() => decide(false)}
                disabled={state.kind === 'sending'}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="oauth-consent__button oauth-consent__button--primary"
                onClick={() => decide(true)}
                disabled={state.kind === 'sending'}
              >
                {state.kind === 'sending' ? 'Conectando…' : 'Permitir'}
              </button>
            </div>
          </>
        )}
      </section>
    </main>
  );
};

export default OAuthConsentPage;
