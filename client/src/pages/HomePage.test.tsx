import React from 'react';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach, type Mock } from 'vitest';
import HomePage from './HomePage';

// jsdom no tiene layout, así que no se puede simular un arrastre real: capturamos
// el onDragEnd que HomePage pasa a DndContext y lo invocamos a mano.
let triggerDragEnd: ((event: { active: { id: string }; over: { id: string } | null }) => void) | undefined;
vi.mock('@dnd-kit/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@dnd-kit/core')>();
  return {
    ...actual,
    DndContext: ({ onDragEnd, children }: { onDragEnd: typeof triggerDragEnd; children: React.ReactNode }) => {
      triggerDragEnd = onDragEnd;
      return <>{children}</>;
    }
  };
});

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
      if (url.includes('/budget')) return { ok: true, json: async () => ({ data: { disponible: -12.4, ciclo: { diasRestantes: 1 } } }) };
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

  const groupNames = () => within(screen.getByRole('list')).getAllByRole('link').map(link => link.querySelector('.home__group-name')?.textContent);

  it('shows a drag handle per group only when there is more than one', async () => {
    renderPage();
    expect(await screen.findByRole('button', { name: 'Mover Piso' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mover Solo yo' })).toBeInTheDocument();
  });

  it('hides the drag handle with a single group', async () => {
    fetchMock.mockImplementation(async (url: string) => ({
      ok: true,
      json: async () => ({ data: url.endsWith('/groups') ? [groups[0]] : [] })
    }));
    renderPage();
    await screen.findByRole('link', { name: /Piso/ });
    expect(screen.queryByRole('button', { name: /^Mover/ })).not.toBeInTheDocument();
  });

  it('reorders the list and saves the new order', async () => {
    renderPage();
    await screen.findByRole('link', { name: /Solo yo/ });

    act(() => triggerDragEnd?.({ active: { id: 'g2' }, over: { id: 'g1' } }));

    expect(groupNames()).toEqual(['Solo yo', 'Piso']);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/user-preferences/group-order'),
      expect.objectContaining({ method: 'PUT', body: JSON.stringify({ groupOrder: ['g2', 'g1'] }) })
    ));
  });

  it('restores the previous order when saving fails', async () => {
    const baseFetch = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/group-order')) return { ok: false, json: async () => ({}) };
      return baseFetch(url, init);
    });
    renderPage();
    await screen.findByRole('link', { name: /Solo yo/ });

    act(() => triggerDragEnd?.({ active: { id: 'g2' }, over: { id: 'g1' } }));

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo guardar el nuevo orden');
    expect(groupNames()).toEqual(['Piso', 'Solo yo']);
  });

  it('does nothing when the group is dropped in place', async () => {
    renderPage();
    await screen.findByRole('link', { name: /Piso/ });

    act(() => triggerDragEnd?.({ active: { id: 'g1' }, over: { id: 'g1' } }));

    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('/group-order'), expect.anything());
  });

  it('shows what is left instead of the totals for a personal group', async () => {
    const personal = { _id: 'g9', nombre: 'Mis gastos', tipo: 'personal', miembros: [{ _id: 'u1' }], totalExpenses: 500, userShare: 500 };
    const baseFetch = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/groups')) return { ok: true, json: async () => ({ data: [...groups, personal] }) };
      return baseFetch(url, init);
    });
    renderPage();

    const link = await screen.findByRole('link', { name: /Mis gastos/ });
    await waitFor(() => expect(normalize(link.textContent)).toContain('-12,40 €'));
    expect(normalize(link.textContent)).toContain('disponible');
    expect(normalize(link.textContent)).toContain('Quedan 1 día');
    expect(link.querySelector('.home__group-total--negative')).not.toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/groups/g9/budget?offset=0'), expect.anything());
    // Los compartidos no piden presupuesto
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('/groups/g1/budget'), expect.anything());
  });
});
