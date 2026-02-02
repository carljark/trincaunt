import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import RecordPaymentModal from '../components/RecordPaymentModal';
import PaymentHistoryModal from '../components/PaymentHistoryModal';
import AddExpenseModal from '../components/AddExpenseModal';
import { IExpensePopulated } from '../types/expense';
import { IGroup } from '../types/group';
import { IBalance } from '../types/balance';
import { ITransaction, ISettleGroupDebtsTransaction, IDebtTransaction } from '../types/transaction';
import { IUser } from '../types/user';

export const checkIfUserIsParticipant = (
  expense: IExpensePopulated,
  userId: string,
) => {
  return expense.participantes.some((p) => p._id === userId);
};

export const sumTransactionsToMe = (
  settlementData: ITransaction[],
  user: IUser | null,
) => {
  return settlementData
    .filter((tx) => tx.from.id === user?._id)
    .reduce((sum, tx) => sum + tx.amount, 0);
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
  const isGlobal = groupId === 'global';
  const navigate = useNavigate(); // Initialize useNavigate
  const { token, user } = useAuth();
  const [group, setGroup] = useState<IGroup | null>(null);
  const [expenses, setExpenses] = useState<IExpensePopulated[]>([]);
  const [balance, setBalance] = useState<IBalance[]>([]);
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [settlementTransactions, setSettlementTransactions] = useState<ISettleGroupDebtsTransaction[]>([]);
  const [paymentHistory, setPaymentHistory] = useState<IDebtTransaction[]>([]);
  const [showRecordPaymentModal, setShowRecordPaymentModal] = useState<boolean>(false);
  const [totalExpenses, setTotalExpenses] = useState<number>(0);
  const [myTotalExpenses, setMyTotalExpenses] = useState<number>(0);
  const [myTotalExpensesPay, setMyTotalExpensesPay] = useState<number>(0);
  const [myTotalDebt, setMyTotalDebt] = useState<number>(0);
  const [myTotalSettledIncome, setMyTotalSettledIncome] = useState<number>(0);
  const [showPaymentHistoryModal, setShowPaymentHistoryModal] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'expenses' | 'balances' | 'group'>('expenses');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [showAddExpenseModal, setShowAddExpenseModal] = useState<boolean>(false);
  const [expenseToEdit, setExpenseToEdit] = useState<IExpensePopulated | undefined>(undefined);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [descriptionFilter, setDescriptionFilter] = useState('');
  const [dateFromFilter, setDateFromFilter] = useState('');
  const [dateToFilter, setDateToFilter] = useState('');
  const [payerFilter, setPayerFilter] = useState('all');
  const [showFilters, setShowFilters] = useState(false);
  const [groupCategories, setGroupCategories] = useState<string[]>([]);

  const sortedExpenses = [...expenses].sort((a, b) => {
    const dateA = new Date(a.fecha).getTime();
    const dateB = new Date(b.fecha).getTime();
    if (sortOrder === 'desc') {
      return dateB - dateA;
    } else {
      return dateA - dateB;
    }
  });

  const filteredExpenses = sortedExpenses.filter((expense: IExpensePopulated) => {
    if (categoryFilter !== 'all' && !expense.categoria?.includes(categoryFilter)) {
      return false;
    }
    if (descriptionFilter && !new RegExp(descriptionFilter, 'i').test(expense.descripcion)) {
      return false;
    }
    if (dateFromFilter && new Date(expense.fecha) < new Date(dateFromFilter)) {
      return false;
    }
    if (dateToFilter && new Date(expense.fecha) > new Date(dateToFilter)) {
      return false;
    }
    if (payerFilter !== 'all' && expense.pagado_por._id !== payerFilter) {
      return false;
    }
    return true;
  });

  const totalFilteredExpenses = filteredExpenses.reduce((sum, expense) => sum + expense.monto, 0);

  const clearAllFilters = () => {
    setCategoryFilter('all');
    setDescriptionFilter('');
    setDateFromFilter('');
    setDateToFilter('');
    setPayerFilter('all');
  };

  const fetchGlobalData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
        const res = await fetch(`${apiHost}${apiBaseUrl}/expenses/global`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Failed to fetch global expenses');
        const expensesData = await res.json();

        setGroup({ _id: 'global', nombre: 'Global', miembros: [], creado_por: user?._id || '', fecha_creacion: new Date().toISOString() });
        setExpenses(expensesData.data);
        setBalance([]);
        setSettlementTransactions([]);
        setPaymentHistory([]);
        setTotalExpenses(expensesData.data.reduce((sum: number, expense: any) => sum + expense.monto, 0));
        const allCategories: (string[] | undefined)[] = expensesData.data.map((e: any) => e.categoria);
        const flattenedCategories: (string | undefined)[] = allCategories.flat();
        const filteredCategories: string[] = flattenedCategories.filter((c): c is string => !!c);
        const uniqueCategories: string[] = [...new Set(filteredCategories)];
        setGroupCategories(uniqueCategories.sort());

    } catch (err: unknown) {
        if (err instanceof Error) {
            setError(err.message);
        } else {
            setError('An unknown error occurred');
        }
    } finally {
        setLoading(false);
    }
  }, [token, user?._id]);

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
      const expensesData = await expenseRes.json() as { data: IExpensePopulated[] };
      const balanceData = await balanceRes.json();
      const settlementData = await settlementRes.json();
      const debtTransactionsData = await debtTransactionsRes.json();

      const categories = [...new Set(expensesData.data.flatMap(e => e.categoria).filter((c): c is string => !!c))];
      setGroupCategories(categories.sort());
      
      setPaymentHistory(debtTransactionsData.data);

      const settledIncome = debtTransactionsData.data
        .filter((p: IDebtTransaction) => p.from._id === user?._id)
        .reduce((sum: number, p: IDebtTransaction) => sum + p.amount, 0);
      setMyTotalSettledIncome(settledIncome);
      
      setGroup(groupData.data);
      setExpenses(expensesData.data);
      const calculatedTotalExpenses = expensesData.data.reduce((sum, expense) => sum + expense.monto, 0);
      setTotalExpenses(calculatedTotalExpenses);

      const calculatedMyTotalExpensesParticipation = expensesData.data
        .filter((expense) => checkIfUserIsParticipant(expense, user?._id || ''))
        .reduce((sum, expense) => sum + expense.monto / expense.participantes.length, 0);
      setMyTotalExpenses(calculatedMyTotalExpensesParticipation);

      const calculatedMyTotalExpenses = expensesData.data
        .filter((expense) => expense.pagado_por._id === user?._id)
        .reduce((sum, expense) => sum + expense.monto, 0);
      setMyTotalExpensesPay(calculatedMyTotalExpenses);

      const myBalance = balanceData.data.balances.find((b: IBalance) => b.id === user?._id)?.balance;
      setMyTotalDebt(myBalance || 0);

      setBalance(balanceData.data.balances);
      setSettlementTransactions(settlementData.data.transactions);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('An unknown error occurred');
      }
    } finally {
      setLoading(false);
    }
  }, [groupId, token, user?._id]);

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
      } else { 
        const data = await res.json(); 
        throw new Error(data.message || 'Error al añadir miembro'); 
      }
    } catch (err: unknown) { 
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('An unknown error occurred');
      }
    }
  };

  const handleDeleteExpense = async (expenseId: string) => {
    if (!token || !globalThis.confirm('¿Estás seguro de que quieres borrar este gasto?')) return;
    try {
      const res = await fetch(`${apiHost}${apiBaseUrl}/expenses/${expenseId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        fetchGroupData();
      } else { 
        const data = await res.json(); 
        throw new Error(data.message || 'Error al borrar el gasto'); 
      }
    } catch (err: unknown) { 
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('An unknown error occurred');
      }
    }
  };
  
  const handleEdit = (expense: IExpensePopulated) => {
    setExpenseToEdit(expense);
    setShowAddExpenseModal(true);
  };

  const handleOpenRecordPaymentModal = () => setShowRecordPaymentModal(true);
  const handleCloseRecordPaymentModal = () => setShowRecordPaymentModal(false);

  const handleOpenPaymentHistoryModal = () => {
    console.log('Opening Payment History Modal');
    setShowPaymentHistoryModal(true);
  };
  const handleClosePaymentHistoryModal = () => setShowPaymentHistoryModal(false);

  const handleOpenAddExpenseModal = () => {
    setExpenseToEdit(undefined);
    setShowAddExpenseModal(true);
  }
  const handleCloseAddExpenseModal = () => {
    setShowAddExpenseModal(false);
    setExpenseToEdit(undefined);
    if (isGlobal) {
      fetchGlobalData();
    } else {
      fetchGroupData();
    }
  };

  useEffect(() => {
    if (isGlobal) {
      fetchGlobalData();
    } else {
      fetchGroupData();
    }
  }, [isGlobal, fetchGroupData, fetchGlobalData]);
  
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

      {!isGlobal && (
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
      )}

      {activeTab === 'expenses' && (
        <div className="expenses-tab-content">
          <div className="expenses-summary">
            <div>
              <p><strong>Total: {formatCurrency(totalExpenses)}€</strong></p>
            </div>
            {!isGlobal && (
              <div>
                <p><strong>Mi parte: {formatCurrency(myTotalExpenses)}€</strong></p>
                <p><strong>Pagos: {formatCurrency(myTotalExpensesPay)}€</strong></p>
                <p><strong>Saldado: {formatCurrency(myTotalSettledIncome)}€</strong></p>
                {myTotalDebt >= 0 && <p className="positive-balance"><strong>Balance: {formatCurrency(myTotalDebt)}€</strong></p>}
                {myTotalDebt < 0 && <p className="negative-balance"><strong>Balance: {formatCurrency(myTotalDebt)}€</strong></p>}
              </div>
            )}
          </div>
          
          <hr/>

          <div className="filters-accordion-container">
            <button className="filters-accordion-toggle" onClick={() => setShowFilters(!showFilters)}>
              <h3>Filtros {showFilters ? '▲' : '▼'}</h3>
              <span>Gastos Filtrados: {formatCurrency(totalFilteredExpenses)}€</span>
            </button>
            {showFilters && (
              <>
                <div className="filters">
                  <label>
                    Categoría:
                    <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
                        <option value="all">Todas</option>
                        {groupCategories.map(category => (
                          <option key={category} value={category}>{category}</option>
                        ))}
                    </select>
                  </label>
                  <label>
                    Descripción:
                    <input type="text" placeholder="Filtrar..." value={descriptionFilter} onChange={e => setDescriptionFilter(e.target.value)} />
                  </label>
                  {!isGlobal && (
                    <label>
                      Pagado por:
                      <select value={payerFilter} onChange={e => setPayerFilter(e.target.value)}>
                          <option value="all">Todos</option>
                          {group?.miembros.map((member) => (
                              <option key={member._id} value={member._id}>{member.nombre}</option>
                          ))}
                      </select>
                    </label>
                  )}
                  <label>
                    Desde:
                    <div className="date-filter-container">
                      <input type="date" value={dateFromFilter} onChange={e => setDateFromFilter(e.target.value)} />
                      <button onClick={() => setDateFromFilter('')} className="clear-date-btn">X</button>
                    </div>
                  </label>
                  <label>
                    Hasta:
                    <div className="date-filter-container">
                      <input type="date" value={dateToFilter} onChange={e => setDateToFilter(e.target.value)} />
                      <button onClick={() => setDateToFilter('')} className="clear-date-btn">X</button>
                    </div>
                  </label>
                  <button onClick={clearAllFilters} className="clear-all-btn">Limpiar filtros</button>
                </div>
              </>
            )}
          </div>

          <div className="expenses-header">
            <h3>Gastos del Grupo</h3>
            <button onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')} className="sort-button">
              Ordenar ({sortOrder === 'desc' ? 'Más recientes primero' : 'Más antiguos primero'})
            </button>
          </div>
          <ul className="expenses-list">
            {filteredExpenses.map((expense: any) => (
              <li key={expense._id}>
                <div className="expense-item">
                  <div className="expense-info">
                    <div>
                      {isGlobal && <strong>{expense.grupo_nombre}: </strong>}
                      {expense.descripcion} ({expense.categoria?.join(', ')}): 
                      <strong> {formatCurrency(expense.monto)}€</strong>
                      {isGlobal && <span> (de {formatCurrency(expense.original_monto)}€)</span>}
                    </div>
                    <div className="expense-date">{new Date(expense.fecha).toLocaleDateString()}</div>
                    {!isGlobal && (
                      <div>
                        <span>
                          {' '}({expense.pagado_por?.nombre || '...'}{expense.asume_gasto ? ' (invita)' : ''})
                        </span>
                      </div>
                    )}
                  </div>
                  {!isGlobal && (
                    <div className="expense-actions">
                      <button onClick={() => handleEdit(expense)} className="edit-btn" title="Editar">&#9998;</button>
                      <button onClick={() => handleDeleteExpense(expense._id)} className="delete-btn" title="Borrar">&#10006;</button>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!isGlobal && activeTab === 'balances' && (
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

      {!isGlobal && activeTab === 'group' && (
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
          <ul className="members-list">{group.miembros.map((m: IUser) => <li key={m._id}>{m.nombre}</li>)}</ul>
        </div>
      )}

      {!isGlobal && (
        <div className="fixed-add-expense-button-container">
          <button onClick={handleOpenAddExpenseModal} className="add-expense-button">Añadir gasto</button>
        </div>
      )}

      {!isGlobal && showRecordPaymentModal && (
        <RecordPaymentModal
          groupId={groupId!}
          token={token!}
          members={group?.miembros || []}
          onClose={handleCloseRecordPaymentModal}
          onPaymentRecorded={fetchGroupData}
        />
      )}

      {!isGlobal && showPaymentHistoryModal && (
        <PaymentHistoryModal
          groupId={groupId!}
          token={token!}
          members={group?.miembros || []}
          onClose={handleClosePaymentHistoryModal}
          onHistoryUpdated={fetchGroupData}
        />
      )}

      {!isGlobal && showAddExpenseModal && (
        <AddExpenseModal
          groupId={groupId!}
          token={token!}
          members={group?.miembros || []}
          onClose={handleCloseAddExpenseModal}
          onExpenseAction={fetchGroupData}
          paidByInitial={user?._id || ''}
          expenseToEdit={expenseToEdit}
        />
      )}
    </div>
  );
};

export default GroupDetailPage;
