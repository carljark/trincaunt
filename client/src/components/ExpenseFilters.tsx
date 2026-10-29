import React from 'react';
import { FilterIcon, SearchIcon } from './icons';
import './ExpenseFilters.scss';

const PRESETS = [
  { value: 'day', label: 'Hoy' },
  { value: 'week', label: 'Semana' },
  { value: 'month', label: 'Mes' },
  { value: 'year', label: 'Año' }
];

interface ExpenseFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  datePreset: string | null;
  onDatePresetClick: (preset: string) => void;
  hasAdvancedFilters: boolean;
  onOpenAdvancedFilters: () => void;
}

const ExpenseFilters: React.FC<ExpenseFiltersProps> = ({
  search, onSearchChange, datePreset, onDatePresetClick, hasAdvancedFilters, onOpenAdvancedFilters
}) => (
  <div className="expense-filters">
    <div className="expense-filters__search-row">
      <label className="expense-filters__search">
        <SearchIcon className="expense-filters__search-icon" />
        <input
          className="expense-filters__input"
          type="search"
          placeholder="Buscar por nombre o categoría"
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          aria-label="Buscar gastos"
        />
      </label>
      <button
        type="button"
        className={`expense-filters__advanced ${hasAdvancedFilters ? 'expense-filters__advanced--active' : ''}`}
        onClick={onOpenAdvancedFilters}
        aria-label={hasAdvancedFilters ? 'Filtros avanzados (activos)' : 'Filtros avanzados'}
        title="Filtros avanzados"
      >
        <FilterIcon />
      </button>
    </div>

    {/* Pulsar el periodo activo lo desactiva (lo gestiona onDatePresetClick) */}
    <div className="expense-filters__presets" role="group" aria-label="Periodo">
      {PRESETS.map(p => (
        <button
          key={p.value}
          type="button"
          className={`expense-filters__preset ${datePreset === p.value ? 'expense-filters__preset--active' : ''}`}
          aria-pressed={datePreset === p.value}
          onClick={() => onDatePresetClick(p.value)}
        >
          {p.label}
        </button>
      ))}
    </div>
  </div>
);

export default ExpenseFilters;
