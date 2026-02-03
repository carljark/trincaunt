import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import RecordPaymentModal from '../components/RecordPaymentModal';
import PaymentHistoryModal from '../components/PaymentHistoryModal';
import AddExpenseModal from '../components/AddExpenseModal';
import { IExpensePopulated } from '../types/expense';
import { IGroup } from '../types/group';
import { IBalance } from '../types/balance';
import {
  ITransaction,
  ISettleGroupDebtsTransaction,
  IDebtTransaction,
} from '../types/transaction';
import { IUser } from '../types/user';

import './GroupDetailPage.scss';

// Helper to get an emoji for a category
const getCategoryIcon = (category: string) => {
  const iconMap: { [key: string]: string } = {
    Comida: '🍔',
    Transporte: '🚗',
    Alojamiento: '🏠',
    Compras: '🛒',
    Ocio: '🎬',
    Servicios: '💡',
    Otros: '💸',
    Regalos: '🎁',
    Salud: '❤️‍🩹',
    Educación: '📚',
  };
  return iconMap[category] || '💸';
};

const formatCurrency = (amount: number) => {
  return amount.toLocaleString('es-ES', {
    style: 'currency',
    currency: 'EUR',
  });
};

const apiHost = import.meta.env.VITE_API_HOST;
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '/api/v1';

const GroupDetailPage: React.FC = () => {
  const { groupId } = useParams<{ groupId: string }>();
  const isGlobal = groupId === 'global';
  const navigate = useNavigate();
  const { token, user } = useAuth();
  const [group, setGroup] = useState<IGroup | null>(null);
  const [expenses, setExpenses] = useState<IExpensePopulated[]>([]);
  const [balance, setBalance] = useState<IBalance[]>([]);
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [settlementTransactions, setSettlementTransactions] = useState<
    ISettleGroupDebtsTransaction[]
  >([]);
  const [showRecordPaymentModal, setShowRecordPaymentModal] =
    useState<boolean>(false);
  const [showPaymentHistoryModal, setShowPaymentHistoryModal] =
    useState<boolean>(false);
  const [myTotalDebt, setMyTotalDebt] = useState<number>(0);
  const [activeTab, setActiveTab] = useState<'expenses' | 'balances' | 'group'>(
    'expenses'
  );
  const [showAddExpenseModal, setShowAddExpenseModal] =
    useState<boolean>(false);
  const [expenseToEdit, setExpenseToEdit] = useState<
    IExpensePopulated | undefined
  >(undefined);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [descriptionFilter, setDescriptionFilter] = useState('');
  const [dateFromFilter, setDateFromFilter] = useState('');
  const [dateToFilter, setDateToFilter] = useState('');
  const [payerFilter, setPayerFilter] = useState('all');
  const [showFilters, setShowFilters] = useState(false);
  const [groupCategories, setGroupCategories] = useState<string[]>([]);

  const sortedExpenses = [...expenses].sort(
    (a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime()
  );

  const filteredExpenses = sortedExpenses.filter(
    (expense: IExpensePopulated) => {
      if (
        categoryFilter !== 'all' &&
        !expense.categoria?.includes(categoryFilter)
      )
        return false;
      if (
        descriptionFilter &&
        !new RegExp(descriptionFilter, 'i').test(expense.descripcion)
      )
        return false;
      if (dateFromFilter && new Date(expense.fecha) < new Date(dateFromFilter))
        return false;
      if (dateToFilter && new Date(expense.fecha) > new Date(dateToFilter))
        return false;
      if (payerFilter !== 'all' && expense.pagado_por._id !== payerFilter)
        return false;
      return true;
    }
  );

  const clearAllFilters = () => {
    setCategoryFilter('all');
    setDescriptionFilter('');
    setDateFromFilter('');
    setDateToFilter('');
    setPayerFilter('all');
  };

  const fetchData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const headers = { Authorization: `Bearer ${token}` };

      if (isGlobal) {
        const res = await fetch(`${apiHost}${apiBaseUrl}/expenses/global`, {
          headers,
        });
        if (!res.ok) throw new Error('Failed to fetch global expenses');
        const expensesData = await res.json();
        setGroup({
          _id: 'global',
          nombre: 'Global',
          miembros: [],
          creado_por: user?._id || '',
          fecha_creacion: new Date().toISOString(),
        });
        setExpenses(expensesData.data);
        const categories = [
          ...new Set(
            expensesData.data.flatMap((e: any) => e.categoria).filter(Boolean)
          ),
        ];
        setGroupCategories(categories.sort());
      } else {
        const [groupRes, expenseRes, balanceRes, settlementRes] =
          await Promise.all([
            fetch(`${apiHost}${apiBaseUrl}/groups/${groupId}`, { headers }),
            fetch(`${apiHost}${apiBaseUrl}/groups/${groupId}/expenses`, {
              headers,
            }),
            fetch(`${apiHost}${apiBaseUrl}/groups/${groupId}/balance`, {
              headers,
            }),
            fetch(`${apiHost}${apiBaseUrl}/groups/${groupId}/settle`, {
              headers,
            }),
          ]);

        if (!groupRes.ok) throw new Error('Failed to fetch group details');
        const groupData = await groupRes.json();
        const expensesData = await expenseRes.json();
        const balanceData = await balanceRes.json();
        const settlementData = await settlementRes.json();

        setGroup(groupData.data);
        setExpenses(expensesData.data);
        setBalance(balanceData.data.balances);
        setSettlementTransactions(settlementData.data.transactions);

        const myBalance =
          balanceData.data.balances.find((b: IBalance) => b.id === user?._id)
            ?.balance || 0;
        setMyTotalDebt(myBalance);

        const categories = [
          ...new Set(
            expensesData.data.flatMap((e: any) => e.categoria).filter(Boolean)
          ),
        ];
        setGroupCategories(categories.sort());
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [groupId, token, user?._id, isGlobal]);

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !groupId || !email) return;
    try {
      const res = await fetch(
        `${apiHost}${apiBaseUrl}/groups/${groupId}/members`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ email }),
        }
      );
      if (res.ok) {
        fetchData();
        setEmail('');
        alert('Miembro añadido con éxito');
      } else {
        const data = await res.json();
        throw new Error(data.message || 'Error al añadir miembro');
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDeleteExpense = async (expenseId: string) => {
    if (
      !token ||
      !window.confirm('¿Estás seguro de que quieres borrar este gasto?')
    )
      return;
    try {
      const res = await fetch(`${apiHost}${apiBaseUrl}/expenses/${expenseId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        fetchData();
      } else {
        const data = await res.json();
        throw new Error(data.message || 'Error al borrar el gasto');
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleEdit = (expense: IExpensePopulated) => {
    setExpenseToEdit(expense);
    setShowAddExpenseModal(true);
  };

  const handleCloseAddExpenseModal = () => {
    setShowAddExpenseModal(false);
    setExpenseToEdit(undefined);
    fetchData();
  };

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading)
    return (
      <div className="page-container">
        <p>Cargando...</p>
      </div>
    );
  if (error)
    return (
      <div className="page-container">
        <p className="error-message">Error: {error}</p>
      </div>
    );
  if (!group)
    return (
      <div className="page-container">
        <p>Grupo no encontrado.</p>
      </div>
    );

  return (
    <div className="page-container group-detail-page">
      <header className="header">
        <button onClick={() => navigate(-1)} className="back-button">
          ←
        </button>
        <h2 className="group-title">{group.nombre}</h2>
      </header>

      {!isGlobal && (
        <>
          <div className="balance-summary">
            <p className="balance-title">Tu Saldo</p>
            <p
              className={`balance-amount ${myTotalDebt < 0 ? 'negative' : ''}`}
            >
              {formatCurrency(myTotalDebt)}
            </p>
          </div>

          <div className="action-buttons">
            <button
              className="button action-button"
              onClick={() => setShowPaymentHistoryModal(true)}
            >
              Ver Extracto
            </button>
            <button
              className="button action-button"
              onClick={() => setActiveTab('balances')}
            >
              Acertar Cuentas
            </button>
          </div>
        </>
      )}

      {!isGlobal && (
        <nav className="tab-navigation">
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
        </nav>
      )}

      <div className="tab-content">
        {activeTab === 'expenses' && (
          <div className="expenses-tab-content">
            <div className="filters-accordion-container">
              <button
                className="filters-accordion-toggle"
                onClick={() => setShowFilters(!showFilters)}
              >
                Filtrar Gastos {showFilters ? '▲' : '▼'}
              </button>
              {showFilters && (
                <div className="filters">
                  <label>
                    Categoría:
                    <select
                      value={categoryFilter}
                      onChange={e => setCategoryFilter(e.target.value)}
                    >
                      <option value="all">Todas</option>
                      {groupCategories.map(cat => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Descripción:
                    <input
                      type="text"
                      placeholder="Buscar..."
                      value={descriptionFilter}
                      onChange={e => setDescriptionFilter(e.target.value)}
                    />
                  </label>
                  {!isGlobal && (
                    <label>
                      Pagado por:
                      <select
                        value={payerFilter}
                        onChange={e => setPayerFilter(e.target.value)}
                      >
                        <option value="all">Todos</option>
                        {group?.miembros.map(m => (
                          <option key={m._id} value={m._id}>
                            {m.nombre}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <label>
                    Desde:
                    <input
                      type="date"
                      value={dateFromFilter}
                      onChange={e => setDateFromFilter(e.target.value)}
                    />
                  </label>
                  <label>
                    Hasta:
                    <input
                      type="date"
                      value={dateToFilter}
                      onChange={e => setDateToFilter(e.target.value)}
                    />
                  </label>
                  <button
                    onClick={clearAllFilters}
                    className="button button-secondary clear-all-btn"
                  >
                    Limpiar
                  </button>
                </div>
              )}
            </div>

            <ul className="expenses-list">
              {filteredExpenses.map(expense => (
                <li key={expense._id} className="expense-item">
                  <div className="expense-icon">
                    {getCategoryIcon(expense.categoria?.[0])}
                  </div>
                  <div className="expense-details">
                    <div className="expense-description">
                      {expense.descripcion}
                    </div>
                    <div className="expense-payer">
                      Pagado por {expense.pagado_por.nombre}
                    </div>
                  </div>
                  <div className="expense-amount-date">
                    <div className="expense-amount">
                      {formatCurrency(expense.monto)}
                    </div>
                    <div className="expense-date">
                      {new Date(expense.fecha).toLocaleDateString()}
                    </div>
                  </div>
                  {!isGlobal && (
                    <div className="expense-actions">
                      <button onClick={() => handleEdit(expense)} title="Editar">
                        ✏️
                      </button>
                      <button
                        onClick={() => handleDeleteExpense(expense._id)}
                        title="Borrar"
                      >
                        🗑️
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {activeTab === 'balances' && !isGlobal && (
          <div className="balances-tab-content">
            <h3>Balance del Grupo</h3>
            <ul className="balance-list">
              {balance.map(m => (
                <li key={m.id}>
                  <span>{m.nombre}</span>{' '}
                  <strong
                    className={
                      m.balance < 0 ? 'negative-balance' : 'positive-balance'
                    }
                  >
                    {formatCurrency(m.balance)}
                  </strong>
                </li>
              ))}
            </ul>

            <h3>Transacciones para Saldar</h3>
            {settlementTransactions.length > 0 ? (
              <ul className="settlement-list">
                {settlementTransactions.map((tx, index) => (
                  <li key={index}>
                    {tx.from.nombre} debe {formatCurrency(tx.amount)} a{' '}
                    {tx.to.nombre}
                  </li>
                ))}
              </ul>
            ) : (
              <p>No hay deudas que saldar.</p>
            )}

            <h3>Registro de Pagos</h3>
            <div className="action-buttons">
              <button
                className="button action-button"
                onClick={() => setShowRecordPaymentModal(true)}
              >
                Registrar Pago
              </button>
              <button
                className="button action-button"
                onClick={() => setShowPaymentHistoryModal(true)}
              >
                Historial
              </button>
            </div>
          </div>
        )}

        {activeTab === 'group' && !isGlobal && (
          <div className="group-tab-content">
            <h4>Añadir Miembro</h4>
            <form onSubmit={handleAddMember} className="add-member-form">
              <input
                type="email"
                placeholder="Email del nuevo miembro"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
              <button type="submit" className="button">
                Añadir
              </button>
            </form>

            <h4>Miembros</h4>
            <ul className="members-list">
              {group.miembros.map((m: IUser) => (
                <li key={m._id}>
                  <span>{m.nombre}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {!isGlobal && (
        <div className="fab-container">
          <button
            onClick={() => setShowAddExpenseModal(true)}
            className="fab"
          >
            +
          </button>
        </div>
      )}

      {showRecordPaymentModal && (
        <RecordPaymentModal
          groupId={groupId!}
          token={token!}
          members={group?.miembros || []}
          onClose={() => setShowRecordPaymentModal(false)}
          onPaymentRecorded={fetchData}
        />
      )}

      {showPaymentHistoryModal && (
        <PaymentHistoryModal
          groupId={groupId!}
          token={token!}
          members={group?.miembros || []}
          onClose={() => setShowPaymentHistoryModal(false)}
          onHistoryUpdated={fetchData}
        />
      )}

      {showAddExpenseModal && (
        <AddExpenseModal
          groupId={groupId!}
          token={token!}
          members={group?.miembros || []}
          onClose={handleCloseAddExpenseModal}
          onExpenseAction={fetchData}
          paidByInitial={user?._id || ''}
          expenseToEdit={expenseToEdit}
        />
      )}
    </div>
  );
};

export default GroupDetailPage;
