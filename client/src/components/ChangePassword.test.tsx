import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { vi, describe, it, expect, beforeEach, type Mock } from 'vitest';
import ChangePassword from './ChangePassword';

const fill = (actual: string, nueva: string, repetida = nueva) => {
  fireEvent.change(screen.getByLabelText('Contraseña actual'), { target: { value: actual } });
  fireEvent.change(screen.getByLabelText('Contraseña nueva'), { target: { value: nueva } });
  fireEvent.change(screen.getByLabelText('Repite la nueva'), { target: { value: repetida } });
  fireEvent.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));
};

describe('ChangePassword', () => {
  let fetchMock: Mock;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204, json: () => Promise.resolve({}) });
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('changes the password', async () => {
    render(<ChangePassword token="session" />);
    fill('vieja', 'nueva-segura');
    expect(await screen.findByRole('status')).toHaveTextContent('Contraseña cambiada');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/users\/me\/password$/);
    expect(init).toMatchObject({ method: 'PUT', headers: { Authorization: 'Bearer session' } });
    expect(JSON.parse(init.body)).toEqual({ actual: 'vieja', nueva: 'nueva-segura' });
    expect(screen.getByLabelText('Contraseña nueva')).toHaveValue('');
  });

  it('checks length and repetition before calling the API', () => {
    render(<ChangePassword token="session" />);
    fill('vieja', 'corta');
    expect(screen.getByRole('alert')).toHaveTextContent('al menos 8');
    fill('vieja', 'nueva-segura', 'otra-distinta');
    expect(screen.getByRole('alert')).toHaveTextContent('no coinciden');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows the API error', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 400, json: () => Promise.resolve({ message: 'La contraseña actual no es correcta' }) });
    render(<ChangePassword token="session" />);
    fill('mal', 'nueva-segura');
    expect(await screen.findByRole('alert')).toHaveTextContent('La contraseña actual no es correcta');
  });
});
