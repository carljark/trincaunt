import React, { useState } from 'react';
import axios from 'axios';

interface RecordPaymentModalProps {
  groupId: string;
  token: string;
  members: Array<{ _id: string; nombre: string }>;
  onClose: () => void;
  onPaymentRecorded: () => void;
}

const apiHost = import.meta.env.VITE_API_HOST;
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '/api/v1';

const RecordPaymentModal: React.FC<RecordPaymentModalProps> = ({ groupId, token, members, onClose, onPaymentRecorded }) => {
  const [fromUser, setFromUser] = useState<string>('');
  const [toUser, setToUser] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (!fromUser || !toUser || !amount || parseFloat(amount) <= 0) {
      setError('Por favor, selecciona ambos usuarios y un monto válido.');
      setLoading(false);
      return;
    }

    if (fromUser === toUser) {
      setError('No puedes registrar un pago a ti mismo.');
      setLoading(false);
      return;
    }

    try {
      await axios.post(
        `${apiHost}${apiBaseUrl}/debt-transactions`,
        {
          group: groupId,
          from: fromUser, 
          to: toUser,
          amount: parseFloat(amount),
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      onPaymentRecorded(); // Refresh data in parent component
      onClose(); // Close the modal
    } catch (err: any) {
      console.error('Error recording payment:', err);
      setError(err.response?.data?.message || 'Error al registrar el pago.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h3>Registrar Nuevo Pago</h3>
        {error && <p className="error-message">{error}</p>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="fromUser">Pagador:</label>
            <select id="fromUser" value={fromUser} onChange={(e) => setFromUser(e.target.value)} required>
              <option value="">Seleccionar...</option>
              {members.map((member) => (
                <option key={member._id} value={member._id}>
                  {member.nombre}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="toUser">Receptor:</label>
            <select id="toUser" value={toUser} onChange={(e) => setToUser(e.target.value)} required>
              <option value="">Seleccionar...</option>
              {members.map((member) => (
                <option key={member._id} value={member._id}>
                  {member.nombre}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="amount">Monto:</label>
            <input
              type="number"
              id="amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              min="0.01"
              step="0.01"
              required
            />
          </div>

          <div className="modal-actions">
            <button type="submit" disabled={loading}>
              {loading ? 'Registrando...' : 'Registrar Pago'}
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

export default RecordPaymentModal;
