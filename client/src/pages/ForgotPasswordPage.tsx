import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import AuthCard from '../components/AuthCard';

const apiHost = import.meta.env.VITE_API_HOST;
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '/api/v1';

// Pide por email un enlace para elegir una contraseña nueva
const ForgotPasswordPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await fetch(`${apiHost}${apiBaseUrl}/users/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || 'No se pudo enviar el enlace.');
      }
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo enviar el enlace.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard
      title="Recuperar contraseña"
      onSubmit={e => void handleSubmit(e)}
      footer={<Link to="/login" className="auth-card__link">Volver a entrar</Link>}
    >
      {sent ? (
        <p className="auth-card__message auth-card__message--ok" role="status">
          Si hay una cuenta con ese email, te hemos enviado un enlace para elegir una contraseña nueva.
          El enlace caduca en una hora.
        </p>
      ) : (
        <>
          <p className="auth-card__text">Escribe el email de tu cuenta y te enviaremos un enlace para elegir una contraseña nueva.</p>
          <input
            className="auth-card__input"
            type="email"
            name="email"
            placeholder="Email"
            autoComplete="email"
            autoCapitalize="none"
            aria-label="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
          />
          {error && <p className="auth-card__message auth-card__message--error" role="alert">{error}</p>}
          <button type="submit" className="auth-card__button" disabled={busy}>Enviar enlace</button>
        </>
      )}
    </AuthCard>
  );
};

export default ForgotPasswordPage;
