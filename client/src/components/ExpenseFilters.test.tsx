import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { vi, describe, it, expect } from 'vitest';
import ExpenseFilters from './ExpenseFilters';

const renderFilters = (overrides: Partial<React.ComponentProps<typeof ExpenseFilters>> = {}) => {
  const props = {
    search: '',
    onSearchChange: vi.fn(),
    datePreset: null,
    onDatePresetClick: vi.fn(),
    hasAdvancedFilters: false,
    onOpenAdvancedFilters: vi.fn(),
    ...overrides
  };
  render(<ExpenseFilters {...props} />);
  return props;
};

describe('ExpenseFilters', () => {
  it('reports search changes', () => {
    const props = renderFilters();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar gastos' }), { target: { value: 'cena' } });
    expect(props.onSearchChange).toHaveBeenCalledWith('cena');
  });

  it('marks the active period and reports clicks', () => {
    const props = renderFilters({ datePreset: 'month' });
    expect(screen.getByRole('button', { name: 'Mes' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Hoy' })).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'Semana' }));
    expect(props.onDatePresetClick).toHaveBeenCalledWith('week');
  });

  it('flags active advanced filters and opens the modal', () => {
    const props = renderFilters({ hasAdvancedFilters: true });
    fireEvent.click(screen.getByRole('button', { name: 'Filtros avanzados (activos)' }));
    expect(props.onOpenAdvancedFilters).toHaveBeenCalled();
  });
});
