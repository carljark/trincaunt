import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import AuthCard from '../components/AuthCard';

const apiHost = import.meta.env.VITE_API_HOST;

const RegisterPage: React.FC = () => {
  const [formData, setFormData] = useState({ nombre: '', email: '', password: '' });
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const response = await fetch(`${apiHost}/api/v1/users/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Error al registrarse');
      }
      alert('Registro exitoso. Ahora puedes iniciar sesión.');
      navigate('/login');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <AuthCard
      title="Registro"
      onSubmit={handleSubmit}
      footer={
        <p className="auth-card__text">
          ¿Ya tienes cuenta? <Link to="/login" className="auth-card__link">Inicia sesión</Link>
        </p>
      }
    >
      <input
        className="auth-card__input"
        type="text"
        name="nombre"
        placeholder="Nombre"
        autoComplete="name"
        value={formData.nombre}
        onChange={handleChange}
        required
      />
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
        autoComplete="new-password"
        value={formData.password}
        onChange={handleChange}
        required
      />
      {error && <p className="auth-card__message auth-card__message--error" role="alert">{error}</p>}
      <button type="submit" className="auth-card__button">Registrarse</button>
    </AuthCard>
  );
};

export default RegisterPage;
