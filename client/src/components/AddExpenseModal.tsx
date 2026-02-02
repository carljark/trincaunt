import React, { useState, useEffect, useRef } from 'react';
import { IExpense, IExpensePopulated } from '../types/expense';
import { IUserPopulated } from '../types/user';

interface AddExpenseModalProps {
  groupId: string;
  token: string;
  members: Array<{ _id: string; nombre: string }>;
  onClose: () => void;
  onExpenseAction: (expense: IExpense) => void; // Renamed from onExpenseAdded
  paidByInitial: string;
  expenseToEdit?: IExpensePopulated; // Changed from IExpense to IExpensePopulated
}

const apiHost = import.meta.env.VITE_API_HOST;
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '/api/v1';

const AddExpenseModal: React.FC<AddExpenseModalProps> = ({ groupId, token, members, onClose, onExpenseAction, paidByInitial, expenseToEdit }) => {
  const [expenseData, setExpenseData] = useState({
    description: expenseToEdit?.descripcion || '',
    amount: expenseToEdit?.monto.toString() || ''
  });
  const [assumeExpense, setAssumeExpense] = useState<boolean>(expenseToEdit?.asume_gasto || false);
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>(expenseToEdit?.participantes.map((p: IUserPopulated) => p._id) || []);
  const [categories, setCategories] = useState<string[]>(expenseToEdit?.categoria || []);
  const [categoryInput, setCategoryInput] = useState('');
  const [paidBy, setPaidBy] = useState<string>(paidByInitial); // New state for paidBy
  const [suggestedCategories, setSuggestedCategories] = useState<{ category: string, count: number }[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const categoryInputRef = useRef<HTMLInputElement>(null);


  useEffect(() => {
    if (expenseToEdit) {
      // If editing, set paidBy to the expense's payer
      setPaidBy(expenseToEdit.pagado_por._id.toString());
    } else if (members && members.length > 0) {
      // If adding, initialize participants with all members
      setSelectedParticipants(members.map(m => m._id));
    }
  }, [expenseToEdit, members]);

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const res = await fetch(`${apiHost}${apiBaseUrl}/expenses/categories`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.data)) {
            setSuggestedCategories(data.data);
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
    setShowSuggestions(false);
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

    // Use paidBy state variable
    if (!paidBy) {
      setError('Por favor, selecciona quién pagó el gasto.');
      setLoading(false);
      return;
    }

    const expensePayload: any = {
      descripcion: expenseData.description,
      monto: Number.parseFloat(expenseData.amount),
      grupo_id: groupId,
      pagado_por: paidBy,
      asume_gasto: assumeExpense,
      categoria: categories,
    };

    if (!assumeExpense) {
      if (selectedParticipants.length === 0) {
        setError('Por favor, selecciona al menos un participante si no asumes el gasto.');
        setLoading(false);
        return;
      }
      expensePayload.participantes = selectedParticipants;
    } else {
      // If assumeExpense is true, only the payer is the participant
      expensePayload.participantes = [paidBy];
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
        onExpenseAction(result.data); // Refresh data in parent component
        onClose(); // Close the modal
      } else {
        const data = await res.json();
        setError(data.message || `Error al ${expenseToEdit ? 'actualizar' : 'añadir'} gasto`);
      }
    } catch (err: any) {
      console.error(`Error ${expenseToEdit ? 'updating' : 'adding'} expense:`, err);
      setError('Error de red o del servidor.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h3>{expenseToEdit ? 'Editar Gasto' : 'Añadir Nuevo Gasto'}</h3>
        {error && <p className="error-message">{error}</p>}
        <form onSubmit={handleSubmitExpense}>
          <input type="text" placeholder="Descripción" value={expenseData.description} onChange={e => setExpenseData({ ...expenseData, description: e.target.value })} required />
          <input type="number" placeholder="Monto" value={expenseData.amount} onChange={e => setExpenseData({ ...expenseData, amount: e.target.value })} required />

          <div
            className="category-container"
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

          <div>
            <label htmlFor="paidBy">Pagado por:</label>
            <select id="paidBy" value={paidBy} onChange={e => setPaidBy(e.target.value)}>
              {members.map((m: any) => (
                <option key={m._id} value={m._id}>{m.nombre}</option>
              ))}
            </select>
          </div>
          <div className="checkbox-container">
            <label>
              <input
                type="checkbox"
                checked={assumeExpense}
                onChange={e => setAssumeExpense(e.target.checked)}
              />Asumir el gasto (invita)
            </label>
          </div>

          <div>
            <label htmlFor="participants">Participantes:</label>
            <select
              id="participants"
              multiple
              value={selectedParticipants}
              onChange={e => setSelectedParticipants(Array.from(e.target.selectedOptions, option => option.value))}
              disabled={assumeExpense}
            >
              {members.map((m: any) => (
                <option key={m._id} value={m._id}>{m.nombre}</option>
              ))}
            </select>
          </div>

          <div className="modal-actions">
            <button type="submit" disabled={loading}>
              {loading ? (expenseToEdit ? 'Actualizando Gasto...' : 'Añadiendo Gasto...') : (expenseToEdit ? 'Actualizar Gasto' : 'Añadir Gasto')}
            </button>
            <button type="button" onClick={onClose} disabled={loading}>
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};


export default AddExpenseModal;
