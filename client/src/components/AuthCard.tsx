import React from 'react';
import './AuthCard.scss';

interface AuthCardProps {
  title: string;
  onSubmit?: (e: React.FormEvent) => void;
  children: React.ReactNode;
  // Enlaces bajo la tarjeta (registrarse, volver a entrar...)
  footer?: React.ReactNode;
}

// Pantallas sin sesión (entrar, registrarse, recuperar la contraseña): título, formulario y enlaces.
// Los campos usan los elementos del bloque: auth-card__input, __button, __message, __link.
const AuthCard: React.FC<AuthCardProps> = ({ title, onSubmit, children, footer }) => (
  <div className="auth-card">
    <h2 className="auth-card__title">{title}</h2>
    <form className="auth-card__form" onSubmit={onSubmit ?? (e => e.preventDefault())}>
      {children}
    </form>
    {footer && <div className="auth-card__footer">{footer}</div>}
  </div>
);

export default AuthCard;
