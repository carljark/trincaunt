import React from 'react';
import { IUser } from '../types/user';
import Dialog from './Dialog';
import { CloseIcon } from './icons';
import './AdvancedFiltersModal.scss';

interface AdvancedFiltersModalProps {
  categoryFilter: string[];
  allCategories: string[];
  localizationFilter: string;
  payerFilter: string;
  dateFromFilter: string;
  dateToFilter: string;
  isGlobal: boolean;
  members: IUser[];
  onCategoryChange: (val: string[]) => void;
  onLocalizationChange: (val: string) => void;
  onPayerChange: (val: string) => void;
  onDateFromChange: (val: string) => void;
  onDateToChange: (val: string) => void;
  onClearAll: () => void;
  onSave: () => void;
  onClose: () => void;
}

// Los filtros se aplican al momento; «Listo» solo cierra el diálogo.
const AdvancedFiltersModal: React.FC<AdvancedFiltersModalProps> = ({
  categoryFilter,
  allCategories,
  localizationFilter,
  payerFilter,
  dateFromFilter,
  dateToFilter,
  isGlobal,
  members,
  onCategoryChange,
  onLocalizationChange,
  onPayerChange,
  onDateFromChange,
  onDateToChange,
  onClearAll,
  onSave,
  onClose,
}) => {
  // Lista vacía = sin filtro; tener todas marcadas equivale a lo mismo
  const allSelected = categoryFilter.length === 0 || allCategories.every(c => categoryFilter.includes(c));
  const isSelected = (category: string) => allSelected || categoryFilter.includes(category);

  const toggleCategory = (category: string) => {
    const current = allSelected ? allCategories : categoryFilter;
    if (current.includes(category)) {
      const next = current.filter(c => c !== category);
      // Quitar la última equivaldría a «todas» (lista vacía): no se permite
      if (next.length > 0) onCategoryChange(next);
    } else {
      const next = [...current, category];
      onCategoryChange(allCategories.every(c => next.includes(c)) ? [] : next);
    }
  };

  const selectedCount = allSelected ? allCategories.length : categoryFilter.length;

  return (
    <Dialog
      title="Filtros"
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClearAll} className="advanced-filters__button advanced-filters__button--secondary">
            Limpiar
          </button>
          <button type="button" onClick={onSave} className="advanced-filters__button advanced-filters__button--primary">
            Listo
          </button>
        </>
      }
    >
      <div className="advanced-filters">
        {allCategories.length > 0 && (
          <div className="advanced-filters__field">
            <div className="advanced-filters__field-header">
              <span className="advanced-filters__label" id="advanced-filters-categories">
                Categorías{allSelected ? ' · todas' : ` · ${selectedCount} de ${allCategories.length}`}
              </span>
              {!allSelected && (
                <button type="button" className="advanced-filters__link" onClick={() => onCategoryChange([])}>
                  Todas
                </button>
              )}
            </div>
            <div className="advanced-filters__categories" role="group" aria-labelledby="advanced-filters-categories">
              {allCategories.map(category => (
                <button
                  key={category}
                  type="button"
                  className={`advanced-filters__category ${isSelected(category) && !allSelected ? 'advanced-filters__category--selected' : ''}`}
                  aria-pressed={isSelected(category)}
                  onClick={() => toggleCategory(category)}
                >
                  {category}
                </button>
              ))}
            </div>
          </div>
        )}

        <label className="advanced-filters__field">
          <span className="advanced-filters__label">Lugar</span>
          <input
            className="advanced-filters__input"
            type="text"
            placeholder="Filtrar por lugar..."
            value={localizationFilter}
            onChange={e => onLocalizationChange(e.target.value)}
          />
        </label>

        {!isGlobal && (
          <label className="advanced-filters__field">
            <span className="advanced-filters__label">Pagado por</span>
            <select className="advanced-filters__select" value={payerFilter} onChange={e => onPayerChange(e.target.value)}>
              <option value="all">Todos</option>
              {members.map(member => (
                <option key={member._id} value={member._id}>{member.nombre}</option>
              ))}
            </select>
          </label>
        )}

        <div className="advanced-filters__dates">
          {[
            { label: 'Desde', value: dateFromFilter, onChange: onDateFromChange },
            { label: 'Hasta', value: dateToFilter, onChange: onDateToChange },
          ].map(({ label, value, onChange }) => (
            <div key={label} className="advanced-filters__field">
              <label className="advanced-filters__label" htmlFor={`advanced-filters-${label}`}>{label}</label>
              <div className="advanced-filters__date">
                <input
                  id={`advanced-filters-${label}`}
                  className="advanced-filters__input"
                  type="date"
                  value={value}
                  onChange={e => onChange(e.target.value)}
                />
                {value && (
                  <button
                    type="button"
                    onClick={() => onChange('')}
                    className="advanced-filters__clear-date"
                    aria-label={`Quitar fecha ${label.toLowerCase()}`}
                    title="Quitar fecha"
                  >
                    <CloseIcon />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Dialog>
  );
};

export default AdvancedFiltersModal;
