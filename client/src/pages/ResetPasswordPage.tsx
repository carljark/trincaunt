import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import AuthCard from '../components/AuthCard';
import { MIN_PASSWORD } from '../components/ChangePassword';

const apiHost = import.meta.env.VITE_API_HOST;
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '/api/v1';

// Destino del enlace del correo (/reset-password?token=...): elegir la contraseña nueva
const ResetPasswordPage: React.FC = () => {
  const token = useSearchParams()[0].get('token') ?? '';
  const [password, setPassword] = useState('');
  const [repeated, setRepeated] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < MIN_PASSWORD) return setError(`La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`);
    if (password !== repeated) return setError('Las dos contraseñas no coinciden.');
    setError('');
    setBusy(true);
    try {
      const res = await fetch(`${apiHost}${apiBaseUrl}/users/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password })
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || 'No se pudo cambiar la contraseña.');
      }
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cambiar la contraseña.');
    } finally {
      setBusy(false);
    }
  };

  const footer = done
    ? <Link to="/login" className="auth-card__link">Entrar</Link>
    : <Link to="/forgot-password" className="auth-card__link">Pedir otro enlace</Link>;

  return (
    <AuthCard title="Nueva contraseña" onSubmit={e => void handleSubmit(e)} footer={footer}>
      {done ? (
        <p className="auth-card__message auth-card__message--ok" role="status">
          Contraseña cambiada. Ya puedes entrar con la nueva.
        </p>
      ) : !token ? (
        <p className="auth-card__message auth-card__message--error" role="alert">
          El enlace no es válido o ha caducado.
        </p>
      ) : (
        <>
          <input
            className="auth-card__input"
            type="password"
            placeholder={`Contraseña nueva (mín. ${MIN_PASSWORD})`}
            aria-label="Contraseña nueva"
            autoComplete="new-password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />
          <input
            className="auth-card__input"
            type="password"
            placeholder="Repite la contraseña"
            aria-label="Repite la contraseña"
            autoComplete="new-password"
            value={repeated}
            onChange={e => setRepeated(e.target.value)}
            required
          />
          {error && <p className="auth-card__message auth-card__message--error" role="alert">{error}</p>}
          <button type="submit" className="auth-card__button" disabled={busy}>Cambiar contraseña</button>
        </>
      )}
    </AuthCard>
  );
};

export default ResetPasswordPage;
