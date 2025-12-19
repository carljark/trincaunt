import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

interface PaymentHistoryModalProps {
  groupId: string;
  token: string;
  members: Array<{ _id: string; nombre: string }>;
  onClose: () => void;
  onHistoryUpdated: () => void; // Prop for refreshing parent data
}

interface DebtTransaction {
  _id: string;
  from: { _id: string; nombre: string };
  to: { _id: string; nombre: string };
  amount: number;
  paid: boolean;
  createdAt: string;
}

const apiHost = import.meta.env.VITE_API_HOST;
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '/api/v1';

const PaymentHistoryModal: React.FC<PaymentHistoryModalProps> = ({ groupId, token, members, onClose, onHistoryUpdated }) => {
  const [payments, setPayments] = useState<DebtTransaction[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPaymentHistory = useCallback(async () => {
    try {
      setLoading(true);
      const response = await axios.get(
        `${apiHost}${apiBaseUrl}/groups/${groupId}/debt-transactions`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      setPayments(response.data.data);
    } catch (err: any) {
      console.error('Error fetching payment history:', err);
      setError(err.response?.data?.message || 'Error al cargar el historial de pagos.');
    } finally {
      setLoading(false);
    }
  }, [groupId, token]); // Add dependencies to useCallback

  useEffect(() => {
    if (groupId && token) {
      fetchPaymentHistory();
    }
  }, [groupId, token, fetchPaymentHistory]); // Add fetchPaymentHistory to dependencies

  const handleDeletePayment = async (transactionId: string) => {
    if (!token || !window.confirm('¿Estás seguro de que quieres eliminar este registro de pago?')) return;
    try {
      await axios.delete(
        `${apiHost}${apiBaseUrl}/debt-transactions/${transactionId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      // Refresh the payment history in the modal
      fetchPaymentHistory();
      // Also notify the parent component to refresh its data (e.g., group balance)
      onHistoryUpdated();
    } catch (err: any) {
      console.error('Error deleting payment:', err);
      setError(err.response?.data?.message || 'Error al eliminar el registro de pago.');
    }
  };

  const getUserName = (userId: string) => {
    const member = members.find(m => m._id === userId);
    return member ? member.nombre : 'Usuario Desconocido';
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h3>Historial de Pagos</h3>
        {error && <p className="error-message">{error}</p>}
        {loading ? (
          <p>Cargando historial de pagos...</p>
        ) : payments.length === 0 ? (
          <p>No hay historial de pagos registrado.</p>
        ) : (
          <ul className="payment-history-list">
            {payments.map((payment) => (
              <li key={payment._id}>
                {getUserName(payment.to._id)} pagó ${payment.amount.toFixed(2)} a {getUserName(payment.from._id)} el{' '}
                {new Date(payment.createdAt).toLocaleDateString()}
                <button onClick={() => handleDeletePayment(payment._id)} className="delete-payment-button">Eliminar</button>
              </li>
            ))}
          </ul>
        )}

        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};

export default PaymentHistoryModal;
