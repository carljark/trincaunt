import React, { useState } from 'react';
import './ChangePassword.scss';

const apiHost = import.meta.env.VITE_API_HOST;
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '/api/v1';

export const MIN_PASSWORD = 8;

interface ChangePasswordProps {
  token: string;
}

// Sección de Preferencias: cambiar la contraseña (p. ej. la generada al crear la cuenta un administrador)
const ChangePassword: React.FC<ChangePasswordProps> = ({ token }) => {
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [repetida, setRepetida] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const edit = (setter: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setter(e.target.value);
    setError(null);
    setDone(false);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!actual) return setError('Escribe tu contraseña actual.');
    if (nueva.length < MIN_PASSWORD) return setError(`La contraseña nueva debe tener al menos ${MIN_PASSWORD} caracteres.`);
    if (nueva !== repetida) return setError('Las dos contraseñas nuevas no coinciden.');
    setBusy(true);
    try {
      const res = await fetch(`${apiHost}${apiBaseUrl}/users/me/password`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ actual, nueva })
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || 'No se pudo cambiar la contraseña.');
      }
      setActual('');
      setNueva('');
      setRepetida('');
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cambiar la contraseña.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="change-password" onSubmit={e => void submit(e)}>
      <label className="change-password__field">
        <span className="change-password__label">Contraseña actual</span>
        <input className="change-password__input" type="password" autoComplete="current-password" value={actual} onChange={edit(setActual)} />
      </label>
      <label className="change-password__field">
        <span className="change-password__label">Contraseña nueva</span>
        <input className="change-password__input" type="password" autoComplete="new-password" value={nueva} onChange={edit(setNueva)} />
      </label>
      <label className="change-password__field">
        <span className="change-password__label">Repite la nueva</span>
        <input className="change-password__input" type="password" autoComplete="new-password" value={repetida} onChange={edit(setRepetida)} />
      </label>

      {error && <p className="change-password__message change-password__message--error" role="alert">{error}</p>}
      {done && <p className="change-password__message change-password__message--ok" role="status">Contraseña cambiada.</p>}

      <button type="submit" className="change-password__button" disabled={busy}>
        Cambiar contraseña
      </button>
    </form>
  );
};

export default ChangePassword;
