import React, { useState, useEffect, useRef } from 'react';
import { IExpense, IExpensePopulated } from '../types/expense';
import { IUserPopulated } from '../types/user';
import MultiSelect from './MultiSelect';
import './AddExpenseModal.scss';

interface AddExpenseModalProps {
  groupId: string;
  token: string;
  members: Array<{ _id: string; nombre: string }>;
  onClose: () => void;
  onExpenseAction: (expense: IExpense) => void;
  paidByInitial: string;
  expenseToEdit?: IExpensePopulated;
}

const apiHost = import.meta.env.VITE_API_HOST;
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '/api/v1';

const AddExpenseModal: React.FC<AddExpenseModalProps> = ({ groupId, token, members, onClose, onExpenseAction, paidByInitial, expenseToEdit }) => {
  const [expenseData, setExpenseData] = useState({
    description: expenseToEdit?.descripcion || '',
    amount: expenseToEdit?.monto.toString() || '',
    localization: expenseToEdit?.localization || ''
  });
  const [assumeExpense, setAssumeExpense] = useState<boolean>(expenseToEdit?.asume_gasto || false);
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>(expenseToEdit?.participantes.map((p: IUserPopulated) => p._id) || []);
  const [categories, setCategories] = useState<string[]>(expenseToEdit?.categoria || []);
  const [categoryInput, setCategoryInput] = useState('');
  const [paidByIds, setPaidByIds] = useState<string[]>([]);
  const [suggestedCategories, setSuggestedCategories] = useState<{ category: string, count: number }[]>([]);
  const [suggestedLocations, setSuggestedLocations] = useState<{ localization: string, count: number }[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showLocationSuggestions, setShowLocationSuggestions] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const categoryInputRef = useRef<HTMLInputElement>(null);
  const today = new Date();
  const formattedToday = today.toISOString().split('T')[0];
  const [expenseDate, setExpenseDate] = useState<string>(expenseToEdit?.fecha?.split('T')[0] || formattedToday);

  useEffect(() => {
    if (expenseToEdit) {
      if (Array.isArray(expenseToEdit.pagado_por)) {
        setPaidByIds(expenseToEdit.pagado_por.map((p: IUserPopulated) => p._id));
      } else {
        // @ts-expect-error legacy expenses stored a single populated user instead of an array
        setPaidByIds([expenseToEdit.pagado_por._id.toString()]);
      }
      setExpenseDate(expenseToEdit.fecha.split('T')[0]);
    } else if (members && members.length > 0) {
      setSelectedParticipants(members.map(m => m._id));
      if (paidByInitial) {
        setPaidByIds([paidByInitial]);
      }
    }
  }, [expenseToEdit, members, paidByInitial]);

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const res = await fetch(`${apiHost}${apiBaseUrl}/expenses/categories`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.data)) {
            const validCategories = data.data.filter((item: { category?: unknown }) => item && typeof item.category === 'string');
            setSuggestedCategories(validCategories);
          }
        }
      } catch (err) {
        console.error('Error fetching categories:', err);
      }
    };
    fetchCategories();
  }, [token]);

  useEffect(() => {
    const fetchLocations = async () => {
      try {
        const res = await fetch(`${apiHost}${apiBaseUrl}/expenses/locations`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.data)) {
            setSuggestedLocations(data.data);
          }
        }
      } catch (err) {
        console.error('Error fetching locations:', err);
      }
    };
    fetchLocations();
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

  const handleSubmitExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (!expenseData.description || !expenseData.amount || parseFloat(expenseData.amount) <= 0) {
      setError('Por favor, ingresa una descripción y un monto válido.');
      setLoading(false);
      return;
    }

    if (paidByIds.length === 0) {
      setError('Por favor, selecciona quién pagó el gasto.');
      setLoading(false);
      return;
    }

    const expensePayload: Record<string, unknown> = {
      descripcion: expenseData.description,
      monto: Number.parseFloat(expenseData.amount),
      grupo_id: groupId,
      pagado_por: paidByIds,
      asume_gasto: assumeExpense,
      categoria: categories,
      fecha: expenseDate,
      localization: expenseData.localization,
    };

    if (!assumeExpense) {
      if (selectedParticipants.length === 0) {
        setError('Por favor, selecciona al menos un participante si no asumes el gasto.');
        setLoading(false);
        return;
      }
      expensePayload.participantes = selectedParticipants;
    } else {
      expensePayload.participantes = paidByIds;
    }

    try {
      const url = expenseToEdit ? `${apiHost}${apiBaseUrl}/expenses/${expenseToEdit._id}` : `${apiHost}${apiBaseUrl}/expenses`;
      const method = expenseToEdit ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(expensePayload)
      });
      if (res.ok) {
        const result = await res.json();
        onExpenseAction(result.data);
        onClose();
      } else {
        const data = await res.json();
        setError(data.message || `Error al ${expenseToEdit ? 'actualizar' : 'añadir'} gasto`);
      }
    } catch (err) {
      console.error(`Error ${expenseToEdit ? 'updating' : 'adding'} expense:`, err);
      setError('Error de red o del servidor.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="expense-modal">
      <div className="expense-modal__panel">
        <div className="expense-modal__header">
          <h3 className="expense-modal__title">{expenseToEdit ? 'Editar Gasto' : 'Añadir Gasto'}</h3>
        </div>

        <form className="expense-modal__form" onSubmit={handleSubmitExpense}>
          <div className="expense-modal__body">
            {error && <p className="expense-modal__error">{error}</p>}

            {/* Descripción */}
            <div className="expense-modal__field">
              <label className="expense-modal__label" htmlFor="description">Descripción</label>
              <input
                className="expense-modal__input"
                type="text"
                id="description"
                placeholder="¿En qué gastaste?"
                value={expenseData.description}
                onChange={e => setExpenseData({ ...expenseData, description: e.target.value })}
                required
              />
            </div>

            <div className="expense-modal__row">
              {/* Monto */}
              <div className="expense-modal__field">
                <label className="expense-modal__label" htmlFor="amount">Monto</label>
                <input
                  className="expense-modal__input expense-modal__input--amount"
                  type="number"
                  id="amount"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={expenseData.amount}
                  onChange={e => setExpenseData({ ...expenseData, amount: e.target.value })}
                  step="0.01"
                  min="0"
                  required
                />
              </div>

              {/* Fecha */}
              <div className="expense-modal__field">
                <label className="expense-modal__label" htmlFor="expense-date">Fecha</label>
                <input
                  className="expense-modal__input expense-modal__input--date"
                  type="date"
                  id="expense-date"
                  value={expenseDate}
                  onChange={e => setExpenseDate(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="expense-modal__row">
              {/* Localización */}
              <div
                className="expense-modal__field"
                onBlur={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                    setShowLocationSuggestions(false);
                  }
                }}
              >
                <label className="expense-modal__label" htmlFor="localization">Lugar</label>
                <input
                  className="expense-modal__input"
                  type="text"
                  id="localization"
                  placeholder="¿Dónde fue?"
                  value={expenseData.localization}
                  onChange={e => setExpenseData({ ...expenseData, localization: e.target.value })}
                  onFocus={() => setShowLocationSuggestions(true)}
                  autoComplete="off"
                />
                {showLocationSuggestions && suggestedLocations.length > 0 && (
                  <ul className="expense-modal__suggestions">
                    {suggestedLocations
                      .filter(l => l.localization.toLowerCase().includes(expenseData.localization.toLowerCase()))
                      .slice(0, 6)
                      .map(l => (
                        <li
                          key={l.localization}
                          className="expense-modal__suggestion"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setExpenseData({ ...expenseData, localization: l.localization });
                            setShowLocationSuggestions(false);
                          }}
                        >
                          {l.localization}
                        </li>
                      ))}
                  </ul>
                )}
              </div>

              {/* Categorías */}
              <div
                className="expense-modal__field"
                onBlur={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                    setShowSuggestions(false);
                  }
                }}
              >
                <label className="expense-modal__label" htmlFor="category">Categoría</label>
                <input
                  className="expense-modal__input"
                  type="text"
                  id="category"
                  placeholder="Comida, Ocio..."
                  value={categoryInput}
                  ref={categoryInputRef}
                  onChange={e => setCategoryInput(e.target.value)}
                  onKeyDown={handleCategoryKeyDown}
                  onFocus={() => setShowSuggestions(true)}
                  autoComplete="off"
                />
                {showSuggestions && (
                  <ul className="expense-modal__suggestions">
                    {categoryInput.trim() !== '' && !categories.includes(categoryInput.trim()) && (
                      <li className="expense-modal__suggestion expense-modal__suggestion--add" onMouseDown={(e) => {
                        e.preventDefault();
                        addCategory(categoryInput.trim());
                      }}>
                        + Añadir &quot;{categoryInput.trim()}&quot;
                      </li>
                    )}
                    {suggestedCategories
                      .filter(c => c.category.toLowerCase().includes(categoryInput.toLowerCase()))
                      .slice(0, 5)
                      .map(c => (
                        <li
                          key={c.category}
                          className="expense-modal__suggestion"
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
              </div>
            </div>

            {categories.length > 0 && (
              <div className="expense-modal__chips">
                {categories.map(cat => (
                  <div key={cat} className="expense-modal__chip">
                    {cat}
                    <button type="button" className="expense-modal__chip-remove" onClick={() => removeCategory(cat)} title="Eliminar">×</button>
                  </div>
                ))}
              </div>
            )}

            {/* Pagado por */}
            <div className="expense-modal__field expense-modal__field--payers">
              <label className="expense-modal__label" htmlFor="paidBy">Pagado por</label>
              <MultiSelect
                options={members.map(m => ({ value: m._id, label: m.nombre }))}
                selected={paidByIds}
                onChange={setPaidByIds}
                placeholder="¿Quién pagó?"
              />
            </div>

            {/* Checkbox asumir gasto */}
            <label className="expense-modal__checkbox">
              <input
                className="expense-modal__checkbox-input"
                type="checkbox"
                checked={assumeExpense}
                onChange={e => setAssumeExpense(e.target.checked)}
              />
              <span>Asumir el gasto (invitar a otros)</span>
            </label>

            {/* Participantes */}
            <div className="expense-modal__field">
              <label className="expense-modal__label" htmlFor="participants">Participantes</label>
              <select
                className="expense-modal__select"
                id="participants"
                multiple
                value={selectedParticipants}
                onChange={e => setSelectedParticipants(Array.from(e.target.selectedOptions, option => option.value))}
                disabled={assumeExpense}
              >
                {members.map(m => (
                  <option key={m._id} value={m._id}>{m.nombre}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Botones */}
          <div className="expense-modal__footer">
            <button type="button" className="expense-modal__button expense-modal__button--secondary" onClick={onClose} disabled={loading}>
              Cancelar
            </button>
            <button type="submit" className="expense-modal__button expense-modal__button--primary" disabled={loading}>
              {loading ? (
                expenseToEdit ? 'Actualizando...' : 'Añadiendo...'
              ) : (
                expenseToEdit ? 'Actualizar Gasto' : 'Añadir Gasto'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddExpenseModal;
