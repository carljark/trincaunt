/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import RecordPaymentModal from '../components/RecordPaymentModal';
import PaymentHistoryModal from '../components/PaymentHistoryModal'; // Import the new payment history modal
import AddExpenseModal from '../components/AddExpenseModal'; // Import the new AddExpenseModal

export interface IBalanceItem {
    "id": string; // "6943cb6f8084e9d54d53d790",
    "nombre": string; // "jarklos",
    "email": string; // "elcal.lico@gmail.com",
    "balance": number; // 20
}

export interface ITransactionItem {
  "from": {
      "id": string; // "6943d7fa7230c66e22f92697",
      "nombre": string; // "eve"
  },
  "to": {
      "id": string; // "6943cb6f8084e9d54d53d790",
      "nombre": string; // "jarklos"
  },
  "amount": number; // 20
}

export const checkIfUserIsParticipant = (
  expense: IExpensesItem,
  userId: string,
) => {
  return expense.participantes.some((p) => p._id === userId);
};

export const sumTransactionsToMe = (
  settlementData: ITransactionItem[],
  user: any,
) => {
  return settlementData
    .filter((tx) => tx.from.id === user?._id)
    .reduce((sum, tx) => sum + tx.amount, 0);
}

export interface ISettleGroupDebtsTransactionItem {
    from: { id: string; nombre: string; };
    to: { id: string; nombre: string; };
    amount: number;
}

export interface IParticipant {
  _id: string;
  nombre: string;
}

export interface IExpensesItem {
    "_id": string; // "69453777df074f9761305be9",
    "grupo_id": string; // "69447550bb4f27e226d4fefe",
    "descripcion": string; // "uno",
    "monto": number; // 20,
    "pagado_por": {
        "_id": string; // "6943cb6f8084e9d54d53d790",
        "nombre": string; // "jarklos"
    },
    "participantes":
        {
            "_id": string; // "6943cb6f8084e9d54d53d790",
            "nombre": string; // "jarklos"
        }[],
    "asume_gasto": boolean; // false,
    "fecha": string; // "2025-12-19T11:31:03.364Z",
    "__v": number; // 0
}

interface DebtTransaction {
  _id: string;
  from: { _id: string; nombre: string };
  to: { _id: string; nombre: string };
  amount: number;
  paid: boolean;
  createdAt: string;
}

import './GroupDetailPage.scss';
import '../components/AddExpenseModal.scss'; // Import modal styles

const formatCurrency = (amount: number) => {
  return amount.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

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
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [editingExpenseData, setEditingExpenseData] = useState({ descripcion: '', monto: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [settlementTransactions, setSettlementTransactions] = useState<ISettleGroupDebtsTransactionItem[]>([]);
  const [paymentHistory, setPaymentHistory] = useState<DebtTransaction[]>([]);
  const [showRecordPaymentModal, setShowRecordPaymentModal] = useState<boolean>(false); // State for modal visibility
  const [totalExpenses, setTotalExpenses] = useState<number>(0); // New state for total expenses
  const [myTotalExpenses, setMyTotalExpenses] = useState<number>(0); // New state for user's total expenses participation
  const [myTotalExpensesPay, setMyTotalExpensesPay] = useState<number>(0); // New state for user's total expenses
  const [myTotalDebt, setMyTotalDebt] = useState<number>(0); // New state for user's total expenses
  const [myTotalSettledIncome, setMyTotalSettledIncome] = useState<number>(0); // New state for user's settled income
  const [showPaymentHistoryModal, setShowPaymentHistoryModal] = useState<boolean>(false); // State for payment history modal
  const [activeTab, setActiveTab] = useState<'expenses' | 'balances' | 'group'>('expenses'); // New state for active tab
  const [showAddExpenseModal, setShowAddExpenseModal] = useState<boolean>(false); // State for Add Expense modal visibility

  const fetchGroupData = useCallback(async () => {
    if (!token || !groupId) return;
    setLoading(true);
    try {
      const [groupRes, expenseRes, balanceRes, settlementRes, debtTransactionsRes] = await Promise.all([
        fetch(`${apiHost}${apiBaseUrl}/groups/${groupId}`, { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch(`${apiHost}${apiBaseUrl}/groups/${groupId}/expenses`, { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch(`${apiHost}${apiBaseUrl}/groups/${groupId}/balance`, { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch(`${apiHost}${apiBaseUrl}/groups/${groupId}/settle`, { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch(`${apiHost}${apiBaseUrl}/groups/${groupId}/debt-transactions`, { headers: { 'Authorization': `Bearer ${token}` } }),
      ]);

      if (!groupRes.ok) throw new Error('Failed to fetch group details');
      if (!expenseRes.ok) throw new Error('Failed to fetch expenses');
      if (!balanceRes.ok) throw new Error('Failed to fetch balance');
      if (!settlementRes.ok) throw new Error('Failed to fetch settlement transactions');
      if (!debtTransactionsRes.ok) throw new Error('Failed to fetch debt transactions');

      const groupData = await groupRes.json();
      const expensesData = await expenseRes.json() as { data: IExpensesItem[] };
      const balanceData = await balanceRes.json();
      const settlementData = await settlementRes.json();
      const debtTransactionsData = await debtTransactionsRes.json();

      console.log('debtTransactionsData.data:', debtTransactionsData.data);
      
      setPaymentHistory(debtTransactionsData.data);

      const settledIncome = debtTransactionsData.data
        .filter((p: DebtTransaction) => p.from._id === user?._id)
        .reduce((sum: number, p: DebtTransaction) => sum + p.amount, 0);
      setMyTotalSettledIncome(settledIncome);
      
      setGroup(groupData.data);
      setExpenses(expensesData.data);
      const calculatedTotalExpenses = expensesData.data.reduce((sum: number, expense: any) => sum + expense.monto, 0);
      setTotalExpenses(calculatedTotalExpenses);

      // Calculate my total expenses participation
      const calculatedMyTotalExpensesParticipation = expensesData.data
        .filter((expense) => checkIfUserIsParticipant(expense, user?._id))
        .reduce((sum, expense) => sum + expense.monto / expense.participantes.length, 0);
      setMyTotalExpenses(calculatedMyTotalExpensesParticipation);

      // Calculate my total expenses
      const calculatedMyTotalExpenses = expensesData.data
        .filter((expense) => expense.pagado_por._id === user?._id)
        .reduce((sum, expense) => sum + expense.monto, 0);
      setMyTotalExpensesPay(calculatedMyTotalExpenses);

      const myBalance = balanceData.data.balances.find((b: IBalanceItem) => b.id === user?._id)?.balance;

      setMyTotalDebt(myBalance);

      setBalance(balanceData.data.balances);
      setSettlementTransactions(settlementData.data.transactions);
      // No longer need to set selectedParticipants here as it's managed by AddExpenseModal
      // if (groupData.data?.miembros) {
      //   setSelectedParticipants(groupData.data.miembros.map((m: any) => m._id));
      // }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [groupId, token, user?.id]);

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

  // handleAddExpense function is moved to AddExpenseModal


  const handleDeleteExpense = async (expenseId: string) => {
    if (!token || !globalThis.confirm('¿Estás seguro de que quieres borrar este gasto?')) return;
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
        body: JSON.stringify({ ...editingExpenseData, monto: Number.parseFloat(editingExpenseData.monto) })
      });
      if (res.ok) {
        setEditingExpenseId(null);
        fetchGroupData();
      } else { const data = await res.json(); throw new Error(data.message || 'Error al actualizar el gasto'); }
    } catch (err: any) { setError(err.message); }
  };

  const handleOpenRecordPaymentModal = () => setShowRecordPaymentModal(true);
  const handleCloseRecordPaymentModal = () => setShowRecordPaymentModal(false);

  const handleOpenPaymentHistoryModal = () => {
    console.log('Opening Payment History Modal');
    setShowPaymentHistoryModal(true);
  };
  const handleClosePaymentHistoryModal = () => setShowPaymentHistoryModal(false);

  // Handlers for AddExpenseModal
  const handleOpenAddExpenseModal = () => setShowAddExpenseModal(true);
  const handleCloseAddExpenseModal = () => {
    setShowAddExpenseModal(false);
    fetchGroupData(); // Refresh data after closing modal (expense might have been added)
  };

  useEffect(() => {
    // We no longer need to set paidBy here if it's passed as initial prop to modal
    // if (user?.id) {
    //   setPaidBy(user.id);
    // }
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

      <div className="tab-navigation">
        <button
          className={activeTab === 'expenses' ? 'active' : ''}
          onClick={() => setActiveTab('expenses')}
        >
          Gastos
        </button>
        <button
          className={activeTab === 'balances' ? 'active' : ''}
          onClick={() => setActiveTab('balances')}
        >
          Saldos
        </button>
        <button
          className={activeTab === 'group' ? 'active' : ''}
          onClick={() => setActiveTab('group')}
        >
          Grupo
        </button>
      </div>

      {activeTab === 'expenses' && (
        <div className="expenses-tab-content">
          <div className="expenses-summary">
            <div>
              <p><strong>Total grupo: {formatCurrency(totalExpenses)}€</strong></p>
            </div>
            <div>
              <p><strong>Mi parte: {formatCurrency(myTotalExpenses)}€</strong></p>
              <p><strong>Pagos: {formatCurrency(myTotalExpensesPay)}€</strong></p>
              <p><strong>Saldado: {formatCurrency(myTotalSettledIncome)}€</strong></p>
              {myTotalDebt >= 0 && <p className="positive-balance"><strong>Balance: {formatCurrency(myTotalDebt)}€</strong></p>}
              {myTotalDebt < 0 && <p className="negative-balance"><strong>Balance: {formatCurrency(myTotalDebt)}€</strong></p>}
            </div>
          </div>
          
          <hr/>

          <h3>Gastos del Grupo</h3>
          <ul className="expenses-list">
            {expenses.map((expense: any) => (
              <li key={expense._id}>
                <div className="expense-item">
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
                        {expense.descripcion}: {formatCurrency(expense.monto)}€
                        <span>
                          {' '}({expense.pagado_por?.nombre || '...'}{expense.asume_gasto ? ' (invita)' : ''})
                        </span>
                      </div>
                      <div className="expense-actions">
                        <button onClick={() => handleEdit(expense)} className="edit-btn" title="Editar">&#9998;</button>
                        <button onClick={() => handleDeleteExpense(expense._id)} className="delete-btn" title="Borrar">&#10006;</button>
                      </div>
                    
                  </>
                )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {activeTab === 'balances' && (
        <div className="balances-tab-content">
          <h3>Balance del Grupo</h3>
          <ul className="balance-list">{balance.map(m => <li key={m.id}><span>{m.nombre}:</span> <strong style={{color: getBalanceColor(m.balance)}}>{formatCurrency(m.balance)}€</strong></li>)}</ul>
          
          <hr/>

          <h3>Transacciones para Saldar Deudas</h3>
          {settlementTransactions.length > 0 ? (
            <ul className="settlement-list">
              {settlementTransactions.map((tx, index) => (
                <li key={index}>
                  {tx.from.nombre} debe {formatCurrency(tx.amount)}€ a {tx.to.nombre}
                </li>
              ))}
            </ul>
          ) : (
            <p>No hay transacciones pendientes para saldar deudas.</p>
          )}

          <hr/>

          <h3>Registro de pagos a usuarios</h3>
          <div className="payment-controls">
            <button onClick={handleOpenRecordPaymentModal} className="normal-button">Registrar Nuevo Pago</button>
            <button onClick={handleOpenPaymentHistoryModal} className="normal-button">Ver Historial de Pagos</button>
          </div>
        </div>
      )}

      {activeTab === 'group' && (
        <div className="group-tab-content">
          <div className="form-section">
            <h4>Añadir nuevo miembro</h4>
            <form onSubmit={handleAddMember}>
              <input type="email" placeholder="Email del usuario" value={email} onChange={e=>setEmail(e.target.value)} required />
              <button type="submit">Añadir Miembro</button>
            </form>
          </div>
          
          <hr/>

          <h4>Miembros:</h4>
          <ul className="members-list">{group.miembros.map((m:any) => <li key={m._id||m}>{typeof m==='object'?m.nombre:m}</li>)}</ul>
        </div>
      )}

      <div className="fixed-add-expense-button-container">
        <button onClick={handleOpenAddExpenseModal} className="add-expense-button">Añadir gasto</button>
      </div>

      {showRecordPaymentModal && (
        <RecordPaymentModal
          groupId={groupId!}
          token={token!}
          members={group?.miembros || []}
          onClose={handleCloseRecordPaymentModal}
          onPaymentRecorded={fetchGroupData}
        />
      )}

      {showPaymentHistoryModal && (
        <PaymentHistoryModal
          groupId={groupId!}
          token={token!}
          members={group?.miembros || []}
          onClose={handleClosePaymentHistoryModal}
          onHistoryUpdated={fetchGroupData} // Changed from onPaymentRecorded
        />
      )}

      {showAddExpenseModal && (
        <AddExpenseModal
          groupId={groupId!}
          token={token!}
          members={group?.miembros || []}
          onClose={handleCloseAddExpenseModal}
          onExpenseAdded={fetchGroupData}
          paidByInitial={user?.id || ''}
        />
      )}
    </div>
  );
};

export default GroupDetailPage;
