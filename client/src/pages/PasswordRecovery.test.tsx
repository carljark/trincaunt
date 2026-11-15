import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach, type Mock } from 'vitest';
import ForgotPasswordPage from './ForgotPasswordPage';
import ResetPasswordPage from './ResetPasswordPage';

const at = (path: string, page: React.ReactElement) => render(<MemoryRouter initialEntries={[path]}>{page}</MemoryRouter>);

describe('password recovery', () => {
  let fetchMock: Mock;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ status: 'success' }) });
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  describe('ForgotPasswordPage', () => {
    it('asks for the link and says it was sent', async () => {
      at('/forgot-password', <ForgotPasswordPage />);
      fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ana@example.com' } });
      fireEvent.click(screen.getByRole('button', { name: 'Enviar enlace' }));
      expect(await screen.findByRole('status')).toHaveTextContent('te hemos enviado un enlace');
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toMatch(/\/users\/forgot-password$/);
      expect(JSON.parse(init.body)).toEqual({ email: 'ana@example.com' });
    });

    it('shows the rate limit error', async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 429, json: () => Promise.resolve({ message: 'Demasiados intentos. Prueba de nuevo en 60 minutos' }) });
      at('/forgot-password', <ForgotPasswordPage />);
      fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ana@example.com' } });
      fireEvent.click(screen.getByRole('button', { name: 'Enviar enlace' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('Demasiados intentos');
    });
  });

  describe('ResetPasswordPage', () => {
    const fill = (password: string, repeated = password) => {
      fireEvent.change(screen.getByLabelText('Contraseña nueva'), { target: { value: password } });
      fireEvent.change(screen.getByLabelText('Repite la contraseña'), { target: { value: repeated } });
      fireEvent.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));
    };

    it('sends the token from the link with the new password', async () => {
      fetchMock.mockResolvedValue({ ok: true, status: 204, json: () => Promise.resolve({}) });
      at('/reset-password?token=abc123', <ResetPasswordPage />);
      fill('nueva-segura');
      expect(await screen.findByRole('status')).toHaveTextContent('Contraseña cambiada');
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toMatch(/\/users\/reset-password$/);
      expect(JSON.parse(init.body)).toEqual({ token: 'abc123', password: 'nueva-segura' });
      expect(screen.getByRole('link', { name: 'Entrar' })).toHaveAttribute('href', '/login');
    });

    it('checks length and repetition before calling the API', () => {
      at('/reset-password?token=abc123', <ResetPasswordPage />);
      fill('corta');
      expect(screen.getByRole('alert')).toHaveTextContent('al menos 8');
      fill('nueva-segura', 'otra-distinta');
      expect(screen.getByRole('alert')).toHaveTextContent('no coinciden');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('shows an expired link from the API and offers a new one', async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 400, json: () => Promise.resolve({ message: 'El enlace no es válido o ha caducado' }) });
      at('/reset-password?token=viejo', <ResetPasswordPage />);
      fill('nueva-segura');
      expect(await screen.findByRole('alert')).toHaveTextContent('ha caducado');
      expect(screen.getByRole('link', { name: 'Pedir otro enlace' })).toHaveAttribute('href', '/forgot-password');
    });

    it('without a token there is no form', () => {
      at('/reset-password', <ResetPasswordPage />);
      expect(screen.getByRole('alert')).toHaveTextContent('no es válido');
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });
  });
});
