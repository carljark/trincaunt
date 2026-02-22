import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import RecordPaymentModal from '../components/RecordPaymentModal';
import PaymentHistoryModal from '../components/PaymentHistoryModal';
import AddExpenseModal from '../components/AddExpenseModal';
import CategoryModal from '../components/CategoryModal';
import BulkEditForm from '../components/BulkEditForm';
import ConfirmationModal from '../components/ConfirmationModal';
import ExpenseGraph from '../components/ExpenseGraph'; // Import the new component
import GroupNotes from '../components/GroupNotes'; // Import the new GroupNotes component
import { IExpensePopulated } from '../types/expense';
import { IGroup } from '../types/group';
import { IBalance } from '../types/balance';
import { ITransaction, ISettleGroupDebtsTransaction, IDebtTransaction } from '../types/transaction';
import { IUser, IUserPopulated } from '../types/user';

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
import '../components/AddExpenseModal.scss';
import '../components/CategoryModal.scss';
import '../components/BulkEditForm.scss';
import '../components/ConfirmationModal.scss';

const formatCurrency = (amount: number) => {
  return amount.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
  const [settlementTransactions, setSettlementTransactions] = useState<ISettleGroupDebtsTransaction[]>([]);
  const [paymentHistory, setPaymentHistory] = useState<IDebtTransaction[]>([]);
  const [showRecordPaymentModal, setShowRecordPaymentModal] = useState<boolean>(false);
  const [totalExpenses, setTotalExpenses] = useState<number>(0);
  const [averageExpense, setAverageExpense] = useState<number>(0);
  const [myTotalExpenses, setMyTotalExpenses] = useState<number>(0);
  const [myTotalExpensesPay, setMyTotalExpensesPay] = useState<number>(0);
  const [myTotalDebt, setMyTotalDebt] = useState<number>(0);
  const [myTotalSettledIncome, setMyTotalSettledIncome] = useState<number>(0);
  const [showPaymentHistoryModal, setShowPaymentHistoryModal] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'expenses' | 'balances' | 'group' | 'graph' | 'notes'>('expenses');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [showAddExpenseModal, setShowAddExpenseModal] = useState<boolean>(false);
  const [expenseToEdit, setExpenseToEdit] = useState<IExpensePopulated | undefined>(undefined);
  const [categoryFilter, setCategoryFilter] = useState<string[]>([]);
  const [descriptionFilter, setDescriptionFilter] = useState('');
  const [dateFromFilter, setDateFromFilter] = useState('');
  const [dateToFilter, setDateToFilter] = useState('');
  const [payerFilter, setPayerFilter] = useState('all');
  const [showFilters, setShowFilters] = useState(false);
  const [allCategories, setAllCategories] = useState<string[]>([]);
  const [categoryAliases, setCategoryAliases] = useState<{ [alias: string]: string[] }>({});
  const [showCategoryModal, setShowCategoryModal] = useState<boolean>(false);
  const [showBulkEdit, setShowBulkEdit] = useState(false);
  const [showConfirmationModal, setShowConfirmationModal] = useState(false);
  const [bulkUpdateData, setBulkUpdateData] = useState<any>(null);
  const [initialFiltersLoaded, setInitialFiltersLoaded] = useState(false);
  const [initialDataLoaded, setInitialDataLoaded] = useState(false);
  const [dateFilterPreset, setDateFilterPreset] = useState<string | null>(null);
  const [localizationFilter, setLocalizationFilter] = useState('');
  
  // Usamos useRef para controlar si ya hemos inicializado las categorías
  const hasInitializedCategories = useRef(false);

  const formatPayers = useCallback((pagadoPor: IExpensePopulated['pagado_por']) => {
    // pagadoPor is always expected to be an array of IUserPopulated based on IExpensePopulated type
    if (pagadoPor && pagadoPor.length > 0) {
      return pagadoPor.map(p => p.nombre).join(', ');
    }
    return 'Nadie'; // Fallback if the array is empty
  }, []);





  const fetchAllCategories = useCallback(async () => {
    if (!token) return;
    try {
      const [categoriesRes, aliasesRes] = await Promise.all([
        fetch(`${apiHost}${apiBaseUrl}/expenses/categories`, { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch(`${apiHost}${apiBaseUrl}/category-aliases`, { headers: { 'Authorization': `Bearer ${token}` } })
      ]);

      let allCats = new Set<string>();
      let aliasesMap: { [alias: string]: string[] } = {};

      if (categoriesRes.ok) {
        const categoriesData = await categoriesRes.json();
        if (Array.isArray(categoriesData.data)) {
          categoriesData.data.forEach((item: any) => {
            if (item && item.category) allCats.add(item.category);
          });
        }
      }

      if (aliasesRes.ok) {
        const aliasesData = await aliasesRes.json();
        aliasesData.data.forEach((alias: any) => {
          aliasesMap[alias.alias] = alias.mainCategories;
          alias.mainCategories.forEach((mc: string) => allCats.add(mc));
        });
      }

      setCategoryAliases(aliasesMap);
      const allCategoriesArray = Array.from(allCats).sort();
      setAllCategories(allCategoriesArray);

      // Inicializar categorías SOLO en la primera carga y si no hay filtros guardados
      if (initialFiltersLoaded && allCategoriesArray.length > 0 && !hasInitializedCategories.current && categoryFilter.length === 0) {
        setCategoryFilter(allCategoriesArray);
        hasInitializedCategories.current = true;
      }
    } catch (err) {
      console.error('Error fetching categories:', err);
    }
  }, [token, initialFiltersLoaded, categoryFilter]);

  const setDatePreset = useCallback((preset: string | null) => {
    if (!preset) {
      setDateFilterPreset(null);
      setDateFromFilter('');
      setDateToFilter('');
      return;
    }

    const today = new Date();
    let fromDate: Date;
    const toDate: Date = new Date();

    switch (preset) {
      case 'day':
        fromDate = new Date(today);
        break;
      case 'week': {
        const firstDayOfWeek = new Date(today);
        const day = today.getDay();
        const diff = today.getDate() - day + (day === 0 ? -6 : 1);
        firstDayOfWeek.setDate(diff);
        fromDate = firstDayOfWeek;
        break;
      }
      case 'month':
        fromDate = new Date(today.getFullYear(), today.getMonth(), 1);
        break;
      case 'year':
        fromDate = new Date(today.getFullYear(), 0, 1);
        break;
      default:
        return;
    }

    setDateFilterPreset(preset);
    setDateFromFilter(fromDate.toISOString().split('T')[0]);
    setDateToFilter(toDate.toISOString().split('T')[0]);
  }, []); // Stable function

  const handleDatePresetClick = useCallback((preset: string) => {
    if (preset === dateFilterPreset) {
      setDatePreset(null);
    } else {
      setDatePreset(preset);
    }
  }, [dateFilterPreset, setDatePreset]);

  const loadFilters = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${apiHost}${apiBaseUrl}/user-preferences`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const { filters } = data;

        if (filters.period) {
          setDatePreset(filters.period);
        } else {
          setDateFromFilter(filters.dateFrom || '');
          setDateToFilter(filters.dateTo || '');
        }

        setCategoryFilter(filters.category || []);
        setDescriptionFilter(filters.description || '');
        setLocalizationFilter(filters.localization || '');
        setPayerFilter(filters.payer || 'all');
        hasInitializedCategories.current = true;
      }
    } catch (err) {
      // It's okay if it fails, it means the user has no saved preferences
      hasInitializedCategories.current = true;
    } finally {
      setInitialFiltersLoaded(true);
    }
  }, [token, setDatePreset]);

  const sortedExpenses = [...expenses].sort((a, b) => {
    const dateA = new Date(a.fecha).getTime();
    const dateB = new Date(b.fecha).getTime();
    if (sortOrder === 'desc') {
      return dateB - dateA;
    } else {
      return dateA - dateB;
    }
  });

  // CORREGIDO: La condición de filtrado ahora está dentro de la función filter
  const filteredExpenses = sortedExpenses.filter((expense: IExpensePopulated) => {
    // Filtrar por categoría
    if (categoryFilter.length > 0) {
      const matchesCategory = expense.categoria?.some((cat: string) => {
        // Coincidencia directa
        if (categoryFilter.includes(cat)) return true;

        // Coincidencia por alias (si la categoría del gasto es un alias de alguna seleccionada)
        const mainCatsOfAlias = categoryAliases[cat] || [];
        return mainCatsOfAlias.some(mc => categoryFilter.includes(mc));
      });

      if (!matchesCategory) return false;
    }

    if (descriptionFilter && !new RegExp(descriptionFilter, 'i').test(expense.descripcion)) {
      return false;
    }
    if (localizationFilter && !new RegExp(localizationFilter, 'i').test(expense.localization || '')) {
      return false;
    }
    if (dateFromFilter && new Date(expense.fecha) < new Date(dateFromFilter)) {
      return false;
    }
    if (dateToFilter && new Date(expense.fecha) > new Date(dateToFilter)) {
      return false;
    }
    if (payerFilter !== 'all' && !(Array.isArray(expense.pagado_por) ? expense.pagado_por.some(p => p._id === payerFilter) : (expense.pagado_por as IUserPopulated)._id === payerFilter)) {
      return false;
    }
    return true;
  });

  const totalFilteredExpenses = filteredExpenses.reduce((sum, expense) => sum + expense.monto, 0);

  const clearAllFilters = () => {
    setCategoryFilter([]);
    setDescriptionFilter('');
    setDateFromFilter('');
    setDateToFilter('');
    setPayerFilter('all');
    setDateFilterPreset(null);
    setLocalizationFilter('');
  };

  const handleBulkUpdate = (updateData: any) => {
    if (Object.keys(updateData).length === 0) {
      alert('No hay cambios que aplicar.');
      return;
    }
    setBulkUpdateData(updateData);
    setShowConfirmationModal(true);
  };

  const confirmBulkUpdate = async () => {
    if (!bulkUpdateData) return;

    const expenseIds = filteredExpenses.map(e => e._id);
    if (expenseIds.length === 0) {
      alert('No hay gastos filtrados para actualizar.');
      setShowConfirmationModal(false);
      return;
    }

    try {
      const res = await fetch(`${apiHost}${apiBaseUrl}/expenses/bulk-update`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          expenseIds,
          updateData: bulkUpdateData
        })
      });

      if (res.ok) {
        alert('Gastos actualizados con éxito.');
        if (isGlobal) {
          fetchGlobalData();
        } else {
          fetchGroupData();
        }
      } else {
        const data = await res.json();
        throw new Error(data.message || 'Error al actualizar los gastos.');
      }
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('An unknown error occurred');
      }
    } finally {
      setShowConfirmationModal(false);
      setBulkUpdateData(null);
    }
  };

  const saveFilters = async () => {
    if (!token) return;
    const filters = {
      category: categoryFilter,
      description: descriptionFilter,
      dateFrom: dateFilterPreset ? '' : dateFromFilter,
      dateTo: dateFilterPreset ? '' : dateToFilter,
      payer: payerFilter,
      period: dateFilterPreset,
      localization: localizationFilter,
    };
    try {
      const res = await fetch(`${apiHost}${apiBaseUrl}/user-preferences`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ filters }),
      });
      if (res.ok) {
        alert('Filtros guardados');
      } else {
        const data = await res.json();
        throw new Error(data.message || 'Error al guardar los filtros');
      }
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
        alert('Error al guardar filtros: ' + err.message);
      } else {
        setError('An unknown error occurred');
        alert('Error desconocido al guardar filtros');
      }
      setTimeout(() => setError(''), 5000);
    }
  };

  useEffect(() => {
    if (filteredExpenses.length > 0) {
      const dates = filteredExpenses.map(expense => new Date(expense.fecha).getTime());
      const minDate = new Date(Math.min(...dates));
      const maxDate = new Date(Math.max(...dates));
      const numberOfDays = Math.ceil(Math.abs(maxDate.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      setAverageExpense(numberOfDays > 0 ? totalFilteredExpenses / numberOfDays : 0);
    } else {
      setAverageExpense(0);
    }
  }, [filteredExpenses, totalFilteredExpenses]);

  const fetchGlobalData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const expenseUrl = new URL(`${apiHost}${apiBaseUrl}/expenses/global`);
      // Solo añadir filtros de categoría si hay alguno seleccionado
      if (categoryFilter.length > 0) {
        expenseUrl.searchParams.append('category', categoryFilter.join(','));
      }

      const [expensesRes] = await Promise.all([
        fetch(expenseUrl.toString(), { headers: { 'Authorization': `Bearer ${token}` } }),
      ]);

      if (!expensesRes.ok) throw new Error('Failed to fetch global expenses');
      const expensesData = await expensesRes.json();

      setGroup({ _id: 'global', nombre: 'Global', miembros: [], creado_por: user?._id || '', fecha_creacion: new Date().toISOString() });
      setExpenses(expensesData.data);
      setBalance([]);
      setSettlementTransactions([]);
      setPaymentHistory([]);
      const calculatedTotalExpenses = expensesData.data.reduce((sum: number, expense: any) => sum + expense.monto, 0);
      setTotalExpenses(calculatedTotalExpenses);

      setInitialDataLoaded(true);

    } catch (err: unknown) {
        if (err instanceof Error) {
            setError(err.message);
        } else {
            setError('An unknown error occurred');
        }
    } finally {
        setLoading(false);
    }
  }, [token, user?._id, initialFiltersLoaded, categoryFilter]);

  const fetchGroupData = useCallback(async () => {
    if (!token || !groupId) return;
    setLoading(true);
    try {
      const expenseUrl = new URL(`${apiHost}${apiBaseUrl}/groups/${groupId}/expenses`);
      // Solo añadir filtros de categoría si hay alguno seleccionado
      if (categoryFilter.length > 0) {
        expenseUrl.searchParams.append('category', categoryFilter.join(','));
      }

      const [groupRes, expenseRes, balanceRes, settlementRes, debtTransactionsRes] = await Promise.all([
        fetch(`${apiHost}${apiBaseUrl}/groups/${groupId}`, { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch(expenseUrl.toString(), { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch(`${apiHost}${apiBaseUrl}/groups/${groupId}/balance`, { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch(`${apiHost}${apiBaseUrl}/groups/${groupId}/settle`, { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch(`${apiHost}${apiBaseUrl}/groups/${groupId}/debt-transactions`, { headers: { 'Authorization': `Bearer ${token}` } })
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
        .filter((expense) => (Array.isArray(expense.pagado_por) ? expense.pagado_por.some(p => p._id === user?._id) : (expense.pagado_por as IUserPopulated)._id === user?._id))
        .reduce((sum, expense) => sum + expense.monto, 0);
      setMyTotalExpensesPay(calculatedMyTotalExpenses);

      const myBalance = balanceData.data.balances.find((b: IBalance) => b.id === user?._id)?.balance;
      setMyTotalDebt(myBalance || 0);

      setBalance(balanceData.data.balances);
      setSettlementTransactions(settlementData.data.transactions);

      setInitialDataLoaded(true);

    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('An unknown error occurred');
      }
    } finally {
      setLoading(false);
    }
  }, [groupId, token, user?._id, initialFiltersLoaded, categoryFilter]);

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

  // Cargar filtros iniciales
  useEffect(() => {
    loadFilters();
  }, [loadFilters]);

  // Cargar datos iniciales
  useEffect(() => {
    if (initialFiltersLoaded) {
      fetchAllCategories();
      if (isGlobal) {
        fetchGlobalData();
      } else {
        fetchGroupData();
      }
    }
  }, [initialFiltersLoaded, isGlobal, fetchGlobalData, fetchGroupData, fetchAllCategories]);

  const getBalanceColor = (amount: number) => {
    if (amount > 0) return 'green';
    if (amount < 0) return 'red';
    return 'black';
  };

  if (loading && !initialDataLoaded) return <p>Cargando...</p>;
  if (!group && !isGlobal) return <p>Grupo no encontrado.</p>;

  return (
    <div className="group-detail-page">
      <button onClick={() => navigate(-1)} className="back-button">Volver</button>
      <h2>{isGlobal ? 'Resumen Global' : group?.nombre}</h2>
      
      {error && <p className="error-message">Error: {error}</p>}

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
          <button
            className={activeTab === 'graph' ? 'active' : ''}
            onClick={() => setActiveTab('graph')}
          >
            Gráfico
          </button>
          <button
            className={activeTab === 'notes' ? 'active' : ''}
            onClick={() => setActiveTab('notes')}
          >
            Notas
          </button>
        </div>
      )}

      {activeTab === 'graph' && (
        <div className="graph-tab-content">
          {groupId && token && <ExpenseGraph groupId={groupId} token={token} />}
        </div>
      )}

      {activeTab === 'notes' && (
        <div className="notes-tab-content">
          {groupId && group && <GroupNotes groupId={groupId} members={group.miembros} />}
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

          {activeTab === 'expenses' && expenses.length > 0 && (
            <div className="average-expense-display">
              <p><strong>Media de gasto por día: {formatCurrency(averageExpense)}€</strong></p>
            </div>
          )}

          <div className="filters-accordion-container">
            <div className="filters-accordion-toggle" onClick={() => setShowFilters(!showFilters)}>
              <div className="filter-title-with-presets">
                <h3>Filtros {showFilters ? '▲' : '▼'}</h3>
                <div className="date-presets">
                  <button onClick={(e) => { e.stopPropagation(); handleDatePresetClick('day'); }} className={`preset-btn ${dateFilterPreset === 'day' ? 'active' : ''}`}>D</button>
                  <button onClick={(e) => { e.stopPropagation(); handleDatePresetClick('week'); }} className={`preset-btn ${dateFilterPreset === 'week' ? 'active' : ''}`}>S</button>
                  <button onClick={(e) => { e.stopPropagation(); handleDatePresetClick('month'); }} className={`preset-btn ${dateFilterPreset === 'month' ? 'active' : ''}`}>M</button>
                  <button onClick={(e) => { e.stopPropagation(); handleDatePresetClick('year'); }} className={`preset-btn ${dateFilterPreset === 'year' ? 'active' : ''}`}>A</button>
                </div>
              </div>
              <div className="filtered"><p>Filtrados: </p><p>{formatCurrency(totalFilteredExpenses)}€</p></div>
            </div>
            {showFilters && (
              <>
                <div className="filters">
                  <label>
                    Categoría:
                    <button onClick={() => setShowCategoryModal(true)}>Categorías</button>
                  </label>
                  <label>
                    Descripción:
                    <input type="text" placeholder="Filtrar..." value={descriptionFilter} onChange={e => setDescriptionFilter(e.target.value)} />
                  </label>
                  <label>
                    Lugar:
                    <input type="text" placeholder="Filtrar por lugar..." value={localizationFilter} onChange={e => setLocalizationFilter(e.target.value)} />
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
                      <input type="date" value={dateFromFilter} disabled={!!dateFilterPreset} onChange={e => { setDateFromFilter(e.target.value); setDateFilterPreset(null); }} />
                      <button onClick={() => { setDateFromFilter(''); setDateFilterPreset(null); }} className="clear-date-btn">X</button>
                    </div>
                  </label>
                  <label>
                    Hasta:
                    <div className="date-filter-container">
                      <input type="date" value={dateToFilter} disabled={!!dateFilterPreset} onChange={e => { setDateToFilter(e.target.value); setDateFilterPreset(null); }} />
                      <button onClick={() => { setDateToFilter(''); setDateFilterPreset(null); }} className="clear-date-btn">X</button>
                    </div>
                  </label>
                  <button onClick={clearAllFilters} className="clear-all-btn">Limpiar filtros</button>
                  <button onClick={saveFilters} className="save-filters-btn">Guardar filtros</button>
                </div>
              </>
            )}
          </div>

          {!isGlobal && (
            <div className="filters-accordion-container">
              <button className="filters-accordion-toggle" onClick={() => setShowBulkEdit(!showBulkEdit)}>
                <h3>Edición Masiva {showBulkEdit ? '▲' : '▼'}</h3>
              </button>
              {showBulkEdit && (
                <BulkEditForm
                  members={group?.miembros || []}
                  onBulkUpdate={handleBulkUpdate}
                  token={token!}
                />
              )}
            </div>
          )}

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
                          {' '}({formatPayers(expense.pagado_por)}{expense.asume_gasto ? ' (invita)' : ''})
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
          <ul className="members-list">{group?.miembros.map((m: IUser) => <li key={m._id}>{m.nombre}</li>)}</ul>
        </div>
      )}

      {!isGlobal && activeTab === 'expenses' && (
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

      {showCategoryModal && (
        <CategoryModal
          allCategories={allCategories}
          selectedCategories={categoryFilter}
          onChange={setCategoryFilter}
          onClose={() => setShowCategoryModal(false)}
        />
      )}

      {showConfirmationModal && (
        <ConfirmationModal
          message="¿Estás seguro de que quieres aplicar estos cambios a todos los gastos filtrados?"
          onConfirm={confirmBulkUpdate}
          onCancel={() => setShowConfirmationModal(false)}
        />
      )}
    </div>
  );
};

// AÑADIDO: Exportación por defecto del componente
export default GroupDetailPage;
