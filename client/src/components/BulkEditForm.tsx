import React, { useState, useEffect, useRef } from 'react';
import { IUser } from '../types/user';
import MultiSelect from './MultiSelect';
import './MultiSelect.scss';
import './AddExpenseModal.scss';

const apiHost = import.meta.env.VITE_API_HOST;
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '/api/v1';

interface BulkEditFormProps {
  members: IUser[];
  onBulkUpdate: (updateData: any) => void;
  token: string;
}

const BulkEditForm: React.FC<BulkEditFormProps> = ({ members, onBulkUpdate, token }) => {
  const [categories, setCategories] = useState<string[]>([]);
  const [paidByIds, setPaidByIds] = useState<string[]>([]);
  const [expenseDate, setExpenseDate] = useState<string>('');
  const [participants, setParticipants] = useState<string[]>([]);
  const [assumeExpense, setAssumeExpense] = useState<boolean | null>(null);
  const [localization, setLocalization] = useState<string>('');
  
  const [categoryInput, setCategoryInput] = useState('');
  const [suggestedCategories, setSuggestedCategories] = useState<{ category: string, count: number }[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const categoryInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const res = await fetch(`${apiHost}${apiBaseUrl}/expenses/categories`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.data)) {
            const validCategories = data.data.filter((item: any) => item && typeof item.category === 'string');
            setSuggestedCategories(validCategories);
          }
        }
      } catch (err) {
        console.error('Error fetching categories:', err);
      }
    };
    fetchCategories();
  }, [token]);
  
  const handleCategoryKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && categoryInput.trim() !== '') {
      e.preventDefault();
      addCategory(categoryInput.trim());
    }
  };

  const addCategory = (categoryToAdd: string) => {
    if (!categories.includes(categoryToAdd)) {
      setCategories([...categories, categoryToAdd]);
    }
    setCategoryInput('');
  };

  const removeCategory = (categoryToRemove: string) => {
    setCategories(categories.filter(cat => cat !== categoryToRemove));
  };

  const handleUpdate = () => {
    const updateData: any = {};
    if (categories.length > 0) updateData.categoria = categories;
    if (paidByIds.length > 0) updateData.pagado_por = paidByIds;
    if (expenseDate) updateData.fecha = expenseDate;
    if (participants.length > 0) updateData.participantes = participants;
    if (assumeExpense !== null) updateData.asume_gasto = assumeExpense;
    if (localization) updateData.localization = localization;

    onBulkUpdate(updateData);
  };

  const memberOptions = members.map(m => ({ value: m._id, label: m.nombre }));

  return (
    <div className="bulk-edit-form">
      <h4>Campos a Editar</h4>
      <div
        className="form-group"
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setShowSuggestions(false);
          }
        }}
      >
        <label htmlFor="category">Categoría:</label>
        <input
          type="text"
          id="category"
          placeholder="Ej: Comida, Ocio..."
          value={categoryInput}
          ref={categoryInputRef}
          onChange={e => setCategoryInput(e.target.value)}
          onKeyDown={handleCategoryKeyDown}
          onFocus={() => setShowSuggestions(true)}
          autoComplete="off"
        />
        {showSuggestions && (
          <ul className="suggestions-list">
            {categoryInput.trim() !== '' && !categories.includes(categoryInput.trim()) && (
              <li onMouseDown={(e) => {
                  e.preventDefault();
                  addCategory(categoryInput.trim());
              }}>
                Añadir "{categoryInput.trim()}"
              </li>
            )}
            {suggestedCategories
              .filter(c => c.category.toLowerCase().includes(categoryInput.toLowerCase()))
              .map(c => (
                <li
                  key={c.category}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    addCategory(c.category);
                  }}
                >
                  {c.category}
                </li>
              ))}
          </ul>
        )}
        <div className="selected-categories">
          {categories.map(cat => (
            <div key={cat} className="selected-category">
              {cat}
              <button type="button" onClick={() => removeCategory(cat)}>x</button>
            </div>
          ))}
        </div>
      </div>
      <div className="form-group">
        <label>Pagado por</label>
        <MultiSelect
          options={memberOptions}
          selected={paidByIds}
          onChange={setPaidByIds}
          placeholder="Añadir pagadores..."
        />
      </div>
      <div className="form-group">
        <label>Fecha del Gasto</label>
        <input type="date" value={expenseDate} onChange={e => setExpenseDate(e.target.value)} />
      </div>
      <div className="form-group">
        <label>Lugar</label>
        <input type="text" value={localization} onChange={e => setLocalization(e.target.value)} placeholder="Lugar del gasto" />
      </div>
      <div className="form-group">
        <label>Participantes</label>
        <MultiSelect
          options={memberOptions}
          selected={participants}
          onChange={setParticipants}
          placeholder="Añadir participantes..."
        />
      </div>
      <div className="form-group">
        <label>¿El pagador invita?</label>
        <select onChange={e => setAssumeExpense(e.target.value === '' ? null : e.target.value === 'true')}>
            <option value="">No cambiar</option>
            <option value="true">Sí</option>
            <option value="false">No</option>
        </select>
      </div>
      <button onClick={handleUpdate}>Actualizar Gastos Filtrados</button>
    </div>
  );
};

export default BulkEditForm;
