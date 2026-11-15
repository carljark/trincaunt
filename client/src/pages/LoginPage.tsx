import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import AuthCard from '../components/AuthCard';

const apiHost = import.meta.env.VITE_API_HOST;

const LoginPage: React.FC = () => {
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();
  // Si se llegó aquí desde una página que pedía sesión (p. ej. el permiso de un conector), se vuelve a ella
  const from = (useLocation().state as { from?: string } | null)?.from;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const response = await fetch(`${apiHost}/api/v1/users/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Error al iniciar sesión');
      }
      login(data.token, data.data.user);
      navigate(from && from.startsWith('/') ? from : '/');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <AuthCard
      title="Login"
      onSubmit={handleSubmit}
      footer={
        <p className="auth-card__text">
          ¿No tienes cuenta? <Link to="/register" className="auth-card__link">Regístrate</Link>
        </p>
      }
    >
      <input
        className="auth-card__input"
        type="email"
        name="email"
        placeholder="Email"
        autoComplete="email"
        value={formData.email}
        onChange={handleChange}
        required
      />
      <input
        className="auth-card__input"
        type="password"
        name="password"
        placeholder="Password"
        autoComplete="current-password"
        value={formData.password}
        onChange={handleChange}
        required
      />
      <Link to="/forgot-password" className="auth-card__link auth-card__link--inline">
        ¿Has olvidado tu contraseña?
      </Link>
      {error && <p className="auth-card__message auth-card__message--error" role="alert">{error}</p>}
      <button type="submit" className="auth-card__button">Login</button>
    </AuthCard>
  );
};

export default LoginPage;
