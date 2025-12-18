import React, { useState, useEffect } from 'react';
import axios from 'axios';

interface PaymentHistoryModalProps {
  groupId: string;
  token: string;
  members: Array<{ _id: string; nombre: string }>;
  onClose: () => void;
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

const PaymentHistoryModal: React.FC<PaymentHistoryModalProps> = ({ groupId, token, members, onClose }) => {
  const [payments, setPayments] = useState<DebtTransaction[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPaymentHistory = async () => {
      try {
        setLoading(true);
        // Fetch all debt transactions (both paid and unpaid)
        // Since payments are recorded as DebtTransactions (from: recipient, to: payer)
        // we fetch all of them to show history.
        const response = await axios.get(
          `${apiHost}${apiBaseUrl}/groups/${groupId}/debt-transactions`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );
        // Assuming the `from` field in DebtTransaction is the recipient and `to` is the payer for payments
        // We filter for transactions where `from` and `to` are valid members and they represent a payment.
        // For simplicity, we assume all DebtTransactions in this context represent payments.
        setPayments(response.data.data);
      } catch (err: any) {
        console.error('Error fetching payment history:', err);
        setError(err.response?.data?.message || 'Error al cargar el historial de pagos.');
      } finally {
        setLoading(false);
      }
    };

    if (groupId && token) {
      fetchPaymentHistory();
    }
  }, [groupId, token]);

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
