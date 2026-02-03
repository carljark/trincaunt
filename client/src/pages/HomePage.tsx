import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Link } from 'react-router-dom';
import './HomePage.scss';

const apiHost = import.meta.env.VITE_API_HOST;

const formatCurrency = (amount: number) => {
  return amount.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
};

const HomePage: React.FC = () => {
  const { user, token, logout } = useAuth();
  const [groups, setGroups] = useState<any[]>([]);
  const [globalExpenses, setGlobalExpenses] = useState<any[]>([]);
  const [newGroupName, setNewGroupName] = useState('');

  const fetchGroups = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${apiHost}/api/v1/groups`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setGroups(data.data);
      } else {
        throw new Error(data.message || 'Failed to fetch groups');
      }
    } catch (error) {
      console.error(error);
    }
  };

  const fetchGlobalExpenses = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${apiHost}/api/v1/expenses/global`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setGlobalExpenses(data.data);
      } else {
        throw new Error(data.message || 'Failed to fetch global expenses');
      }
    } catch (error) {
      console.error(error);
    }
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim() || !token) return;
    try {
      await fetch(`${apiHost}/api/v1/groups`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ nombre: newGroupName }),
      });
      setNewGroupName('');
      fetchGroups();
    } catch (error) {
      console.error(error);
    }
  };

  const handleDeleteGroup = async (groupId: string, groupName: string) => {
    if (!token) return;
    if (
      window.confirm(
        `¿Estás seguro de que quieres eliminar el grupo "${groupName}"? Esta acción borrará todos los gastos y transacciones de deuda asociadas.`
      )
    ) {
      try {
        const res = await fetch(`${apiHost}/api/v1/groups/${groupId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          alert(`Grupo "${groupName}" eliminado con éxito.`);
          fetchGroups();
        } else {
          const data = await res.json();
          throw new Error(data.message || 'Failed to delete group');
        }
      } catch (error) {
        console.error('Error deleting group:', error);
        alert(`Error al eliminar el grupo: ${(error as Error).message}`);
      }
    }
  };

  useEffect(() => {
    fetchGroups();
    fetchGlobalExpenses();
  }, [token]);

  const totalGlobalExpenses = globalExpenses.reduce(
    (sum, expense) => sum + expense.monto,
    0
  );

  return (
    <div className="page-container home-page">
      <header className="header">
        <h1 className="welcome-message">Bienvenido, {user?.nombre}</h1>
        <button onClick={logout} className="button button-danger">
          Logout
        </button>
      </header>

      <form onSubmit={handleCreateGroup} className="create-group-form">
        <input
          type="text"
          placeholder="Nombre del nuevo grupo"
          value={newGroupName}
          onChange={e => setNewGroupName(e.target.value)}
        />
        <button type="submit" className="button">
          Crear Grupo
        </button>
      </form>

      <main className="groups-list">
        <h2 className="list-title">Mis Grupos</h2>
        <ul>
          <li className="group-item">
            <Link to={`/group/global`}>
              <strong>Global</strong>
              <span>
                Total Gastado: {formatCurrency(totalGlobalExpenses)}
              </span>
            </Link>
          </li>
          {groups.length > 0 ? (
            groups.map(g => (
              <li key={g._id} className="group-item">
                <Link to={`/group/${g._id}`}>
                  <strong>{g.nombre}</strong>
                  <span>
                    Tu parte: {formatCurrency(g.userShare)} de{' '}
                    {formatCurrency(g.totalExpenses)}
                  </span>
                </Link>
                <button
                  onClick={() => handleDeleteGroup(g._id, g.nombre)}
                  className="button button-danger"
                >
                  Eliminar
                </button>
              </li>
            ))
          ) : (
            <p className="no-groups-message">
              No perteneces a ningún grupo. ¡Crea uno!
            </p>
          )}
        </ul>
      </main>
    </div>
  );
};

export default HomePage;
