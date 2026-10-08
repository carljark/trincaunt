import React from 'react';
import { IUser } from '../types/user';

interface AdvancedFiltersModalProps {
  categoryFilter: string[];
  localizationFilter: string;
  payerFilter: string;
  dateFromFilter: string;
  dateToFilter: string;
  isGlobal: boolean;
  members: IUser[];
  onLocalizationChange: (val: string) => void;
  onPayerChange: (val: string) => void;
  onDateFromChange: (val: string) => void;
  onDateToChange: (val: string) => void;
  onClearAll: () => void;
  onSave: () => void;
  onClose: () => void;
  onOpenCategoryModal: () => void;
}

const AdvancedFiltersModal: React.FC<AdvancedFiltersModalProps> = ({
  categoryFilter,
  localizationFilter,
  payerFilter,
  dateFromFilter,
  dateToFilter,
  isGlobal,
  members,
  onLocalizationChange,
  onPayerChange,
  onDateFromChange,
  onDateToChange,
  onClearAll,
  onSave,
  onClose,
  onOpenCategoryModal,
}) => {
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div className="modal-overlay" onClick={handleBackdropClick}>
      <div className="modal-content">
        <h3>Filtros</h3>

        <div className="filter-fields">
          <label className="filter-field">
            <span>Categoría</span>
            <button onClick={onOpenCategoryModal}>
              {categoryFilter.length === 0
                ? 'Todas'
                : categoryFilter.length === 1
                  ? categoryFilter[0]
                  : `${categoryFilter.length} categorías`}
            </button>
          </label>

          <label className="filter-field">
            <span>Lugar</span>
            <input
              type="text"
              placeholder="Filtrar por lugar..."
              value={localizationFilter}
              onChange={e => onLocalizationChange(e.target.value)}
            />
          </label>

          {!isGlobal && (
            <label className="filter-field">
              <span>Pagado por</span>
              <select value={payerFilter} onChange={e => onPayerChange(e.target.value)}>
                <option value="all">Todos</option>
                {members.map(member => (
                  <option key={member._id} value={member._id}>{member.nombre}</option>
                ))}
              </select>
            </label>
          )}

          <div className="filter-field">
            <span>Desde</span>
            <div className="date-filter-container">
              <input
                type="date"
                value={dateFromFilter}
                onChange={e => onDateFromChange(e.target.value)}
              />
              {dateFromFilter && (
                <button
                  onClick={() => onDateFromChange('')}
                  className="clear-date-btn"
                  title="Limpiar fecha"
                >✕</button>
              )}
            </div>
          </div>

          <div className="filter-field">
            <span>Hasta</span>
            <div className="date-filter-container">
              <input
                type="date"
                value={dateToFilter}
                onChange={e => onDateToChange(e.target.value)}
              />
              {dateToFilter && (
                <button
                  onClick={() => onDateToChange('')}
                  className="clear-date-btn"
                  title="Limpiar fecha"
                >✕</button>
              )}
            </div>
          </div>
        </div>

        <div className="modal-actions">
          <button onClick={onClearAll} className="clear-all-btn">Limpiar</button>
          <button onClick={onSave} className="save-filters-btn">Aplicar</button>
          <button onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
};

export default AdvancedFiltersModal;
