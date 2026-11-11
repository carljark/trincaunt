import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { vi, describe, it, expect, beforeEach, afterEach, type Mock } from 'vitest';
import BudgetTab from './BudgetTab';
import { budgetApi } from '../utils/budgetApi';
import { IBudgetSummary, IRecurringItem } from '../types/budget';

// El histórico tiene sus propios tests
vi.mock('./BudgetHistory', () => ({ default: () => null }));
vi.mock('./BudgetForecast', () => ({ default: () => null }));
vi.mock('./BudgetScenario', () => ({ default: () => null }));

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
    deleteExpense: vi.fn(),
    getReminders: vi.fn(),
    markReminderDone: vi.fn()
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
    pagadas: 700, pendientes: 60, total: 760, deHucha: 0,
    lineas: [
      { recurrente_id: 'alquiler', nombre: 'Alquiler', fecha: '2026-11-01', importe: 700, estado: 'pagada', movimiento_id: 'exp-1' },
      { recurrente_id: 'luz', nombre: 'Luz', fecha: '2026-11-05', importe: 60, estado: 'pendiente' }
    ]
  },
  reservas: { total: 0, lineas: [] },
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
      facturas: { pagadas: 0, pendientes: 0, total: 0, deHucha: 0, lineas: [] }
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

  it('shows the sinking funds and the part of a bill they pay', async () => {
    api.getSummary.mockResolvedValue(summary({
      facturas: {
        pagadas: 0, pendientes: 0, total: 0, deHucha: 600,
        lineas: [{ recurrente_id: 'iva', nombre: 'IVA', fecha: '2026-11-20', importe: 600, estado: 'pendiente', deHucha: 600 }]
      },
      reservas: {
        total: 250,
        lineas: [
          { recurrente_id: 'iva', nombre: 'IVA', cuota: 200, saldo: 0, proximoPago: { fecha: '2026-11-20', importe: 600, cubierto: 600 } },
          { recurrente_id: 'seguro', nombre: 'Seguro', cuota: 50, saldo: 150, proximoPago: { fecha: '2027-03-15', importe: 300, cubierto: 150 } }
        ]
      }
    }));
    renderTab();

    expect(normalize((await screen.findByText(/de la hucha/)).textContent)).toBe('20 nov · Pendiente · 600,00 € de la hucha');
    expect(screen.getByText('Apartado en huchas').nextElementSibling).toHaveTextContent('−250,00 €');
    expect(screen.getByText(/, sin lo que paga la hucha/)).toBeInTheDocument();

    const bars = screen.getAllByRole('progressbar', { name: /^Apartado para / });
    expect(bars.map(b => b.getAttribute('aria-valuenow'))).toEqual(['100', '50']);
    expect(normalize(screen.getByText(/150,00 € de 300,00 €/).textContent)).toBe('150,00 € de 300,00 € para el 15 mar');
    expect(normalize(screen.getByText(/Apartas 50/).textContent)).toBe('Apartas 50,00 €');
  });

  it('offers a sinking fund for bills that are not monthly', async () => {
    renderTab();
    fireEvent.click(await screen.findByRole('button', { name: 'Editar Luz' }));
    const dialog = screen.getByRole('dialog', { name: 'Editar partida fija' });
    expect(within(dialog).queryByRole('checkbox', { name: /hucha/ })).not.toBeInTheDocument();

    fireEvent.change(within(dialog).getByRole('combobox'), { target: { value: 'trimestral' } });
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /hucha/ }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(api.updateRecurringItem).toHaveBeenCalledWith('tok', 'luz', expect.objectContaining({
      frecuencia: 'trimestral', prorratear: true
    })));
  });

  it('lets the sinking fund start on a later date and says so in the list', async () => {
    const seguro: IRecurringItem = {
      _id: 'seguro', grupo_id: 'g1', tipo: 'factura', nombre: 'Seguro', importe: 300, frecuencia: 'anual',
      fechaInicio: '2027-03-15T00:00:00.000Z', categoria: [], activo: true, prorratear: true, prorrateoDesde: '2027-02-01T00:00:00.000Z'
    };
    api.listRecurringItems.mockResolvedValue([...items, seguro]);
    renderTab();
    expect(normalize((await screen.findByText(/hucha desde/)).textContent)).toBe('Cada año · día 15 · hucha desde el 1 feb');

    fireEvent.click(screen.getByRole('button', { name: 'Editar Luz' }));
    const dialog = screen.getByRole('dialog', { name: 'Editar partida fija' });
    fireEvent.change(within(dialog).getByRole('combobox'), { target: { value: 'anual' } });
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /hucha/ }));
    const desde = within(dialog).getByLabelText('Empezar a apartar desde');
    expect(desde).toHaveAttribute('min', '2026-11-04'); // no deja elegir un día pasado
    fireEvent.change(desde, { target: { value: '2027-02-01' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(api.updateRecurringItem).toHaveBeenCalledWith('tok', 'luz', expect.objectContaining({
      prorratear: true, prorrateoDesde: '2027-02-01'
    })));
  });

  it('lists what to do at the bank and lets each one be marked as done', async () => {
    api.getReminders.mockResolvedValue([
      { clave: 'hucha:2026-10-28', tipo: 'hucha', titulo: 'Pasa 127,04 € a la hucha del banco', detalle: 'IVA 73,71 € · Basura 53,33 €', fecha: '2026-10-28', importe: 127.04 },
      { clave: 'partida:extra:2026-12-01', tipo: 'partida', titulo: 'Pide la amortización anticipada', detalle: 'Extra préstamo · 630,00 € · 1 dic', fecha: '2026-12-01', importe: 630, recurrente_id: 'extra' }
    ]);
    renderTab();
    const card = await screen.findByRole('region', { name: 'Por hacer en el banco' });
    expect(within(card).getByText('Pasa 127,04 € a la hucha del banco')).toBeInTheDocument();
    expect(within(card).getByText('Extra préstamo · 630,00 € · 1 dic')).toBeInTheDocument();

    fireEvent.click(within(card).getByRole('button', { name: 'Hecho: Pide la amortización anticipada' }));
    expect(api.markReminderDone).toHaveBeenCalledWith('tok', 'g1', 'partida:extra:2026-12-01');
    expect(within(card).queryByText('Pide la amortización anticipada')).not.toBeInTheDocument();
  });

  it('saves a reminder for a bill paid by hand', async () => {
    renderTab();
    fireEvent.click(await screen.findByRole('button', { name: 'Editar Luz' }));
    const dialog = screen.getByRole('dialog', { name: 'Editar partida fija' });
    fireEvent.change(within(dialog).getByLabelText('Recordatorio (opcional)'), { target: { value: 'Pagar en la oficina' } });
    fireEvent.change(within(dialog).getByLabelText('Días antes'), { target: { value: '5' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(api.updateRecurringItem).toHaveBeenCalledWith('tok', 'luz', expect.objectContaining({
      aviso: 'Pagar en la oficina', avisoDiasAntes: 5
    })));
  });

  it('offers a sinking fund for a monthly bill once it has an end date', async () => {
    renderTab();
    fireEvent.click(await screen.findByRole('button', { name: 'Editar Luz' }));
    const dialog = screen.getByRole('dialog', { name: 'Editar partida fija' });

    fireEvent.change(within(dialog).getByLabelText('Hasta (opcional)'), { target: { value: '2027-05-20' } });
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /hucha/ }));
    expect(within(dialog).getByText(/hasta la última cuota/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(api.updateRecurringItem).toHaveBeenCalledWith('tok', 'luz', expect.objectContaining({
      frecuencia: 'mensual', fechaFin: '2027-05-20', prorratear: true
    })));
  });

  it('shows a bar per category limit, amber from 80 % and red when over', async () => {
    api.getSummary.mockResolvedValue(summary({
      limitesCategoria: [
        { categoria: 'Ocio', limite: 100, gastado: 40, restante: 60, porcentaje: 40 },
        { categoria: 'Ropa', limite: 50, gastado: 42.5, restante: 7.5, porcentaje: 85 },
        { categoria: 'Restaurantes', limite: 80, gastado: 95, restante: -15, porcentaje: 119 }
      ]
    }));
    renderTab();

    const bars = await screen.findAllByRole('progressbar', { name: /^Gastado en / });
    expect(bars.map(b => b.getAttribute('aria-valuenow'))).toEqual(['40', '85', '100']);
    expect(bars[1].firstElementChild).toHaveClass('budget__limit-bar--warning');
    expect(bars[2].firstElementChild).toHaveClass('budget__limit-bar--over');
    expect(normalize(screen.getByText(/Quedan 60/).textContent)).toBe('Quedan 60,00 €');
    expect(normalize(screen.getByText(/Te pasas/).textContent)).toBe('Te pasas 15,00 €');
    expect(normalize(screen.getByText(/95,00 € de 80,00 €/).textContent)).toBe('95,00 € de 80,00 € · 119 %');
  });

  it('hides the limits card when there are none', async () => {
    renderTab();
    await screen.findByRole('region', { name: 'Lo que puedes gastar' });
    expect(screen.queryByText('Límites por categoría')).not.toBeInTheDocument();
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
