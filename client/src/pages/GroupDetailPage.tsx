import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import RecordPaymentModal from '../components/RecordPaymentModal';
import PaymentHistoryModal from '../components/PaymentHistoryModal'; // Import the new payment history modal

import './GroupDetailPage.scss';

const apiHost = import.meta.env.VITE_API_HOST;
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '/api/v1';

const GroupDetailPage: React.FC = () => {
  const { groupId } = useParams<{ groupId: string }>();
  const navigate = useNavigate(); // Initialize useNavigate
  const { token, user } = useAuth();
  const [group, setGroup] = useState<any>(null);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [balance, setBalance] = useState<any[]>([]);
  const [email, setEmail] = useState('');
  const [expenseData, setExpenseData] = useState({ description: '', amount: '' });
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [editingExpenseData, setEditingExpenseData] = useState({ descripcion: '', monto: '' });
  const [paidBy, setPaidBy] = useState<string>('');
  const [assumeExpense, setAssumeExpense] = useState<boolean>(false);
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [settlementTransactions, setSettlementTransactions] = useState<any[]>([]);
  const [showRecordPaymentModal, setShowRecordPaymentModal] = useState<boolean>(false); // State for modal visibility
  const [totalExpenses, setTotalExpenses] = useState<number>(0); // New state for total expenses
  const [showPaymentHistoryModal, setShowPaymentHistoryModal] = useState<boolean>(false); // State for payment history modal

  const fetchGroupData = useCallback(async () => {
    if (!token || !groupId) return;
    setLoading(true);
    try {
      const [groupRes, expenseRes, balanceRes, settlementRes] = await Promise.all([
        fetch(`${apiHost}${apiBaseUrl}/groups/${groupId}`, { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch(`${apiHost}${apiBaseUrl}/groups/${groupId}/expenses`, { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch(`${apiHost}${apiBaseUrl}/groups/${groupId}/balance`, { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch(`${apiHost}${apiBaseUrl}/groups/${groupId}/settle`, { headers: { 'Authorization': `Bearer ${token}` } }),
      ]);

      if (!groupRes.ok) throw new Error('Failed to fetch group details');
      if (!expenseRes.ok) throw new Error('Failed to fetch expenses');
      if (!balanceRes.ok) throw new Error('Failed to fetch balance');
      if (!settlementRes.ok) throw new Error('Failed to fetch settlement transactions');

      const groupData = await groupRes.json();
      const expensesData = await expenseRes.json();
      const balanceData = await balanceRes.json();
      const settlementData = await settlementRes.json();
      
      setGroup(groupData.data);
      setExpenses(expensesData.data);
      const calculatedTotalExpenses = expensesData.data.reduce((sum: number, expense: any) => sum + expense.monto, 0);
      setTotalExpenses(calculatedTotalExpenses);
      setBalance(balanceData.data.balances);
      setSettlementTransactions(settlementData.data.transactions);
      if (groupData.data?.miembros) {
        setSelectedParticipants(groupData.data.miembros.map((m: any) => m._id));
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [groupId, token]);

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !groupId || !email) return;

    try {
      const res = await fetch(`${apiHost}${apiBaseUrl}/groups/${groupId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ email })
      });
      if (res.ok) {
        fetchGroupData();
        setEmail('');
        alert('Miembro añadido con éxito');
      } else { const data = await res.json(); throw new Error(data.message || 'Error al añadir miembro'); }
    } catch (err: any) { setError(err.message); }
  };

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !groupId || !expenseData.description || !expenseData.amount) return;

    const expensePayload: any = {
      descripcion: expenseData.description,
      monto: parseFloat(expenseData.amount),
      grupo_id: groupId,
      pagado_por: paidBy,
      assumeExpense: assumeExpense,
    };

    if (!assumeExpense) {
      expensePayload.participantes = selectedParticipants;
    }

    try {
      const res = await fetch(`${apiHost}${apiBaseUrl}/expenses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(expensePayload)
      });
      if (res.ok) {
        setExpenseData({ description: '', amount: '' });
        setAssumeExpense(false);
        if (group?.miembros) {
          setSelectedParticipants(group.miembros.map((m: any) => m._id));
        }
        fetchGroupData();
      } else { const data = await res.json(); throw new Error(data.message || 'Error al añadir gasto'); }
    } catch (err: any) { setError(err.message); }
  };

  const handleDeleteExpense = async (expenseId: string) => {
    if (!token || !window.confirm('¿Estás seguro de que quieres borrar este gasto?')) return;
    try {
      const res = await fetch(`${apiHost}${apiBaseUrl}/expenses/${expenseId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        fetchGroupData();
      } else { const data = await res.json(); throw new Error(data.message || 'Error al borrar el gasto'); }
    } catch (err: any) { setError(err.message); }
  };

  const handleEdit = (expense: any) => {
    setEditingExpenseId(expense._id);
    setEditingExpenseData({ descripcion: expense.descripcion, monto: expense.monto });
  };

  const handleCancelEdit = () => {
    setEditingExpenseId(null);
  };

  const handleUpdateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !editingExpenseId) return;
    try {
      const res = await fetch(`${apiHost}${apiBaseUrl}/expenses/${editingExpenseId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ ...editingExpenseData, monto: parseFloat(editingExpenseData.monto) })
      });
      if (res.ok) {
        setEditingExpenseId(null);
        fetchGroupData();
      } else { const data = await res.json(); throw new Error(data.message || 'Error al actualizar el gasto'); }
    } catch (err: any) { setError(err.message); }
  };

  const handleMarkDebtAsPaid = async (transactionId: string) => {
    if (!token || !window.confirm('¿Estás seguro de que quieres marcar esta deuda como pagada?')) return;
    try {
      const res = await fetch(`${apiHost}${apiBaseUrl}/debt-transactions/${transactionId}/pay`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        // Optionally refetch all data or just update the debtTransactions state
        fetchGroupData(); // Refetch all data to update balances and debt lists
      } else {
        const data = await res.json();
        throw new Error(data.message || 'Error al marcar la deuda como pagada');
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleOpenRecordPaymentModal = () => setShowRecordPaymentModal(true);
  const handleCloseRecordPaymentModal = () => setShowRecordPaymentModal(false);

  const handleOpenPaymentHistoryModal = () => {
    console.log('Opening Payment History Modal');
    setShowPaymentHistoryModal(true);
  };
  const handleClosePaymentHistoryModal = () => setShowPaymentHistoryModal(false);

  useEffect(() => {
    if (user?.id) {
      setPaidBy(user.id);
    }
    fetchGroupData();
  }, [fetchGroupData, user?.id]);
  
  const getBalanceColor = (amount: number) => {
    if (amount > 0) return 'green';
    if (amount < 0) return 'red';
    return 'black';
  };

  if (loading) return <p>Cargando...</p>;
  if (error) return <p className="error-message">Error: {error}</p>;
  if (!group) return <p>Grupo no encontrado.</p>;

  return (
    <div className="group-detail-page">
      <button onClick={() => navigate(-1)} className="back-button">Volver</button>
      <h2>{group.nombre}</h2>
      
      <h3>Balance del Grupo</h3>
      <ul className="balance-list">{balance.map(m => <li key={m.id}><span>{m.nombre}:</span> <strong style={{color: getBalanceColor(m.balance)}}>${m.balance.toFixed(2)}</strong></li>)}</ul>
      <p><strong>Total Gastos del Grupo: ${totalExpenses.toFixed(2)}</strong></p>
      
      <hr/>
      
      <h3>Transacciones para Saldar Deudas</h3>
      {settlementTransactions.length > 0 ? (
        <ul className="settlement-list">
          {settlementTransactions.map((tx, index) => (
            <li key={index}>
              {tx.from.nombre} debe ${tx.amount.toFixed(2)} a {tx.to.nombre}
            </li>
          ))}
        </ul>
      ) : (
        <p>No hay transacciones pendientes para saldar deudas.</p>
      )}

      <hr/>

      <h3>Registro de pagos a usuarios</h3>
      <div className="payment-controls">
        <button onClick={handleOpenRecordPaymentModal} className="record-payment-button">Registrar Nuevo Pago</button>
        <button onClick={handleOpenPaymentHistoryModal} className="view-history-button">Ver Historial de Pagos</button>
      </div>

      <hr/>
      
      <div className="form-section">
        <h4>Añadir nuevo miembro</h4>
        <form onSubmit={handleAddMember}>
          <input type="email" placeholder="Email del usuario" value={email} onChange={e=>setEmail(e.target.value)} required />
          <button type="submit">Añadir Miembro</button>
        </form>
      </div>

      <hr/>

      <h3>Gastos del Grupo</h3>
      <ul className="expenses-list">
        {expenses.map((expense: any) => (
          <li key={expense._id}>
            {editingExpenseId === expense._id ? (
              <form onSubmit={handleUpdateExpense} className="edit-form">
                <input type="text" value={editingExpenseData.descripcion} onChange={e=>setEditingExpenseData({...editingExpenseData, descripcion: e.target.value})} required/>
                <input type="number" value={editingExpenseData.monto} onChange={e=>setEditingExpenseData({...editingExpenseData, monto: e.target.value})} required/>
                <div className="expense-actions">
                  <button type="submit">Guardar</button>
                  <button type="button" onClick={handleCancelEdit}>Cancelar</button>
                </div>
              </form>
            ) : (
              <>
                <div className="expense-info">
                  {expense.descripcion}: ${expense.monto} 
                  <span>
                    (Pagado por: {expense.pagado_por?.nombre || '...'} {expense.asume_gasto ? '(invita)' : ''})
                  </span>
                </div>
                <div className="expense-actions">
                  <button onClick={() => handleEdit(expense)} className="edit-btn">Editar</button>
                  <button onClick={() => handleDeleteExpense(expense._id)} className="delete-btn">Borrar</button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>

      <div className="form-section">
        <h4>Añadir Nuevo Gasto</h4>
        <form onSubmit={handleAddExpense}>
          <input type="text" placeholder="Descripción" value={expenseData.description} onChange={e => setExpenseData({ ...expenseData, description: e.target.value })} required />
          <input type="number" placeholder="Monto" value={expenseData.amount} onChange={e => setExpenseData({ ...expenseData, amount: e.target.value })} required />
          
          <div>
            <label htmlFor="paidBy">Pagado por:</label>
            <select id="paidBy" value={paidBy} onChange={e => setPaidBy(e.target.value)}>
              {group?.miembros.map((m: any) => (
                <option key={m._id} value={m._id}>{m.nombre}</option>
              ))}
            </select>
          </div>

          <div className="checkbox-container">
            <label>
              <input type="checkbox" checked={assumeExpense} onChange={e => setAssumeExpense(e.target.checked)} />
              Asumir el gasto (invita)
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
              {group?.miembros.map((m: any) => (
                <option key={m._id} value={m._id}>{m.nombre}</option>
              ))}
            </select>
          </div>

          <button type="submit">Añadir Gasto</button>
        </form>
      </div>
      
      <hr/>

      <h4>Miembros:</h4>
      <ul className="members-list">{group.miembros.map((m:any) => <li key={m._id||m}>{typeof m==='object'?m.nombre:m}</li>)}</ul>

      {showRecordPaymentModal && (
        <RecordPaymentModal
          groupId={groupId!}
          token={token!}
          members={group?.miembros || []}
          onClose={handleCloseRecordPaymentModal}
          onPaymentRecorded={fetchGroupData}
        />
      )}

      {console.log('Rendering PaymentHistoryModal, showPaymentHistoryModal is', showPaymentHistoryModal)}
      {showPaymentHistoryModal && (
        <PaymentHistoryModal
          groupId={groupId!}
          token={token!}
          members={group?.miembros || []}
          onClose={handleClosePaymentHistoryModal}
          onPaymentRecorded={fetchGroupData} // Pass this prop to refresh parent data
        />
      )}
    </div>
  );
};

export default GroupDetailPage;
