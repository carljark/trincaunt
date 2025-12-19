/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect } from 'react';

interface AddExpenseModalProps {
  groupId: string;
  token: string;
  members: Array<{ _id: string; nombre: string }>;
  onClose: () => void;
  onExpenseAdded: () => void;
  paidByInitial: string;
}

const apiHost = import.meta.env.VITE_API_HOST;
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '/api/v1';

const AddExpenseModal: React.FC<AddExpenseModalProps> = ({ groupId, token, members, onClose, onExpenseAdded, paidByInitial }) => {
  const [expenseData, setExpenseData] = useState({ description: '', amount: '' });
  const [paidBy, setPaidBy] = useState<string>(paidByInitial);
  const [assumeExpense, setAssumeExpense] = useState<boolean>(false);
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    // Initialize selected participants with all members by default
    if (members && members.length > 0) {
      setSelectedParticipants(members.map(m => m._id));
      if (!paidByInitial && members[0]) { // If paidByInitial is not set, default to first member
        setPaidBy(members[0]._id);
      }
    }
  }, [members, paidByInitial]);

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (!expenseData.description || !expenseData.amount || parseFloat(expenseData.amount) <= 0) {
      setError('Por favor, ingresa una descripción y un monto válido.');
      setLoading(false);
      return;
    }

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
      assumeExpense: assumeExpense,
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
      const res = await fetch(`${apiHost}${apiBaseUrl}/expenses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(expensePayload)
      });
      if (res.ok) {
        onExpenseAdded(); // Refresh data in parent component
        onClose(); // Close the modal
      } else { 
        const data = await res.json(); 
        setError(data.message || 'Error al añadir gasto'); 
      }
    } catch (err: any) { 
      console.error('Error adding expense:', err);
      setError('Error de red o del servidor.'); 
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h3>Añadir Nuevo Gasto</h3>
        {error && <p className="error-message">{error}</p>}
        <form onSubmit={handleAddExpense}>
          <input type="text" placeholder="Descripción" value={expenseData.description} onChange={e => setExpenseData({ ...expenseData, description: e.target.value })} required />
          <input type="number" placeholder="Monto" value={expenseData.amount} onChange={e => setExpenseData({ ...expenseData, amount: e.target.value })} required />
          
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
              {loading ? 'Añadiendo Gasto...' : 'Añadir Gasto'}
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
