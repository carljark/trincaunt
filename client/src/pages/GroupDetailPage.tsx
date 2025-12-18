import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '/api/v1';

const GroupDetailPage: React.FC = () => {
  const { groupId } = useParams<{ groupId: string }>();
  const { token, user } = useAuth();
  const [group, setGroup] = useState<any>(null);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [balance, setBalance] = useState<any[]>([]);
  const [email, setEmail] = useState('');
  const [expenseData, setExpenseData] = useState({ description: '', amount: '' });
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [editingExpenseData, setEditingExpenseData] = useState({ descripcion: '', monto: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchGroupData = useCallback(async () => {
    if (!token || !groupId) return;
    setLoading(true);
    try {
      const [groupRes, expenseRes, balanceRes] = await Promise.all([
        fetch(`http://localhost:3000${apiBaseUrl}/groups/${groupId}`, { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch(`http://localhost:3000${apiBaseUrl}/groups/${groupId}/expenses`, { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch(`http://localhost:3000${apiBaseUrl}/groups/${groupId}/balance`, { headers: { 'Authorization': `Bearer ${token}` } })
      ]);

      if (!groupRes.ok) throw new Error('Failed to fetch group details');
      if (!expenseRes.ok) throw new Error('Failed to fetch expenses');
      if (!balanceRes.ok) throw new Error('Failed to fetch balance');

      const groupData = await groupRes.json();
      const expensesData = await expenseRes.json();
      const balanceData = await balanceRes.json();
      
      setGroup(groupData.data);
      setExpenses(expensesData.data);
      setBalance(balanceData.data.balances);
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
      const res = await fetch(`http://localhost:3000${apiBaseUrl}/groups/${groupId}/members`, {
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
    try {
      const res = await fetch(`http://localhost:3000${apiBaseUrl}/expenses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ descripcion: expenseData.description, monto: parseFloat(expenseData.amount), grupo_id: groupId })
      });
      if (res.ok) {
        setExpenseData({ description: '', amount: '' });
        fetchGroupData();
      } else { const data = await res.json(); throw new Error(data.message || 'Error al añadir gasto'); }
    } catch (err: any) { setError(err.message); }
  };

  const handleDeleteExpense = async (expenseId: string) => {
    if (!token || !window.confirm('¿Estás seguro de que quieres borrar este gasto?')) return;
    try {
      const res = await fetch(`http://localhost:3000${apiBaseUrl}/expenses/${expenseId}`, {
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
      const res = await fetch(`http://localhost:3000${apiBaseUrl}/expenses/${editingExpenseId}`, {
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


  useEffect(() => {
    fetchGroupData();
  }, [fetchGroupData]);
  
  const getBalanceColor = (amount: number) => {
    if (amount > 0) return 'green';
    if (amount < 0) return 'red';
    return 'black';
  };

  if (loading) return <p>Cargando...</p>;
  if (error) return <p style={{ color: 'red' }}>Error: {error}</p>;
  if (!group) return <p>Grupo no encontrado.</p>;

  return (
    <div>
      <h2>{group.nombre}</h2>
      <h3>Balance del Grupo</h3>
      <ul>{balance.map(m => <li key={m.id}>{m.nombre}: <strong style={{color: getBalanceColor(m.balance)}}>${m.balance.toFixed(2)}</strong></li>)}</ul>
      <hr/>
      <h4>Miembros:</h4>
      <ul>{group.miembros.map((m:any) => <li key={m._id||m}>{typeof m==='object'?m.nombre:m}</li>)}</ul>
      <hr />
      <h4>Añadir nuevo miembro</h4>
      <form onSubmit={handleAddMember}>
        <input type="email" placeholder="Email del usuario" value={email} onChange={e=>setEmail(e.target.value)} required />
        <button type="submit">Añadir Miembro</button>
      </form>
      <hr />
      <h3>Gastos del Grupo</h3>
      <ul>
        {expenses.map((expense: any) => (
          <li key={expense._id}>
            {editingExpenseId === expense._id ? (
              <form onSubmit={handleUpdateExpense}>
                <input type="text" value={editingExpenseData.descripcion} onChange={e=>setEditingExpenseData({...editingExpenseData, descripcion: e.target.value})} required/>
                <input type="number" value={editingExpenseData.monto} onChange={e=>setEditingExpenseData({...editingExpenseData, monto: e.target.value})} required/>
                <button type="submit">Guardar</button>
                <button type="button" onClick={handleCancelEdit}>Cancelar</button>
              </form>
            ) : (
              <>
                {expense.descripcion}: ${expense.monto} (Pagado por: {expense.pagado_por?.nombre || '...'})
                <button onClick={() => handleEdit(expense)} style={{ marginLeft: '10px' }}>Editar</button>
                <button onClick={() => handleDeleteExpense(expense._id)} style={{ marginLeft: '10px' }}>Borrar</button>
              </>
            )}
          </li>
        ))}
      </ul>
      <h4>Añadir Nuevo Gasto</h4>
      <form onSubmit={handleAddExpense}>
        <input type="text" placeholder="Descripción" value={expenseData.description} onChange={e=>setExpenseData({...expenseData,description:e.target.value})} required />
        <input type="number" placeholder="Monto" value={expenseData.amount} onChange={e=>setExpenseData({...expenseData,amount:e.target.value})} required />
        <button type="submit">Añadir Gasto</button>
      </form>
    </div>
  );
};

export default GroupDetailPage;
