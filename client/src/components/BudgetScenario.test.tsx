import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { vi, describe, it, expect, beforeEach, type Mock } from 'vitest';
import BudgetScenario from './BudgetScenario';
import { IRecurringItem } from '../types/budget';

const item = (over: Partial<IRecurringItem>): IRecurringItem => ({
  _id: 'x', grupo_id: 'g1', tipo: 'factura', nombre: 'X', importe: 10, frecuencia: 'mensual',
  fechaInicio: '2026-01-01', categoria: [], activo: true, ...over
});

const items = [
  item({ _id: 'nomina', tipo: 'ingreso', nombre: 'Nómina', importe: 2000 }),
  item({ _id: 'alquiler', nombre: 'Alquiler', importe: 700 }),
  item({ _id: 'gym', nombre: 'Gimnasio', importe: 40, activo: false }),
  item({ _id: 'visa1', nombre: 'Visa (cuota 110 €)', importe: 110 }),
  item({ _id: 'visa2', nombre: 'Visa (cuota 120 €)', importe: 120 }),
  item({ _id: 'lejana', nombre: 'Préstamo (último pago)', importe: 128, fechaInicio: '2028-03-01' })
];

const bill = (recurrente_id: string, nombre: string, importe: number) => ({
  recurrente_id, nombre, fecha: '2026-12-01', importe, estado: 'pendiente', ultima: false, nueva: false
});

const cycle = (inicio: string, disponible: number, enCurso = false) => ({
  inicio, fin: inicio, offset: 0, enCurso, ingresos: 2000, facturas: 700, reservas: 0,
  presupuestoGastable: disponible, gastado: 0, disponible, temporales: [],
  // «lejana» no toca en el próximo año: no sale en ningún ciclo
  partidas: [bill('alquiler', 'Alquiler', 700), bill('visa1', 'Visa (cuota 110 €)', 110), bill('visa2', 'Visa (cuota 120 €)', 120)]
});

const forecast = (disponible: number) => ({
  ahorroObjetivo: 0,
  ciclos: [cycle('2026-10-28', 500, true), cycle('2026-11-28', disponible), cycle('2026-12-28', disponible)]
});

describe('BudgetScenario', () => {
  let fetchMock: Mock;

  beforeEach(() => {
    fetchMock = vi.fn(async (url: string, init?: RequestInit) => ({
      ok: true,
      status: 200,
      json: async () => ({
        data: url.includes('/simulate') ? forecast(1300) : init?.method === 'PUT' ? {} : forecast(600)
      })
    }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  const bodyOf = (call: unknown[]) => JSON.parse((call[1] as RequestInit).body as string);

  it('shows a bubble per active item, grouping variants and hiding those outside the next year', async () => {
    render(<BudgetScenario groupId="g1" token="tok" items={items} onApplied={vi.fn()} />);
    expect(await screen.findByText('600,00 €')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /^Nómina/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Alquiler/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Visa, 2 partidas/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Gimnasio/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Préstamo/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Una partida no sale porque no toca en el próximo año/)).toBeInTheDocument();
  });

  it('removes every item of a grouped bubble at once', async () => {
    render(<BudgetScenario groupId="g1" token="tok" items={items} onApplied={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: /^Visa, 2 partidas/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Quitar del ensayo' }));
    await waitFor(() => {
      const call = fetchMock.mock.calls.find(c => String(c[0]).includes('/simulate'));
      expect(call && bodyOf(call).quitar).toEqual(['visa1', 'visa2']);
    });
  });

  it('groups the smallest bills into «Otras» and opens it when tapped', async () => {
    const many = Array.from({ length: 14 }, (_, i) => item({ _id: `b${i}`, nombre: `Factura ${i}`, importe: 100 - i }));
    const big = { ...forecast(600), ciclos: forecast(600).ciclos.map(c => ({ ...c, partidas: many.map(m => bill(m._id, m.nombre, m.importe)) })) };
    fetchMock.mockImplementation(async () => ({ ok: true, status: 200, json: async () => ({ data: big }) }));
    render(<BudgetScenario groupId="g1" token="tok" items={many} onApplied={vi.fn()} />);

    const otras = await screen.findByRole('button', { name: /^Otras: Factura 11, Factura 12, Factura 13/ });
    expect(screen.getByRole('button', { name: /^Factura 10,/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Factura 13,/ })).not.toBeInTheDocument();

    fireEvent.click(otras);
    expect(await screen.findByRole('button', { name: /^Factura 13,/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Juntar otra vez las pequeñas' }));
    expect(await screen.findByRole('button', { name: /^Otras/ })).toBeInTheDocument();
  });

  it('simulates without a removed item and applies it by deactivating it', async () => {
    const onApplied = vi.fn();
    render(<BudgetScenario groupId="g1" token="tok" items={items} onApplied={onApplied} />);

    fireEvent.click(await screen.findByRole('button', { name: /^Alquiler/ }));
    expect(screen.getByRole('button', { name: /^Alquiler/ })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Quitar del ensayo' }));
    expect(screen.getByRole('button', { name: /^Alquiler.*Fuera del ensayo/ })).toBeInTheDocument();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/budget/forecast/simulate'), expect.anything()));
    const call = fetchMock.mock.calls.find(c => String(c[0]).includes('/simulate'))!;
    expect(bodyOf(call)).toEqual({ ciclos: 13, quitar: ['alquiler'], nuevas: [], cambiar: [] });
    expect(await screen.findByText('1300,00 €')).toBeInTheDocument();
    expect(screen.getByText('+700,00 € cada ciclo')).toBeInTheDocument();
    expect(screen.getByText('Ahora: 600,00 €')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Aplicar' }).at(-1)!);
    await waitFor(() => expect(onApplied).toHaveBeenCalled());
    const put = fetchMock.mock.calls.find(c => (c[1] as RequestInit | undefined)?.method === 'PUT')!;
    expect(put[0]).toContain('/recurring-items/alquiler');
    expect(bodyOf(put)).toEqual({ activo: false });
  });

  it('changes the amount of an item and saves it when applied', async () => {
    const onApplied = vi.fn();
    render(<BudgetScenario groupId="g1" token="tok" items={items} onApplied={onApplied} />);

    fireEvent.click(await screen.findByRole('button', { name: /^Alquiler/ }));
    fireEvent.change(screen.getByLabelText('Importe'), { target: { value: '770' } });
    expect(screen.getByRole('button', { name: /^Alquiler, 770,00 €, retocada/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Más' }));
    expect(screen.getByLabelText('Importe')).toHaveValue(780);

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(c => String(c[0]).includes('/simulate'));
      expect(call && bodyOf(call).cambiar).toEqual([{ id: 'alquiler', escala: 780 / 700 }]);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    expect(screen.getByText(/Se cambiarán: Alquiler \(780,00 €\)/)).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Aplicar' }).at(-1)!);
    await waitFor(() => expect(onApplied).toHaveBeenCalled());
    const put = fetchMock.mock.calls.find(c => (c[1] as RequestInit | undefined)?.method === 'PUT')!;
    expect(put[0]).toContain('/recurring-items/alquiler');
    expect(bodyOf(put)).toEqual({ importe: 780 });
  });

  it('moves the dates of an item along the months strip', async () => {
    // Una cuota que acaba: moverla sí cambia algo
    const conFin = items.map(i => (i._id === 'visa2' ? { ...i, fechaFin: '2027-06-01' } : i));
    render(<BudgetScenario groupId="g1" token="tok" items={conFin} onApplied={vi.fn()} />);

    fireEvent.click(await screen.findByRole('button', { name: /^Visa, 2 partidas/ }));
    const slider = screen.getByRole('slider', { name: 'Mover sus fechas' });
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    expect(slider).toHaveAttribute('aria-valuetext', '2 meses más tarde');

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(c => String(c[0]).includes('/simulate'));
      expect(call && bodyOf(call).cambiar).toEqual([{ id: 'visa1', meses: 2 }, { id: 'visa2', meses: 2 }]);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Como estaba' }));
    expect(slider).toHaveAttribute('aria-valuenow', '0');
  });

  it('says when moving a monthly item without end would change nothing', async () => {
    render(<BudgetScenario groupId="g1" token="tok" items={items} onApplied={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: /^Alquiler/ }));
    expect(screen.getByText(/moverla no cambiaría nada/)).toBeInTheDocument();
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
  });

  it('adds a made-up item to the scenario', async () => {
    render(<BudgetScenario groupId="g1" token="tok" items={items} onApplied={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Inventar una partida' }));
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Coche' } });
    fireEvent.change(screen.getByLabelText(/^Importe/), { target: { value: '300' } });
    fireEvent.click(screen.getByRole('button', { name: 'Añadir al ensayo' }));

    expect(await screen.findByRole('button', { name: /^Coche, .*inventada/ })).toBeInTheDocument();
    await waitFor(() => {
      const call = fetchMock.mock.calls.find(c => String(c[0]).includes('/simulate'));
      expect(call && bodyOf(call).nuevas).toEqual([expect.objectContaining({ tipo: 'factura', nombre: 'Coche', importe: 300, frecuencia: 'mensual' })]);
    });
  });
});
