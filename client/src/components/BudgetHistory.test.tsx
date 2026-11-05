import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { vi, describe, it, expect, beforeEach, type Mock } from 'vitest';
import { Chart } from 'react-chartjs-2';
import BudgetHistory from './BudgetHistory';
import { budgetApi } from '../utils/budgetApi';
import { IBudgetHistory, ICycleHistoryEntry } from '../types/budget';

vi.mock('react-chartjs-2', () => ({ Chart: vi.fn(() => null) }));
vi.mock('../utils/budgetApi', () => ({ budgetApi: { getHistory: vi.fn() } }));

const getHistory = budgetApi.getHistory as Mock;
const normalize = (text: string | null | undefined) => text?.replace(/\s/g, ' ');

const cycle = (inicio: string, fin: string, values: Partial<ICycleHistoryEntry>): ICycleHistoryEntry => ({
  inicio, fin, offset: 0, enCurso: false, ingresos: 0, facturas: 0, gastosVariables: 0, otrosGrupos: 0, gastado: 0, sobrante: 0, ...values
});

const history = (overrides: Partial<IBudgetHistory> = {}): IBudgetHistory => ({
  ahorroObjetivo: 200,
  ciclos: [
    cycle('2026-08-28', '2026-09-28', { offset: -2, ingresos: 2000, facturas: 760, gastosVariables: 1000, gastado: 1760, sobrante: 240 }),
    cycle('2026-09-28', '2026-10-28', { offset: -1, ingresos: 2000, facturas: 760, gastosVariables: 1300, otrosGrupos: 40, gastado: 2100, sobrante: -100 }),
    cycle('2026-10-28', '2026-11-28', { enCurso: true, ingresos: 2050, facturas: 700, gastosVariables: 150, gastado: 850, sobrante: 1200 })
  ],
  mediaSobrante: 70,
  ...overrides
});

describe('BudgetHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getHistory.mockResolvedValue(history());
  });

  it('shows the average left over and a row per cycle, newest first', async () => {
    render(<BudgetHistory groupId="g1" token="tok" />);
    const summary = await screen.findByText('De media te sobran');
    expect(normalize(summary.parentElement?.textContent)).toContain('70,00 €');
    expect(normalize(summary.parentElement?.textContent)).toContain('tu objetivo de ahorro es 200,00 €');
    expect(getHistory).toHaveBeenCalledWith('tok', 'g1', 6);

    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
    expect(rows.map(r => normalize(r.textContent))).toEqual([
      '28 octen curso2050,00 €850,00 €1200,00 €',
      '28 sept2000,00 €2100,00 €−100,00 €',
      '28 ago2000,00 €1760,00 €240,00 €'
    ]);
  });

  it('charts bills and daily spending stacked against income', async () => {
    render(<BudgetHistory groupId="g1" token="tok" />);
    await screen.findByRole('table');
    const { data } = (Chart as unknown as Mock).mock.calls.at(-1)![0];
    expect(data.labels).toEqual(['28 ago', '28 sept', '28 oct']);
    expect(data.datasets.map((d: { label: string; data: number[] }) => [d.label, d.data])).toEqual([
      ['Ingresos', [2000, 2000, 2050]],
      ['Facturas', [760, 760, 700]],
      ['Día a día', [1000, 1340, 150]] // incluye la parte de otros grupos
    ]);
  });

  it('switches to 12 cycles', async () => {
    render(<BudgetHistory groupId="g1" token="tok" />);
    await screen.findByRole('table');
    fireEvent.click(screen.getByRole('button', { name: '12 ciclos' }));
    await waitFor(() => expect(getHistory).toHaveBeenLastCalledWith('tok', 'g1', 12));
    expect(screen.getByRole('button', { name: '12 ciclos' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('explains what comes when there is only the current cycle', async () => {
    getHistory.mockResolvedValue(history({ ciclos: [history().ciclos[2]], mediaSobrante: null }));
    render(<BudgetHistory groupId="g1" token="tok" />);
    expect(await screen.findByText(/Cuando termine tu primer ciclo/)).toBeInTheDocument();
    expect(Chart).not.toHaveBeenCalled();
  });

  it('shows a negative average and errors', async () => {
    getHistory.mockResolvedValueOnce(history({ mediaSobrante: -50 }));
    render(<BudgetHistory groupId="g1" token="tok" />);
    expect(await screen.findByText('De media te pasas')).toBeInTheDocument();

    getHistory.mockRejectedValueOnce(new Error('Sin conexión'));
    fireEvent.click(screen.getByRole('button', { name: '12 ciclos' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Sin conexión');
  });
});
