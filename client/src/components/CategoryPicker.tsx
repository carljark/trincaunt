import React, { useEffect, useId, useState } from 'react';
import './CategoryPicker.scss';

interface CategoryPickerProps {
  token: string;
  value: string[];
  onChange: (categories: string[]) => void;
  label?: string;
  placeholder?: string;
}

const apiHost = import.meta.env.VITE_API_HOST;
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '/api/v1';

// Elige categorías de las ya usadas en tus gastos o crea una nueva; las elegidas salen como chips
const CategoryPicker: React.FC<CategoryPickerProps> = ({ token, value, onChange, label = 'Categoría', placeholder = 'Comida, Ocio...' }) => {
  const inputId = useId();
  const [input, setInput] = useState('');
  const [suggested, setSuggested] = useState<{ category: string, count: number }[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const res = await fetch(`${apiHost}${apiBaseUrl}/expenses/categories`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.data)) {
            setSuggested(data.data.filter((item: { category?: unknown }) => item && typeof item.category === 'string'));
          }
        }
      } catch (err) {
        console.error('Error fetching categories:', err);
      }
    };
    fetchCategories();
  }, [token]);

  const add = (category: string) => {
    if (!value.includes(category)) onChange([...value, category]);
    setInput('');
  };

  const remove = (category: string) => onChange(value.filter(c => c !== category));

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && input.trim() !== '') {
      e.preventDefault();
      add(input.trim());
    }
  };

  const typed = input.trim();
  const matches = suggested
    .filter(c => !value.includes(c.category) && c.category.toLowerCase().includes(typed.toLowerCase()));

  return (
    <div className="category-picker">
      <div
        className="category-picker__field"
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setShowSuggestions(false);
            // Lo escrito sin pulsar Intro no se pierde
            if (typed) add(typed);
          }
        }}
      >
        <label className="category-picker__label" htmlFor={inputId}>{label}</label>
        <input
          className="category-picker__input"
          type="text"
          id={inputId}
          placeholder={placeholder}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setShowSuggestions(true)}
          autoComplete="off"
        />
        {showSuggestions && (
          <ul className="category-picker__suggestions">
            {typed !== '' && !value.includes(typed) && !matches.some(c => c.category === typed) && (
              <li className="category-picker__suggestion category-picker__suggestion--add" onMouseDown={(e) => {
                e.preventDefault();
                add(typed);
              }}>
                + Añadir &quot;{typed}&quot;
              </li>
            )}
            {matches.map(c => (
              <li
                key={c.category}
                className="category-picker__suggestion"
                onMouseDown={(e) => {
                  e.preventDefault();
                  add(c.category);
                }}
              >
                {c.category}
              </li>
            ))}
          </ul>
        )}
      </div>

      {value.length > 0 && (
        <div className="category-picker__chips">
          {value.map(cat => (
            <div key={cat} className="category-picker__chip">
              {cat}
              <button type="button" className="category-picker__chip-remove" onClick={() => remove(cat)} title="Eliminar" aria-label={`Quitar ${cat}`}>×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default CategoryPicker;
