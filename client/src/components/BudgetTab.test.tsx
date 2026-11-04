import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { vi, describe, it, expect, beforeEach, afterEach, type Mock } from 'vitest';
import BudgetTab from './BudgetTab';
import { budgetApi } from '../utils/budgetApi';
import { IBudgetSummary, IRecurringItem } from '../types/budget';

vi.mock('../utils/budgetApi', () => ({
  budgetApi: {
    getSummary: vi.fn(),
    listRecurringItems: vi.fn(),
    createRecurringItem: vi.fn(),
    updateRecurringItem: vi.fn(),
    deleteRecurringItem: vi.fn(),
    confirmRecurringItem: vi.fn(),
    createIncome: vi.fn(),
    deleteIncome: vi.fn(),
    deleteExpense: vi.fn()
  }
}));

const api = budgetApi as unknown as Record<keyof typeof budgetApi, Mock>;
const normalize = (text: string | null | undefined) => text?.replace(/\s/g, ' ');

const summary = (overrides: Partial<IBudgetSummary> = {}): IBudgetSummary => ({
  ciclo: { inicio: '2026-10-28', fin: '2026-11-28', offset: 0, diasTotales: 31, diasTranscurridos: 8, diasRestantes: 24 },
  configuracion: { diaInicioCiclo: 28, ahorroObjetivo: 200, incluirOtrosGrupos: false },
  ingresos: {
    recibidos: 2050, previstos: 0, total: 2050,
    lineas: [{ recurrente_id: 'nomina', nombre: 'Nómina', fecha: '2026-10-28', importe: 2050, estado: 'recibido', movimiento_id: 'inc-1' }]
  },
  facturas: {
    pagadas: 700, pendientes: 60, total: 760,
    lineas: [
      { recurrente_id: 'alquiler', nombre: 'Alquiler', fecha: '2026-11-01', importe: 700, estado: 'pagada', movimiento_id: 'exp-1' },
      { recurrente_id: 'luz', nombre: 'Luz', fecha: '2026-11-05', importe: 60, estado: 'pendiente' }
    ]
  },
  ahorroObjetivo: 200,
  gastosVariables: 150,
  otrosGrupos: null,
  presupuestoGastable: 1090,
  gastado: 150,
  disponible: 940,
  porDia: 39.17,
  porSemana: 274.17,
  ritmo: { gastoIdeal: 281.29, desviacion: -131.29 },
  ...overrides
});

const items: IRecurringItem[] = [
  { _id: 'nomina', grupo_id: 'g1', tipo: 'ingreso', nombre: 'Nómina', importe: 2000, frecuencia: 'mensual', fechaInicio: '2026-01-28T00:00:00.000Z', categoria: [], activo: true },
  { _id: 'luz', grupo_id: 'g1', tipo: 'factura', nombre: 'Luz', importe: 60, frecuencia: 'mensual', fechaInicio: '2026-01-05T00:00:00.000Z', categoria: ['Hogar'], activo: true }
];

describe('BudgetTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Solo se congela la fecha: las promesas y los timers siguen siendo reales
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-04T10:00:00'));
    api.getSummary.mockResolvedValue(summary());
    api.listRecurringItems.mockResolvedValue(items);
    Object.values(api).forEach(fn => { if (!fn.getMockImplementation()) fn.mockResolvedValue(undefined); });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const renderTab = (props: Partial<React.ComponentProps<typeof BudgetTab>> = {}) =>
    render(<BudgetTab groupId="g1" token="tok" {...props} />);

  it('shows what is left, per week, per day and the pace', async () => {
    renderTab();
    const hero = await screen.findByRole('region', { name: 'Lo que puedes gastar' });
    expect(normalize(hero.textContent)).toContain('Te quedan');
    expect(normalize(hero.textContent)).toContain('940,00 €');
    expect(normalize(hero.textContent)).toContain('274,17 €');
    expect(normalize(hero.textContent)).toContain('39,17 €');
    expect(normalize(hero.textContent)).toContain('24 días');
    expect(screen.getByText(/por debajo de lo previsto/)).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '14');
    expect(screen.getByText('Ciclo actual')).toBeInTheDocument();
    expect(screen.getByText('28 oct – 27 nov')).toBeInTheDocument();
  });

  it('warns when you have gone over', async () => {
    api.getSummary.mockResolvedValue(summary({ disponible: -35.5, porDia: -1.48, porSemana: -10.35, ritmo: { gastoIdeal: 100, desviacion: 80 } }));
    renderTab();
    const hero = await screen.findByRole('region', { name: 'Lo que puedes gastar' });
    expect(normalize(hero.textContent)).toContain('Te has pasado');
    expect(normalize(hero.textContent)).toContain('35,50 €');
    expect(screen.getByText(/por encima de lo previsto/)).toBeInTheDocument();
  });

  it('pays a pending bill with the real amount and refreshes the expenses', async () => {
    const onExpensesChanged = vi.fn();
    renderTab({ onExpensesChanged });
    fireEvent.click(await screen.findByRole('button', { name: 'Pagar Luz' }));

    const dialog = screen.getByRole('dialog', { name: 'Pagar Luz' });
    const amount = within(dialog).getByRole('textbox');
    expect(amount).toHaveValue('60');
    // Vence mañana: se propone hoy
    expect(dialog.querySelector('input[type="date"]')).toHaveValue('2026-11-04');
    fireEvent.change(amount, { target: { value: '71,30' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Marcar pagada' }));

    await waitFor(() => expect(api.confirmRecurringItem).toHaveBeenCalledWith('tok', 'luz', { monto: 71.3, fecha: '2026-11-04' }));
    await waitFor(() => expect(onExpensesChanged).toHaveBeenCalled());
    expect(api.getSummary).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps the dialog open with the error when confirming fails', async () => {
    api.confirmRecurringItem.mockRejectedValue(new Error('El monto debe ser mayor a 0'));
    renderTab();
    fireEvent.click(await screen.findByRole('button', { name: 'Pagar Luz' }));
    fireEvent.click(screen.getByRole('button', { name: 'Marcar pagada' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('El monto debe ser mayor a 0');
    expect(screen.getByRole('dialog', { name: 'Pagar Luz' })).toBeInTheDocument();
  });

  it('undoes a paid bill by deleting its expense', async () => {
    renderTab();
    fireEvent.click(await screen.findByRole('button', { name: 'Deshacer Alquiler' }));
    expect(screen.getByText(/la factura volverá a quedar pendiente/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Deshacer' }));

    await waitFor(() => expect(api.deleteExpense).toHaveBeenCalledWith('tok', 'exp-1'));
  });

  it('deletes a received income', async () => {
    renderTab();
    fireEvent.click(await screen.findByRole('button', { name: 'Deshacer Nómina' }));
    fireEvent.click(screen.getByRole('button', { name: 'Borrar' }));

    await waitFor(() => expect(api.deleteIncome).toHaveBeenCalledWith('tok', 'inc-1'));
  });

  it('adds a one-off income', async () => {
    renderTab();
    fireEvent.click(await screen.findByRole('button', { name: 'Añadir ingreso suelto' }));
    const dialog = screen.getByRole('dialog', { name: 'Añadir ingreso' });
    const [description, amount] = within(dialog).getAllByRole('textbox');
    fireEvent.change(description, { target: { value: 'Paga extra' } });
    fireEvent.change(amount, { target: { value: '300' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Añadir' }));

    await waitFor(() => expect(api.createIncome).toHaveBeenCalledWith('tok', 'g1', { descripcion: 'Paga extra', monto: 300, fecha: '2026-11-04' }));
  });

  it('moves between cycles', async () => {
    renderTab();
    await screen.findByText('Ciclo actual');
    api.getSummary.mockResolvedValue(summary({
      ciclo: { inicio: '2026-09-28', fin: '2026-10-28', offset: -1, diasTotales: 30, diasTranscurridos: 30, diasRestantes: 0 },
      porDia: null, porSemana: null, ritmo: null
    }));
    fireEvent.click(screen.getByRole('button', { name: 'Ciclo anterior' }));

    await waitFor(() => expect(api.getSummary).toHaveBeenLastCalledWith('tok', 'g1', -1));
    expect(await screen.findByText('28 sept – 27 oct')).toBeInTheDocument();
    expect(normalize(screen.getByRole('region', { name: 'Lo que puedes gastar' }).textContent)).toContain('Te sobró');
    expect(screen.queryByText('Al día')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Volver al ciclo actual' }));
    await waitFor(() => expect(api.getSummary).toHaveBeenLastCalledWith('tok', 'g1', 0));
  });

  it('guides you to add your salary when there is nothing yet', async () => {
    api.listRecurringItems.mockResolvedValue([]);
    api.getSummary.mockResolvedValue(summary({
      ingresos: { recibidos: 0, previstos: 0, total: 0, lineas: [] },
      facturas: { pagadas: 0, pendientes: 0, total: 0, lineas: [] }
    }));
    renderTab();
    fireEvent.click(await screen.findByRole('button', { name: 'Añadir nómina' }));

    const dialog = screen.getByRole('dialog', { name: 'Nueva partida fija' });
    expect(within(dialog).getByRole('radio', { name: 'Ingreso' })).toHaveAttribute('aria-checked', 'true');
    const [name, amount] = within(dialog).getAllByRole('textbox');
    fireEvent.change(name, { target: { value: 'Nómina' } });
    fireEvent.change(amount, { target: { value: '2000' } });
    fireEvent.change(dialog.querySelectorAll('input[type="date"]')[0], { target: { value: '2026-10-28' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(api.createRecurringItem).toHaveBeenCalledWith('tok', 'g1', expect.objectContaining({
      tipo: 'ingreso', nombre: 'Nómina', importe: 2000, frecuencia: 'mensual', fechaInicio: '2026-10-28'
    })));
  });

  it('edits and deletes a recurring item', async () => {
    renderTab();
    fireEvent.click(await screen.findByRole('button', { name: 'Editar Luz' }));
    const dialog = screen.getByRole('dialog', { name: 'Editar partida fija' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Borrar' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Sí, borrar' }));

    await waitFor(() => expect(api.deleteRecurringItem).toHaveBeenCalledWith('tok', 'luz'));
  });

  it('shows my share of other groups when enabled', async () => {
    api.getSummary.mockResolvedValue(summary({ otrosGrupos: { total: 30, grupos: [{ _id: 'piso', nombre: 'Piso', total: 30 }] } }));
    renderTab();
    expect(await screen.findByText('Piso')).toBeInTheDocument();
    expect(screen.getAllByText('Tu parte en otros grupos')).toHaveLength(2); // desglose y tarjeta
  });

  it('reloads when the page refreshes its data', async () => {
    const { rerender } = renderTab({ refreshKey: 1 });
    await screen.findByText('Ciclo actual');
    rerender(<BudgetTab groupId="g1" token="tok" refreshKey={2} />);
    await waitFor(() => expect(api.getSummary).toHaveBeenCalledTimes(2));
  });

  it('shows the error with a retry button when it cannot load', async () => {
    api.getSummary.mockRejectedValueOnce(new Error('El presupuesto solo está disponible en grupos personales'));
    renderTab();
    expect(await screen.findByRole('alert')).toHaveTextContent('solo está disponible en grupos personales');
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Ciclo actual')).toBeInTheDocument();
  });
});
