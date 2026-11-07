import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { vi, describe, it, expect, beforeEach, type Mock } from 'vitest';
import ApiTokens from './ApiTokens';

const existing = [
  { _id: 't1', nombre: 'Portátil', prefijo: 'trc_AbCdEf', ultimoUso: '2026-11-05T10:00:00.000Z', createdAt: '2026-11-01T10:00:00.000Z' },
  { _id: 't2', nombre: 'Sobremesa', prefijo: 'trc_ZyXwVu', ultimoUso: null, createdAt: '2026-11-02T10:00:00.000Z' }
];

const reply = (status: number, data?: unknown) =>
  Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(status < 400 ? { data } : { message: data }) });

describe('ApiTokens', () => {
  let fetchMock: Mock;
  let list: typeof existing;

  beforeEach(() => {
    list = [...existing];
    fetchMock = vi.fn((url: string, init: RequestInit = {}) => {
      if (init.method === 'POST') {
        const sent = JSON.parse(String(init.body));
        const created = { _id: 't3', nombre: sent.nombre, admin: sent.admin === true, prefijo: 'trc_NewTok', ultimoUso: null, createdAt: '2026-11-06T10:00:00.000Z' };
        list = [created, ...list];
        return reply(201, { token: 'trc_NewTokenSecret', apiToken: created });
      }
      if (init.method === 'DELETE') {
        list = list.filter(t => !url.endsWith(t._id));
        return reply(204);
      }
      return reply(200, list);
    });
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('lists the tokens with their prefix and last use', async () => {
    render(<ApiTokens token="session" />);
    expect(await screen.findByText('Portátil')).toBeInTheDocument();
    expect(screen.getByText(/trc_AbCdEf… · creado el 1 nov · usado el 5 nov/)).toBeInTheDocument();
    expect(screen.getByText(/sin usar/)).toBeInTheDocument();
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer session');
  });

  it('creates a token and shows it once to copy', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<ApiTokens token="session" />);
    await screen.findByText('Portátil');

    fireEvent.change(screen.getByLabelText('Nombre del token'), { target: { value: ' MCP portátil ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear token' }));

    expect(await screen.findByText('trc_NewTokenSecret')).toBeInTheDocument();
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ nombre: 'MCP portátil' });
    expect(await screen.findByText('MCP portátil')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Copiar' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('trc_NewTokenSecret'));
    expect(await screen.findByRole('button', { name: 'Copiado' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Hecho' }));
    expect(screen.queryByText('trc_NewTokenSecret')).not.toBeInTheDocument();
  });

  it('asks for a name', async () => {
    render(<ApiTokens token="session" />);
    await screen.findByText('Portátil');
    fireEvent.click(screen.getByRole('button', { name: 'Crear token' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Ponle un nombre');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('revokes a token after confirming', async () => {
    render(<ApiTokens token="session" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Borrar el token Portátil' }));
    fireEvent.click(screen.getByRole('button', { name: 'Borrar' }));
    await waitFor(() => expect(screen.queryByText('Portátil')).not.toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith(expect.stringMatching(/\/api-tokens\/t1$/), expect.objectContaining({ method: 'DELETE' }));
  });

  it('lets only administrators create administration tokens', async () => {
    const { unmount } = render(<ApiTokens token="session" />);
    await screen.findByText('Portátil');
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    unmount();

    render(<ApiTokens token="session" isAdmin />);
    await screen.findByText('Portátil');
    fireEvent.change(screen.getByLabelText('Nombre del token'), { target: { value: 'Admin portátil' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /Permite administración/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Crear token' }));

    await screen.findByText('trc_NewTokenSecret');
    expect(JSON.parse(fetchMock.mock.calls.find(c => c[1]?.method === 'POST')[1].body)).toEqual({ nombre: 'Admin portátil', admin: true });
    expect(await screen.findByText('Administración')).toBeInTheDocument();
    expect(screen.getByRole('checkbox')).not.toBeChecked();
  });
});
