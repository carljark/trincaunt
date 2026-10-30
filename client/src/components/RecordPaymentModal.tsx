import React, { useState } from 'react';
import axios from 'axios';
import Dialog from './Dialog';
import './RecordPaymentModal.scss';

interface RecordPaymentModalProps {
  groupId: string;
  token: string;
  members: Array<{ _id: string; nombre: string }>;
  onClose: () => void;
  onPaymentRecorded: () => void;
}

const apiHost = import.meta.env.VITE_API_HOST;
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '/api/v1';

const formatEuros = (amount: number) =>
  amount.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

// Admite coma decimal, como se escribe en España
const parseAmount = (value: string) => parseFloat(value.replace(',', '.'));

const RecordPaymentModal: React.FC<RecordPaymentModalProps> = ({ groupId, token, members, onClose, onPaymentRecorded }) => {
  const [fromUser, setFromUser] = useState<string>('');
  const [toUser, setToUser] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const parsedAmount = parseAmount(amount);
  const nameOf = (id: string) => members.find(m => m._id === id)?.nombre;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!fromUser || !toUser || !(parsedAmount > 0)) {
      setError('Por favor, selecciona ambos usuarios y un monto válido.');
      return;
    }

    if (fromUser === toUser) {
      setError('No puedes registrar un pago a ti mismo.');
      return;
    }

    setLoading(true);
    try {
      await axios.post(
        `${apiHost}${apiBaseUrl}/debt-transactions`,
        {
          group: groupId,
          from: fromUser,
          to: toUser,
          amount: parsedAmount,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      onPaymentRecorded(); // Refresh data in parent component
      onClose(); // Close the modal
    } catch (err) {
      console.error('Error recording payment:', err);
      setError((axios.isAxiosError(err) && err.response?.data?.message) || 'Error al registrar el pago.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      title="Registrar pago"
      onClose={onClose}
      onSubmit={handleSubmit}
      busy={loading}
      footer={
        <>
          <button type="button" className="record-payment__button record-payment__button--secondary" onClick={onClose} disabled={loading}>
            Cancelar
          </button>
          <button type="submit" className="record-payment__button record-payment__button--primary" disabled={loading}>
            {loading ? 'Registrando...' : 'Registrar pago'}
          </button>
        </>
      }
    >
      <div className="record-payment">
        {error && <p className="record-payment__error" role="alert">{error}</p>}

        <label className="record-payment__field">
          <span className="record-payment__label">Quién paga</span>
          <select className="record-payment__select" value={fromUser} onChange={(e) => setFromUser(e.target.value)} required>
            <option value="">Elige a alguien</option>
            {members.map((member) => (
              <option key={member._id} value={member._id}>
                {member.nombre}
              </option>
            ))}
          </select>
        </label>

        <label className="record-payment__field">
          <span className="record-payment__label">A quién</span>
          <select className="record-payment__select" value={toUser} onChange={(e) => setToUser(e.target.value)} required>
            <option value="">Elige a alguien</option>
            {members.map((member) => (
              <option key={member._id} value={member._id} disabled={member._id === fromUser}>
                {member.nombre}
              </option>
            ))}
          </select>
        </label>

        <label className="record-payment__field">
          <span className="record-payment__label">Importe</span>
          <span className="record-payment__amount">
            <input
              className="record-payment__input"
              type="text"
              inputMode="decimal"
              placeholder="0,00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
            <span className="record-payment__currency" aria-hidden="true">€</span>
          </span>
        </label>

        {fromUser && toUser && fromUser !== toUser && parsedAmount > 0 && (
          <p className="record-payment__summary">
            {nameOf(fromUser)} paga {formatEuros(parsedAmount)} a {nameOf(toUser)}
          </p>
        )}
      </div>
    </Dialog>
  );
};

export default RecordPaymentModal;
