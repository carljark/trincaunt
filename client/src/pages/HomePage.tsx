import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Link } from 'react-router-dom';

import './HomePage.scss'; // Import the new SCSS file

const apiHost = import.meta.env.VITE_API_HOST;

const formatCurrency = (amount: number) => {
  return amount.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const HomePage: React.FC = () => {
  const { user, token, logout } = useAuth();
  const [groups, setGroups] = useState<any[]>([]);
  const [globalExpenses, setGlobalExpenses] = useState<any[]>([]);

  const fetchGroups = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${apiHost}/api/v1/groups`, {
        headers: { 
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if(res.ok) {
        setGroups(data.data);
      } else {
        throw new Error(data.message || 'Failed to fetch groups');
      }
    } catch (error) {
      console.error(error);
      // Optional: handle error in UI
    }
  };

  const fetchGlobalExpenses = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${apiHost}/api/v1/expenses/global`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if(res.ok) {
        setGlobalExpenses(data.data);
      } else {
        throw new Error(data.message || 'Failed to fetch global expenses');
      }
    } catch (error) {
      console.error(error);
    }
  };

  const createGroup = async () => {
    const nombre = prompt('Nombre del grupo:');
    if (!nombre || !token) return;
    try {
      await fetch(`${apiHost}/api/v1/groups`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ nombre })
      });
      fetchGroups();
    } catch (error) {
      console.error(error);
    }
  };

  const handleDeleteGroup = async (groupId: string, groupName: string) => {
    if (!token) return;
    if (window.confirm(`¿Estás seguro de que quieres eliminar el grupo "${groupName}"? Esta acción borrará todos los gastos y transacciones de deuda asociadas.`)) {
      try {
        const res = await fetch(`${apiHost}/api/v1/groups/${groupId}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        if (res.ok) {
          alert(`Grupo "${groupName}" eliminado con éxito.`);
          fetchGroups(); // Refresh the list of groups
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

  const totalGlobalExpenses = globalExpenses.reduce((sum, expense) => sum + expense.monto, 0);

  return (
    <div className="home-page">
      <div className="header-section">
        <h1 className="welcome-message">Bienvenido, <strong>{user?.nombre}</strong></h1>
        <button onClick={logout} className="button button--danger">Logout</button>
      </div>
      
      <div className="create-group-section">
        <button onClick={createGroup} className="button button--primary">Crear Nuevo Grupo</button>
      </div>
      
      <div className="groups-list-section">
        <h3>Mis Grupos</h3>
        <ul className="groups-grid">
          <li key="global-group" className="group-card">
            <Link to={`/group/global`} className="group-card-link">
              <strong>Global</strong>
              <p>Total: {formatCurrency(totalGlobalExpenses)}€</p>
            </Link>
          </li>
          {groups.length > 0 ? (
            groups.map(g => (
              <li key={g._id} className="group-card">
                <Link to={`/group/${g._id}`} className="group-card-link">
                  <strong>{g.nombre}</strong>
                  <p>Total: {formatCurrency(g.totalExpenses)}€ / Mi parte: {formatCurrency(g.userShare)}€</p>
                </Link>
                <div className="group-card-footer">
                  <button onClick={() => handleDeleteGroup(g._id, g.nombre)} className="button button--danger">Eliminar</button>
                </div>
              </li>
            ))
          ) : (
            <p className="no-groups-message">No perteneces a ningún grupo.</p>
          )}
        </ul>
      </div>
    </div>
  );
};

export default HomePage;
