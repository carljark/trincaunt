import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import Dialog from './Dialog';
import { TrashIcon } from './icons';
import './PaymentHistoryModal.scss';

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

const formatEuros = (amount: number) =>
  amount.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });

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
    } catch (err) {
      console.error('Error fetching payment history:', err);
      setError((axios.isAxiosError(err) && err.response?.data?.message) || 'Error al cargar el historial de pagos.');
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
    } catch (err) {
      console.error('Error deleting payment:', err);
      setError((axios.isAxiosError(err) && err.response?.data?.message) || 'Error al eliminar el registro de pago.');
    }
  };

  const getUserName = (userId: string) => {
    const member = members.find(m => m._id === userId);
    return member ? member.nombre : 'Usuario Desconocido';
  };

  const sortedPayments = [...payments].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <Dialog title="Historial de pagos" onClose={onClose}>
      <div className="payment-history">
        {error && <p className="payment-history__error" role="alert">{error}</p>}
        {loading ? (
          <p className="payment-history__status">Cargando historial de pagos...</p>
        ) : payments.length === 0 ? (
          <p className="payment-history__status">No hay historial de pagos registrado.</p>
        ) : (
          <ul className="payment-history__list">
            {sortedPayments.map((payment) => {
              const description = `${getUserName(payment.from._id)} pagó a ${getUserName(payment.to._id)}`;
              return (
                <li key={payment._id} className="payment-history__item">
                  <span className="payment-history__text">
                    <span className="payment-history__who">{description}</span>
                    <span className="payment-history__date">{formatDate(payment.createdAt)}</span>
                  </span>
                  <span className="payment-history__amount">{formatEuros(payment.amount)}</span>
                  <button
                    type="button"
                    onClick={() => handleDeletePayment(payment._id)}
                    className="payment-history__delete"
                    aria-label={`Eliminar pago: ${description}, ${formatEuros(payment.amount)}`}
                    title="Eliminar"
                  >
                    <TrashIcon />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Dialog>
  );
};

export default PaymentHistoryModal;
