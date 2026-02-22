import React, { useState, useRef, useEffect } from 'react';

interface Option {
  value: string;
  label: string;
}

interface MultiSelectProps {
  options: Option[];
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder: string;
}

const MultiSelect: React.FC<MultiSelectProps> = ({ options, selected, onChange, placeholder }) => {
  const [inputValue, setInputValue] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const addSelection = (value: string) => {
    if (value && !selected.includes(value)) {
      onChange([...selected, value]);
    }
    setInputValue('');
    setShowSuggestions(false);
  };

  const removeSelection = (value: string) => {
    onChange(selected.filter(v => v !== value));
  };

  const filteredSuggestions = options.filter(
    o => o.label.toLowerCase().includes(inputValue.toLowerCase()) && !selected.includes(o.value)
  );

  const selectedLabels = selected.map(value => {
    const option = options.find(o => o.value === value);
    return option ? option.label : value;
  });

  return (
    <div className="multi-select-container" ref={containerRef}>
      <div className="selected-items">
        {selectedLabels.map((label, index) => (
          <div key={selected[index]} className="selected-item">
            {label}
            <button type="button" onClick={() => removeSelection(selected[index])}>x</button>
          </div>
        ))}
      </div>
      <input
        type="text"
        placeholder={placeholder}
        value={inputValue}
        onChange={e => setInputValue(e.target.value)}
        onFocus={() => setShowSuggestions(true)}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            if (filteredSuggestions.length > 0) {
              addSelection(filteredSuggestions[0].value);
            }
          }
        }}
      />
      {showSuggestions && (
        <ul className="suggestions-list scrollable-list">
          {filteredSuggestions.map(option => (
            <li key={option.value} onClick={() => addSelection(option.value)}>
              {option.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default MultiSelect;
