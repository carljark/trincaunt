import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { vi, describe, it, expect, beforeEach, type Mock } from 'vitest';
import GroupNotes from './GroupNotes';

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ token: 'tok', user: { _id: 'u1', nombre: 'Carlos' } })
}));

const carlos = { _id: 'u1', nombre: 'Carlos' };
const ana = { _id: 'u2', nombre: 'Ana' };
const luis = { _id: 'u3', nombre: 'Luis' };
const members = [carlos, ana, luis] as never[];

const note = (overrides: object) => ({
  _id: 'n1', grupo_id: 'g1', titulo: 'Wifi', contenido: 'Clave: 1234',
  lectores: [carlos], editores: [], creado_por: carlos,
  fecha_creacion: '2026-10-01T10:00:00Z', fecha_actualizacion: '2026-10-12T10:00:00Z',
  ...overrides
});

describe('GroupNotes', () => {
  let fetchMock: Mock;
  let notes: object[];

  beforeEach(() => {
    notes = [];
    fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method) return { ok: true, json: async () => ({ data: {} }) };
      return { ok: true, json: async () => ({ data: notes }) };
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  it('shows an empty state with a shortcut to write the first note', async () => {
    render(<GroupNotes groupId="g1" members={members} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Escribir la primera' }));
    expect(screen.getByRole('textbox', { name: 'Contenido' })).toBeInTheDocument();
  });

  it('describes who can see and edit each note', async () => {
    notes = [
      note({}),
      note({ _id: 'n2', titulo: '', lectores: [ana, carlos], editores: [carlos], creado_por: ana }),
      note({ _id: 'n3', titulo: 'Compra', lectores: [carlos, ana, luis], editores: [ana] })
    ];
    render(<GroupNotes groupId="g1" members={members} />);
    expect(await screen.findByText('Privada: solo la ves tú')).toBeInTheDocument();
    expect(screen.getByText('Compartida contigo · puedes editarla tú')).toBeInTheDocument();
    expect(screen.getByText('Compartida con Ana y Luis · puede editarla Ana')).toBeInTheDocument();
    expect(screen.getByText('Sin título')).toBeInTheDocument();
  });

  it('creates a note with readers chosen from toggle buttons, without offering the creator', async () => {
    render(<GroupNotes groupId="g1" members={members} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Nueva nota' }));

    const readers = screen.getByRole('group', { name: 'Quién puede verla' });
    expect(readers).not.toHaveTextContent('Carlos');
    fireEvent.click(screen.getAllByRole('button', { name: /Ana/ })[0]);
    fireEvent.change(screen.getByRole('textbox', { name: 'Título' }), { target: { value: 'Wifi' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Contenido' }), { target: { value: 'Clave: 1234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/groups/g1/notes'),
      expect.objectContaining({ method: 'POST' })
    ));
    const body = JSON.parse((fetchMock.mock.calls.find(c => c[1]?.method === 'POST')![1] as RequestInit).body as string);
    expect(body).toMatchObject({ titulo: 'Wifi', contenido: 'Clave: 1234', lectores: ['u2'], editores: [] });
    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Contenido' })).not.toBeInTheDocument());
  });

  it('only shows edit and delete to the creator and editors', async () => {
    notes = [
      note({ _id: 'n1', titulo: 'Mía' }),
      note({ _id: 'n2', titulo: 'De Ana', lectores: [ana, carlos], creado_por: ana })
    ];
    render(<GroupNotes groupId="g1" members={members} />);
    expect(await screen.findByRole('button', { name: 'Editar Mía' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar De Ana' })).not.toBeInTheDocument();
  });

  it('keeps the form and shows the error when saving fails', async () => {
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.method) return { ok: false, json: async () => ({ message: 'Sin permiso' }) };
      return { ok: true, json: async () => ({ data: [] }) };
    });
    render(<GroupNotes groupId="g1" members={members} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Nueva nota' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Contenido' }), { target: { value: 'Hola' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Sin permiso');
    expect(screen.getByRole('textbox', { name: 'Contenido' })).toHaveValue('Hola');
  });
});
