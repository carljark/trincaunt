import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import './LoginPage.scss'; // Import the new SCSS file
import { Link } from 'react-router-dom';

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
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="login-page">
      <h2>Registro</h2>
      <form onSubmit={handleSubmit} className="login-form">
        <input
          type="text"
          name="nombre"
          placeholder="Nombre"
          value={formData.nombre}
          onChange={handleChange}
          required
        />
        <input
          type="email"
          name="email"
          placeholder="Email"
          value={formData.email}
          onChange={handleChange}
          required
        />
        <input
          type="password"
          name="password"
          placeholder="Password"
          value={formData.password}
          onChange={handleChange}
          required
        />
        <button type="submit">Registrarse</button>
      </form>
      {error && <p className="error-message">{error}</p>}
      <p>
        ¿Ya tienes cuenta? <Link to="/login" className="register-link">Inicia sesión</Link>
      </p>
    </div>
  );
};

export default RegisterPage;
