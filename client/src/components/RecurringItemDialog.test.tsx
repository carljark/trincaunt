import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import RecurringItemDialog from './RecurringItemDialog';
import { IRecurringItem } from '../types/budget';
import { RecurringItemInput } from '../utils/budgetApi';

const prestamo: IRecurringItem = {
  _id: 'p1', grupo_id: 'g1', tipo: 'factura', nombre: 'Préstamo 9,90 %', importe: 92.37, frecuencia: 'mensual',
  fechaInicio: '2026-11-01T00:00:00.000Z', fechaFin: '2027-11-01T00:00:00.000Z', categoria: [], activo: true,
  pagosEspeciales: [
    { tipo: 'extra', desde: '2027-08-01T00:00:00.000Z', hasta: '2027-08-01T00:00:00.000Z', importe: 466.89, aviso: 'Pide la amortización', avisoDiasAntes: 5 }
  ]
};

describe('RecurringItemDialog special payments', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ data: [] }) })) as unknown as typeof fetch;
  });

  const save = () => fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

  it('shows the stored special payments and saves them with a new one', async () => {
    const onSave = vi.fn<[RecurringItemInput], Promise<void>>(async () => {});
    render(<RecurringItemDialog token="tok" item={prestamo} onSave={onSave} onClose={vi.fn()} />);

    expect(screen.getByRole('checkbox', { name: /Pagos especiales/ })).toBeChecked();
    const first = screen.getByRole('group', { name: /Pago especial/ });
    expect(within(first).getByRole('radio', { name: 'Pago extra' })).toHaveAttribute('aria-checked', 'true');
    expect(within(first).getByDisplayValue('466.89')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Añadir pago especial/ }));
    const second = screen.getAllByRole('group', { name: /Pago especial/ })[1];
    fireEvent.change(within(second).getByLabelText(/^Hasta/), { target: { value: '2027-10-01' } });
    fireEvent.change(within(second).getByLabelText(/^Extra en cada una/), { target: { value: '630' } });
    save();

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0]).toMatchObject({
      pagosEspeciales: [
        { tipo: 'extra', desde: '2027-08-01', hasta: '2027-08-01', importe: 466.89, aviso: 'Pide la amortización', avisoDiasAntes: 5 },
        { tipo: 'extra', desde: '2027-08-01', hasta: '2027-10-01', importe: 630 }
      ]
    });
  });

  it('removes them all when the switch is turned off', async () => {
    const onSave = vi.fn<[RecurringItemInput], Promise<void>>(async () => {});
    render(<RecurringItemDialog token="tok" item={prestamo} onSave={onSave} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('checkbox', { name: /Pagos especiales/ }));
    save();
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0]).toMatchObject({ pagosEspeciales: null });
  });

  it('does not save a special payment without amount', () => {
    const onSave = vi.fn<[RecurringItemInput], Promise<void>>(async () => {});
    render(<RecurringItemDialog token="tok" onSave={onSave} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Visa' } });
    fireEvent.change(screen.getByLabelText(/^Importe/), { target: { value: '43' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /Pagos especiales/ }));
    save();
    expect(screen.getByRole('alert')).toHaveTextContent('el importe debe ser mayor que 0');
    expect(onSave).not.toHaveBeenCalled();
  });
});
