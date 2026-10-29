import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { vi, describe, it, expect } from 'vitest';
import ExpenseList, { formatDayLabel } from './ExpenseList';
import { SwipeableExpense } from './SwipeableExpenseItem';

const ana = { _id: 'u1', nombre: 'Ana' };
const luis = { _id: 'u2', nombre: 'Luis' };

const expense = (id: string, fecha: string, monto: number, extra: Partial<SwipeableExpense> = {}) => ({
  _id: id,
  grupo_id: 'g1',
  descripcion: `Gasto ${id}`,
  monto,
  pagado_por: [ana],
  participantes: [ana, luis],
  fecha,
  asume_gasto: false,
  categoria: ['Comida'],
  ...extra
}) as SwipeableExpense;

const renderList = (overrides: Partial<React.ComponentProps<typeof ExpenseList>> = {}) => {
  const props = {
    expenses: [
      expense('1', '2026-10-28T20:00:00', 10),
      expense('2', '2026-10-28T09:00:00', 5.5, { pagado_por: [ana, luis], categoria: ['Ocio', 'Cine'] }),
      expense('3', '2026-10-20T12:00:00', 30)
    ],
    total: 45.5,
    grandTotal: 45.5,
    averagePerDay: 5.06,
    sortOrder: 'desc' as const,
    onToggleSort: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    ...overrides
  };
  render(<ExpenseList {...props} />);
  return props;
};

const normalize = (text: string | null) => text?.replace(/\s/g, ' ');

describe('formatDayLabel', () => {
  const now = new Date(2026, 9, 29, 10);

  it('uses Hoy and Ayer for the last two days', () => {
    expect(formatDayLabel(new Date(2026, 9, 29, 8), now)).toBe('Hoy');
    expect(formatDayLabel(new Date(2026, 9, 28, 23), now)).toBe('Ayer');
  });

  it('shows weekday and date otherwise, with the year only when it differs', () => {
    expect(formatDayLabel(new Date(2026, 9, 20), now)).not.toMatch(/2026/);
    expect(formatDayLabel(new Date(2025, 9, 20), now)).toMatch(/2025/);
  });
});

describe('ExpenseList', () => {
  it('shows the total, count and daily average', () => {
    renderList();
    expect(normalize(screen.getByText(/45,50/).textContent)).toBe('45,50 €');
    expect(normalize(screen.getByText(/3 gastos/).textContent)).toBe('3 gastos · 5,06 € al día');
  });

  it('mentions the unfiltered total when filters reduce the list', () => {
    renderList({ total: 10, grandTotal: 45.5 });
    expect(screen.getByText('Total filtrado')).toBeInTheDocument();
    expect(normalize(screen.getByText(/gastos ·/).textContent)).toContain('de 45,50 €');
  });

  it('groups expenses by day with a per-day total', () => {
    renderList();
    const days = screen.getAllByRole('heading', { level: 3 });
    expect(days).toHaveLength(2);
    expect(normalize(within(days[0]).getByText(/€/).textContent)).toBe('15,50 €');
    expect(normalize(within(days[1]).getByText(/€/).textContent)).toBe('30,00 €');
  });

  it('shows who paid and the categories under each description', () => {
    renderList();
    expect(screen.getByText('Pagó Ana, Luis · Ocio · Cine')).toBeInTheDocument();
  });

  it('shows an empty state', () => {
    renderList({ expenses: [], total: 0 });
    expect(screen.getByText(/No hay gastos/)).toBeInTheDocument();
  });

  it('toggles the sort order and wires edit/delete', () => {
    const props = renderList();
    fireEvent.click(screen.getByRole('button', { name: /Ordenar/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Editar Gasto 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Borrar Gasto 3' }));
    expect(props.onToggleSort).toHaveBeenCalled();
    expect(props.onEdit).toHaveBeenCalledWith(expect.objectContaining({ _id: '1' }));
    expect(props.onDelete).toHaveBeenCalledWith('3');
  });

  it('in the global view shows the group and the original amount, without actions', () => {
    renderList({
      isGlobal: true,
      expenses: [expense('1', '2026-10-28T20:00:00', 10, { grupo_nombre: 'Piso', original_monto: 40 })],
      total: 10,
      grandTotal: 10
    });
    expect(normalize(screen.getByText(/Piso/).textContent)).toBe('Piso · de 40,00 €');
    expect(screen.queryByRole('button', { name: /Editar/ })).not.toBeInTheDocument();
  });
});
