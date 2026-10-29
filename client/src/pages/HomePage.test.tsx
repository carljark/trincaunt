import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach, type Mock } from 'vitest';
import HomePage from './HomePage';

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { _id: 'u1', nombre: 'Carlos' }, token: 'tok', logout: vi.fn() })
}));

const groups = [
  { _id: 'g1', nombre: 'Piso', miembros: [{ _id: 'u1' }, { _id: 'u2' }, { _id: 'u3' }], totalExpenses: 300, userShare: 100 },
  { _id: 'g2', nombre: 'Solo yo', miembros: [{ _id: 'u1' }], totalExpenses: 12.5, userShare: 12.5 }
];

const normalize = (text: string | null | undefined) => text?.replace(/\s/g, ' ');

describe('HomePage', () => {
  let fetchMock: Mock;

  beforeEach(() => {
    fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/groups') && init?.method === 'POST') {
        return { ok: true, json: async () => ({ data: { _id: 'g3' } }) };
      }
      if (url.endsWith('/groups')) return { ok: true, json: async () => ({ data: groups }) };
      if (url.endsWith('/expenses/global')) return { ok: true, json: async () => ({ data: [{ monto: 40 }, { monto: 2.5 }] }) };
      return { ok: true, json: async () => ({ data: [] }) };
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  const renderPage = () => render(<MemoryRouter><HomePage /></MemoryRouter>);

  it('greets the user and shows the global share', async () => {
    renderPage();
    expect(screen.getByText('Hola, Carlos')).toBeInTheDocument();
    await waitFor(() => expect(normalize(screen.getByRole('link', { name: /Todos los grupos/ }).textContent)).toContain('42,50 €'));
  });

  it('lists groups with members, my share and total', async () => {
    renderPage();
    const piso = await screen.findByRole('link', { name: /Piso/ });
    expect(piso).toHaveAttribute('href', '/group/g1');
    expect(normalize(piso.textContent)).toContain('3 miembros');
    expect(normalize(piso.textContent)).toContain('tu parte 100,00 €');
    expect(normalize(piso.textContent)).toContain('300,00 €');
    expect(normalize(screen.getByRole('link', { name: /Solo yo/ }).textContent)).toContain('1 miembro');
  });

  it('creates a group from the inline form instead of a prompt', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Crear grupo' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Nombre del nuevo grupo' }), { target: { value: '  Viaje  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/groups'),
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ nombre: 'Viaje' }) })
    ));
    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Nombre del nuevo grupo' })).not.toBeInTheDocument());
  });

  it('keeps the form open and shows the error when creation fails', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return { ok: false, json: async () => ({ message: 'Nombre no válido' }) };
      return { ok: true, json: async () => ({ data: [] }) };
    });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Crear grupo' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Nombre del nuevo grupo' }), { target: { value: 'X' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear' }));

    expect(await screen.findByText('Nombre no válido')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Nombre del nuevo grupo' })).toBeInTheDocument();
  });

  it('shows an empty state without groups', async () => {
    fetchMock.mockImplementation(async () => ({ ok: true, json: async () => ({ data: [] }) }));
    renderPage();
    expect(await screen.findByText(/Todavía no estás en ningún grupo/)).toBeInTheDocument();
  });
});
