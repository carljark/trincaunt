import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

import './GroupDetailPage.scss';

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
  const [paidBy, setPaidBy] = useState<string>('');
  const [assumeExpense, setAssumeExpense] = useState<boolean>(false);
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>([]);
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
      const res = await fetch(`http://localhost:3000${apiBaseUrl}/expenses`, {
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
      <h2>{group.nombre}</h2>
      
      <h3>Balance del Grupo</h3>
      <ul className="balance-list">{balance.map(m => <li key={m.id}><span>{m.nombre}:</span> <strong style={{color: getBalanceColor(m.balance)}}>${m.balance.toFixed(2)}</strong></li>)}</ul>
      
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
                  {expense.descripcion}: ${expense.monto} <span>(Pagado por: {expense.pagado_por?.nombre || '...'})</span>
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

    </div>
  );
};

export default GroupDetailPage;
