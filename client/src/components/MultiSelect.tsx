import React, { useState, useRef, useEffect } from 'react';

interface MultiSelectProps {
  options: string[];
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

  const addSelection = (item: string) => {
    if (item && !selected.includes(item)) {
      onChange([...selected, item]);
    }
    setInputValue('');
    setShowSuggestions(false);
  };

  const removeSelection = (item: string) => {
    onChange(selected.filter(i => i !== item));
  };

  const filteredSuggestions = options.filter(
    o => o.toLowerCase().includes(inputValue.toLowerCase()) && !selected.includes(o)
  );

  return (
    <div className="multi-select-container" ref={containerRef}>
      <div className="selected-items">
        {selected.map(item => (
          <div key={item} className="selected-item">
            {item}
            <button type="button" onClick={() => removeSelection(item)}>x</button>
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
            // Check if the input value is a valid option
            if (options.includes(inputValue)) {
              addSelection(inputValue);
            }
          }
        }}
      />
      {showSuggestions && (
        <ul className="suggestions-list scrollable-list">
          {filteredSuggestions.map(item => (
            <li key={item} onClick={() => addSelection(item)}>
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default MultiSelect;
