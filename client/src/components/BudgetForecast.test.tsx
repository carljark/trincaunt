import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { vi, describe, it, expect, beforeEach, type Mock } from 'vitest';
import BudgetForecast from './BudgetForecast';
import { budgetApi } from '../utils/budgetApi';
import { IBudgetForecast, ICycleForecastEntry } from '../types/budget';

vi.mock('../utils/budgetApi', () => ({ budgetApi: { getForecast: vi.fn() } }));

const getForecast = budgetApi.getForecast as Mock;
const normalize = (text: string | null | undefined) => text?.replace(/\s/g, ' ');

const cycle = (inicio: string, fin: string, values: Partial<ICycleForecastEntry>): ICycleForecastEntry => ({
  inicio, fin, offset: 0, enCurso: false, ingresos: 2000, facturas: 0, reservas: 0, presupuestoGastable: 0, gastado: 0, disponible: 0, temporales: [], ...values
});

const iva = { recurrente_id: 'iva', nombre: 'Aplazamiento IVA', importe: 86, estado: 'pendiente' as const };

const forecast = (overrides: Partial<IBudgetForecast> = {}): IBudgetForecast => ({
  ahorroObjetivo: 150,
  ciclos: [
    cycle('2026-10-28', '2026-11-28', { enCurso: true, facturas: 1560.93, disponible: 120.5 }),
    cycle('2026-11-28', '2026-12-28', { offset: 1, facturas: 1646.93, disponible: 203.07, temporales: [{ ...iva, fecha: '2026-12-20', ultima: false }] }),
    cycle('2026-12-28', '2027-01-28', { offset: 2, facturas: 1596.93, disponible: 253.07, temporales: [{ ...iva, fecha: '2027-01-20', ultima: true }] })
  ],
  ...overrides
});

describe('BudgetForecast', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getForecast.mockResolvedValue(forecast());
  });

  it('shows what is left in each cycle and the tightest one', async () => {
    render(<BudgetForecast groupId="g1" token="tok" />);
    const summary = await screen.findByText(/El ciclo más justo empieza el 28 nov/);
    expect(normalize(summary.parentElement?.textContent)).toContain('203,07 €');
    expect(getForecast).toHaveBeenCalledWith('tok', 'g1', 13);

    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
    expect(rows.map(r => normalize(r.textContent))).toEqual([
      '28 octen curso2000,00 €1560,93 €120,50 €',
      '28 nov2000,00 €1646,93 €203,07 €',
      'Aplazamiento IVA86,00 €',
      '28 dic2000,00 €1596,93 €253,07 €',
      'Aplazamiento IVA86,00 €última'
    ]);
    expect(screen.getByRole('table')).toHaveTextContent('apartando 150,00 € de ahorro');
  });

  it('flags a cycle that goes negative', async () => {
    getForecast.mockResolvedValue(forecast({
      ciclos: [cycle('2026-11-28', '2026-12-28', { offset: 1, disponible: -40 })]
    }));
    render(<BudgetForecast groupId="g1" token="tok" />);
    const summary = await screen.findByText(/El ciclo más justo/);
    expect(normalize(summary.parentElement?.textContent)).toContain('−40,00 €');
  });

  it('switches between 6 months, one year and two years and shows errors', async () => {
    render(<BudgetForecast groupId="g1" token="tok" />);
    await screen.findByRole('table');
    expect(screen.getByRole('button', { name: '1 año' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: '6 meses' }));
    await waitFor(() => expect(getForecast).toHaveBeenLastCalledWith('tok', 'g1', 6));
    fireEvent.click(screen.getByRole('button', { name: '2 años' }));
    await waitFor(() => expect(getForecast).toHaveBeenLastCalledWith('tok', 'g1', 25));

    getForecast.mockRejectedValueOnce(new Error('Sin conexión'));
    fireEvent.click(screen.getByRole('button', { name: '1 año' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Sin conexión');
  });
});
