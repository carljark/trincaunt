import React, { useCallback, useEffect, useState } from 'react';
import ConfirmationModal from './ConfirmationModal';
import { TrashIcon } from './icons';
import { formatShortDate } from '../utils/format';
import './ApiTokens.scss';

const apiHost = import.meta.env.VITE_API_HOST;
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '/api/v1';

export interface IApiToken {
  _id: string;
  nombre: string;
  prefijo: string;
  admin?: boolean;
  ultimoUso: string | null;
  createdAt: string;
}

const request = async <T,>(token: string, path: string, init: RequestInit = {}): Promise<T> => {
  const res = await fetch(`${apiHost}${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {})
    }
  });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message || 'Algo ha fallado. Inténtalo de nuevo.');
  return body.data as T;
};

interface ApiTokensProps {
  token: string;
  // Solo un administrador puede crear tokens con permiso de administración
  isAdmin?: boolean;
}

// Sección de Preferencias: tokens personales para usar la API desde fuera (servidor MCP)
const ApiTokens: React.FC<ApiTokensProps> = ({ token, isAdmin = false }) => {
  const [tokens, setTokens] = useState<IApiToken[] | null>(null);
  const [nombre, setNombre] = useState('');
  const [admin, setAdmin] = useState(false);
  const [created, setCreated] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toRevoke, setToRevoke] = useState<IApiToken | null>(null);

  const load = useCallback(async () => {
    try {
      setTokens(await request<IApiToken[]>(token, '/api-tokens'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar los tokens.');
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) return setError('Ponle un nombre, por ejemplo «MCP del portátil».');
    setBusy(true);
    setError(null);
    try {
      const result = await request<{ token: string; apiToken: IApiToken }>(token, '/api-tokens', {
        method: 'POST',
        body: JSON.stringify(isAdmin && admin ? { nombre: nombre.trim(), admin: true } : { nombre: nombre.trim() })
      });
      setCreated(result.token);
      setCopied(false);
      setNombre('');
      setAdmin(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el token.');
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created);
      setCopied(true);
    } catch {
      setError('No se pudo copiar. Selecciona el token y cópialo a mano.');
    }
  };

  const revoke = async () => {
    if (!toRevoke) return;
    const target = toRevoke;
    setToRevoke(null);
    try {
      await request<void>(token, `/api-tokens/${target._id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo borrar el token.');
    }
  };

  return (
    <div className="api-tokens">
      <p className="api-tokens__hint">
        Para usar Trincaunt desde un asistente (Claude Code, opencode…) con el servidor MCP. Cada token da acceso a
        todos tus grupos, gastos y presupuestos, también para borrar. Crea uno por equipo y borra el que ya no uses.
      </p>

      {error && <p className="api-tokens__error" role="alert">{error}</p>}

      {created && (
        <div className="api-tokens__created" role="status">
          <strong className="api-tokens__created-title">Cópialo ahora: no se volverá a mostrar</strong>
          <code className="api-tokens__secret">{created}</code>
          <div className="api-tokens__created-actions">
            <button type="button" className="api-tokens__button api-tokens__button--primary" onClick={() => void copy()}>
              {copied ? 'Copiado' : 'Copiar'}
            </button>
            <button type="button" className="api-tokens__button api-tokens__button--secondary" onClick={() => setCreated(null)}>
              Hecho
            </button>
          </div>
        </div>
      )}

      <form className="api-tokens__form" onSubmit={e => void create(e)}>
        <input
          className="api-tokens__input"
          type="text"
          maxLength={60}
          placeholder="Nombre, p. ej. MCP del portátil"
          aria-label="Nombre del token"
          value={nombre}
          onChange={e => { setNombre(e.target.value); setError(null); }}
        />
        <button type="submit" className="api-tokens__button api-tokens__button--primary" disabled={busy}>
          Crear token
        </button>
        {isAdmin && (
          <label className="api-tokens__admin-option">
            <input
              className="api-tokens__checkbox"
              type="checkbox"
              checked={admin}
              onChange={e => setAdmin(e.target.checked)}
            />
            <span>
              Permite administración: crear usuarios, cambiar roles y gestionar grupos de otros. Úsalo solo en equipos
              de confianza.
            </span>
          </label>
        )}
      </form>

      {tokens === null ? (
        !error && <p className="api-tokens__hint">Cargando tokens…</p>
      ) : tokens.length === 0 ? (
        <p className="api-tokens__hint">Aún no tienes ningún token.</p>
      ) : (
        <ul className="api-tokens__list">
          {tokens.map(t => (
            <li key={t._id} className="api-tokens__row">
              <span className="api-tokens__info">
                <span className="api-tokens__name">
                  {t.nombre}
                  {t.admin && <span className="api-tokens__badge">Administración</span>}
                </span>
                <span className="api-tokens__meta">
                  {t.prefijo}… · creado el {formatShortDate(t.createdAt)} ·{' '}
                  {t.ultimoUso ? `usado el ${formatShortDate(t.ultimoUso)}` : 'sin usar'}
                </span>
              </span>
              <button
                type="button"
                className="api-tokens__icon-button"
                onClick={() => setToRevoke(t)}
                aria-label={`Borrar el token ${t.nombre}`}
                title="Borrar"
              >
                <TrashIcon />
              </button>
            </li>
          ))}
        </ul>
      )}

      {toRevoke && (
        <ConfirmationModal
          title="Borrar el token"
          message={`Lo que use «${toRevoke.nombre}» dejará de tener acceso a Trincaunt al momento.`}
          confirmLabel="Borrar"
          onConfirm={() => void revoke()}
          onCancel={() => setToRevoke(null)}
        />
      )}
    </div>
  );
};

export default ApiTokens;
