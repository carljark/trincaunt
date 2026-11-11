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
  item({ _id: 'gym', nombre: 'Gimnasio', importe: 40, activo: false })
];

const cycle = (inicio: string, disponible: number, enCurso = false) => ({
  inicio, fin: inicio, offset: 0, enCurso, ingresos: 2000, facturas: 700, reservas: 0,
  presupuestoGastable: disponible, gastado: 0, disponible, partidas: [], temporales: []
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

  it('shows one bubble per active item and the average left per cycle', async () => {
    render(<BudgetScenario groupId="g1" token="tok" items={items} onApplied={vi.fn()} />);
    expect(screen.getByRole('button', { name: /^Nómina/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Alquiler/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Gimnasio/ })).not.toBeInTheDocument();
    expect(await screen.findByText('600,00 €')).toBeInTheDocument();
  });

  it('simulates without a removed item and applies it by deactivating it', async () => {
    const onApplied = vi.fn();
    render(<BudgetScenario groupId="g1" token="tok" items={items} onApplied={onApplied} />);

    fireEvent.click(screen.getByRole('button', { name: /^Alquiler/ }));
    expect(screen.getByRole('button', { name: /^Alquiler/ })).toHaveAttribute('aria-pressed', 'true');

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/budget/forecast/simulate'), expect.anything()));
    const call = fetchMock.mock.calls.find(c => String(c[0]).includes('/simulate'))!;
    expect(bodyOf(call)).toEqual({ ciclos: 13, quitar: ['alquiler'], nuevas: [] });
    expect(await screen.findByText('1300,00 €')).toBeInTheDocument();
    expect(screen.getByText(/\+700,00 € que ahora/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Aplicar' }).at(-1)!);
    await waitFor(() => expect(onApplied).toHaveBeenCalled());
    const put = fetchMock.mock.calls.find(c => (c[1] as RequestInit | undefined)?.method === 'PUT')!;
    expect(put[0]).toContain('/recurring-items/alquiler');
    expect(bodyOf(put)).toEqual({ activo: false });
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
