import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { vi, describe, it, expect, beforeEach, type Mock } from 'vitest';
import AddExpenseModal from './AddExpenseModal';

const members = [{ _id: 'u1', nombre: 'Ana' }, { _id: 'u2', nombre: 'Luis' }];

describe('AddExpenseModal', () => {
  let fetchMock: Mock;

  beforeEach(() => {
    fetchMock = vi.fn(async (_url: string, init?: RequestInit) => ({
      ok: true,
      json: async () => ({ data: init?.method === 'POST' ? { _id: 'e1' } : [] })
    }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  it('renders inside the shared dialog and closes from Cancelar', () => {
    const onClose = vi.fn();
    render(<AddExpenseModal groupId="g1" token="tok" members={members} paidByInitial="" onClose={onClose} onExpenseAction={vi.fn()} />);
    expect(screen.getByRole('dialog', { name: 'Añadir gasto' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('submits from the footer button', async () => {
    render(<AddExpenseModal groupId="g1" token="tok" members={members} paidByInitial="" onClose={vi.fn()} onExpenseAction={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Descripción'), { target: { value: 'Cena' } });
    fireEvent.change(screen.getByLabelText('Importe'), { target: { value: '30' } });
    fireEvent.click(screen.getAllByRole('button', { name: /Ana/ })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Añadir gasto' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/expenses'), expect.objectContaining({ method: 'POST' })));
  });
});
