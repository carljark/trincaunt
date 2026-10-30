import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach, type Mock } from 'vitest';
import PreferencesPage from './PreferencesPage';

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { _id: 'u1', nombre: 'Carlos', email: 'c@example.com' }, token: 'tok', logout: vi.fn() })
}));
vi.mock('../components/PushToggle', () => ({ default: () => <div>PushToggle</div> }));

const aliases = [
  { _id: 'a1', alias: 'cervezas', mainCategories: ['bebidas'] },
  { _id: 'a2', alias: 'vinos', mainCategories: ['bebidas'] },
  { _id: 'a3', alias: 'taxi', mainCategories: ['transporte'] }
];

describe('PreferencesPage', () => {
  let fetchMock: Mock;

  beforeEach(() => {
    fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method) return { ok: true, status: 201, json: async () => ({ data: {} }) };
      if (url.endsWith('/groups')) return { ok: true, json: async () => ({ data: [{ _id: 'g1', nombre: 'Piso' }] }) };
      if (url.includes('/category-aliases')) return { ok: true, json: async () => ({ data: aliases }) };
      return { ok: true, json: async () => ({ data: [] }) };
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  const renderPage = async () => {
    render(<MemoryRouter><PreferencesPage /></MemoryRouter>);
    const select = screen.getByRole('combobox', { name: 'Grupo' });
    await screen.findByRole('option', { name: 'Piso' });
    fireEvent.change(select, { target: { value: 'g1' } });
  };

  it('shows the notifications section and a way back home', () => {
    render(<MemoryRouter><PreferencesPage /></MemoryRouter>);
    expect(screen.getByRole('heading', { name: 'Notificaciones' })).toBeInTheDocument();
    expect(screen.getByText('PushToggle')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Volver al inicio' })).toHaveAttribute('href', '/');
    expect(screen.queryByRole('button', { name: 'Crear alias' })).not.toBeInTheDocument();
  });

  it('lists the group aliases under their main category', async () => {
    await renderPage();
    const drinks = (await screen.findByRole('heading', { name: 'bebidas' })).parentElement!;
    expect(within(drinks).getByText('cervezas')).toBeInTheDocument();
    expect(within(drinks).getByText('vinos')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'transporte' })).toBeInTheDocument();
  });

  it('creates an alias with its main categories', async () => {
    await renderPage();
    fireEvent.change(screen.getByLabelText('Alias (categoría concreta)'), { target: { value: 'cafés' } });
    const main = screen.getByLabelText('Categorías principales');
    fireEvent.change(main, { target: { value: 'bebidas' } });
    fireEvent.keyDown(main, { key: 'Enter' });
    expect(screen.getByRole('button', { name: 'Quitar bebidas' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Crear alias' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/category-aliases'),
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ alias: 'cafés', mainCategories: ['bebidas'], grupo_id: 'g1' }) })
    ));
  });

  it('asks for a main category before saving', async () => {
    await renderPage();
    fireEvent.change(screen.getByLabelText('Alias (categoría concreta)'), { target: { value: 'cafés' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear alias' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Indica el alias y al menos una categoría principal.');
  });

  it('loads an alias into the form from its pencil button', async () => {
    await renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Editar taxi' }));
    expect(screen.getByLabelText('Alias (categoría concreta)')).toHaveValue('taxi');
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeInTheDocument();
  });
});
