import React from 'react';
import './MemberToggleGroup.scss';

interface Option {
  value: string;
  label: string;
}

interface MemberToggleGroupProps {
  options: Option[];
  selected: string[];
  onChange: (selected: string[]) => void;
  labelledBy?: string;
  disabled?: boolean;
  showBulkActions?: boolean;
}

// Selección múltiple con botones conmutables: pensada para grupos pequeños y uso táctil (sin teclado ni desplegable).
const MemberToggleGroup: React.FC<MemberToggleGroupProps> = ({ options, selected, onChange, labelledBy, disabled = false, showBulkActions = false }) => {
  const toggle = (value: string) => {
    onChange(selected.includes(value) ? selected.filter(v => v !== value) : [...selected, value]);
  };

  const allSelected = options.length > 0 && options.every(o => selected.includes(o.value));

  return (
    <div className={`member-toggle ${disabled ? 'member-toggle--disabled' : ''}`}>
      <div className="member-toggle__options" role="group" aria-labelledby={labelledBy}>
        {options.map(option => {
          const isSelected = selected.includes(option.value);
          return (
            <button
              key={option.value}
              type="button"
              className={`member-toggle__option ${isSelected ? 'member-toggle__option--selected' : ''}`}
              aria-pressed={isSelected}
              onClick={() => toggle(option.value)}
              disabled={disabled}
            >
              <span className="member-toggle__check" aria-hidden="true">{isSelected ? '✓' : ''}</span>
              {option.label}
            </button>
          );
        })}
      </div>
      {showBulkActions && (
        <button
          type="button"
          className="member-toggle__bulk"
          onClick={() => onChange(allSelected ? [] : options.map(o => o.value))}
          disabled={disabled}
        >
          {allSelected ? 'Ninguno' : 'Todos'}
        </button>
      )}
    </div>
  );
};

export default MemberToggleGroup;
