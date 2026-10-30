import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import BulkEditForm from './BulkEditForm';

const members = [{ _id: 'u1', nombre: 'Ana' }, { _id: 'u2', nombre: 'Luis' }] as never[];

describe('BulkEditForm', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn(async (url: string) => ({
      ok: true,
      json: async () => ({
        data: String(url).endsWith('/groups')
          ? [{ _id: 'g1', nombre: 'Este' }, { _id: 'g2', nombre: 'Viaje' }]
          : [{ category: 'comida', count: 3 }]
      })
    })) as unknown as typeof fetch;
  });

  const renderForm = (expenseCount = 14) => {
    const onBulkUpdate = vi.fn();
    render(<BulkEditForm members={members} expenseCount={expenseCount} onBulkUpdate={onBulkUpdate} token="tok" groupId="g1" />);
    return onBulkUpdate;
  };

  it('says how many expenses will change and waits for a change', () => {
    renderForm();
    expect(screen.getByRole('heading', { name: 'Editar 14 gastos a la vez' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rellena lo que quieras cambiar' })).toBeDisabled();
  });

  it('sends only the fields that were filled in', async () => {
    const onBulkUpdate = renderForm();
    fireEvent.click(screen.getAllByRole('button', { name: /Luis/ })[0]);
    fireEvent.change(screen.getByRole('combobox', { name: '¿El pagador invita?' }), { target: { value: 'false' } });
    const category = screen.getByLabelText('Categorías');
    fireEvent.change(category, { target: { value: 'ocio' } });
    fireEvent.keyDown(category, { key: 'Enter' });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar a 14 gastos' }));

    expect(onBulkUpdate).toHaveBeenCalledWith({ categoria: ['ocio'], pagado_por: ['u2'], asume_gasto: false });
  });

  it('offers the other groups to move the expenses to', async () => {
    const onBulkUpdate = renderForm(1);
    const select = screen.getByRole('combobox', { name: 'Mover al grupo' });
    await screen.findByRole('option', { name: 'Viaje' });
    expect(screen.queryByRole('option', { name: 'Este' })).not.toBeInTheDocument();
    fireEvent.change(select, { target: { value: 'g2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar a 1 gasto' }));
    await waitFor(() => expect(onBulkUpdate).toHaveBeenCalledWith({ grupo_id: 'g2' }));
  });

  it('cannot apply when the filters leave no expenses', () => {
    renderForm(0);
    fireEvent.change(screen.getByRole('textbox', { name: 'Lugar' }), { target: { value: 'Mahón' } });
    expect(screen.getByRole('button', { name: 'Aplicar a 0 gastos' })).toBeDisabled();
  });
});
