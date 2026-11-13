import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { vi, describe, it, expect } from 'vitest';
import AdvancedFiltersModal from './AdvancedFiltersModal';

const members = [{ _id: 'u1', nombre: 'Ana' }, { _id: 'u2', nombre: 'Luis' }] as never[];
const allCategories = ['bebidas', 'comida', 'transporte'];

const renderModal = (overrides = {}) => {
  const props = {
    categoryFilter: [] as string[], allCategories, localizationFilter: '', payerFilter: 'all',
    dateFromFilter: '', dateToFilter: '', isGlobal: false, members,
    onCategoryChange: vi.fn(), onLocalizationChange: vi.fn(), onPayerChange: vi.fn(),
    onDateFromChange: vi.fn(), onDateToChange: vi.fn(), onClearAll: vi.fn(), onSave: vi.fn(), onClose: vi.fn(),
    ...overrides
  };
  render(<AdvancedFiltersModal {...props} />);
  return props;
};

describe('AdvancedFiltersModal', () => {
  it('treats no selection as all categories and picks only the clicked one', () => {
    const props = renderModal();
    expect(screen.getByText('Categorías · todas')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'comida' })).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'comida' }));
    expect(props.onCategoryChange).toHaveBeenCalledWith(['comida']);
  });

  it('treats every category checked as all', () => {
    const props = renderModal({ categoryFilter: [...allCategories] });
    expect(screen.getByText('Categorías · todas')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'bebidas' }));
    expect(props.onCategoryChange).toHaveBeenCalledWith(['bebidas']);
  });

  it('adds and removes categories from the selection', () => {
    const props = renderModal({ categoryFilter: ['comida'] });
    expect(screen.getByText('Categorías · 1 de 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'comida' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'bebidas' })).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'bebidas' }));
    expect(props.onCategoryChange).toHaveBeenLastCalledWith(['comida', 'bebidas']);
  });

  it('goes back to "all" when every category ends up selected', () => {
    const props = renderModal({ categoryFilter: ['bebidas', 'comida'] });
    expect(screen.getByText('Categorías · 2 de 3')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'transporte' }));
    expect(props.onCategoryChange).toHaveBeenCalledWith([]);
  });

  it('goes back to "all" when the last category is deselected, and offers a shortcut to all', () => {
    const props = renderModal({ categoryFilter: ['comida'] });
    fireEvent.click(screen.getByRole('button', { name: 'comida' }));
    expect(props.onCategoryChange).toHaveBeenLastCalledWith([]);
    fireEvent.click(screen.getByRole('button', { name: 'Todas' }));
    expect(props.onCategoryChange).toHaveBeenCalledTimes(2);
  });

  it('changes place, payer and dates, and clears a date', () => {
    const props = renderModal({ dateFromFilter: '2026-10-01' });
    fireEvent.change(screen.getByRole('textbox', { name: 'Lugar' }), { target: { value: 'Mahón' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Pagado por' }), { target: { value: 'u2' } });
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-10-31' } });
    fireEvent.click(screen.getByRole('button', { name: 'Quitar fecha desde' }));
    expect(props.onLocalizationChange).toHaveBeenCalledWith('Mahón');
    expect(props.onPayerChange).toHaveBeenCalledWith('u2');
    expect(props.onDateToChange).toHaveBeenCalledWith('2026-10-31');
    expect(props.onDateFromChange).toHaveBeenCalledWith('');
  });

  it('hides the payer filter in the global view', () => {
    renderModal({ isGlobal: true });
    expect(screen.queryByRole('combobox', { name: 'Pagado por' })).not.toBeInTheDocument();
  });

  it('clears everything and closes with Listo', () => {
    const props = renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Listo' }));
    expect(props.onClearAll).toHaveBeenCalled();
    expect(props.onSave).toHaveBeenCalled();
  });
});
