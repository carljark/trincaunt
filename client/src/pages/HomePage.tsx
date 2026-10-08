import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Link } from 'react-router-dom';
import UserMenu from '../components/UserMenu';
import { IExpensePopulated } from '../types/expense';
import { IGroup } from '../types/group';
import { IUserPopulated } from '../types/user';

import './HomePage.scss'; // Import the new SCSS file

const apiHost = import.meta.env.VITE_API_HOST;

const formatCurrency = (amount: number) => {
  return amount.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

interface IGroupSummary extends IGroup {
  totalExpenses: number;
  userShare: number;
}

interface IGlobalExpense extends Omit<IExpensePopulated, 'pagado_por'> {
  pagado_por: IUserPopulated[] | IUserPopulated;
  grupo?: { nombre: string };
}

const HomePage: React.FC = () => {
  const { user, token } = useAuth();
  const [groups, setGroups] = useState<IGroupSummary[]>([]);
  const [globalExpenses, setGlobalExpenses] = useState<IGlobalExpense[]>([]);

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

  const handleExportXLSX = useCallback(async () => {
    if (globalExpenses.length === 0) {
      alert('No hay gastos para exportar.');
      return;
    }

    const data = globalExpenses.map(expense => ({
      'ID Gasto': expense._id,
      'Grupo': expense.grupo?.nombre || 'Global',
      'Descripción': expense.descripcion,
      'Monto': expense.monto,
      'Pagado Por': Array.isArray(expense.pagado_por) ? expense.pagado_por.map(p => p.nombre).join(', ') : expense.pagado_por?.nombre || 'Nadie',
      'Participantes': expense.participantes.map(p => p.nombre).join(', '),
      'Fecha': new Date(expense.fecha).toLocaleDateString(),
      'Asume Gasto': expense.asume_gasto ? 'Sí' : 'No',
      'Categoría': expense.categoria?.join(', ') || '',
      'Localización': expense.localization || '',
    }));

    const XLSX = await import('xlsx-js-style');
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Gastos Globales");
    XLSX.writeFile(wb, "gastos_globales.xlsx");
  }, [globalExpenses]);

  useEffect(() => {
    fetchGroups();
    fetchGlobalExpenses();
  }, [token]);

  const totalGlobalExpenses = globalExpenses.reduce((sum, expense) => sum + expense.monto, 0);

  return (
    <div className="home-page"> {/* Main container */}
      <UserMenu onExportXLSX={handleExportXLSX} />
      <div className="user-info">
        <h1 className="welcome-message">Bienvenido, {user?.nombre}</h1>
      </div>
      
      <div className="create-group-section">
        <button onClick={createGroup} className="create-group-button">Crear Nuevo Grupo</button>
      </div>
      
      <div className="groups-list-section">
        <h3>Mis Grupos</h3>
        <ul>
          <li key="global-group">
            <Link to={`/group/global`}>
              <strong>Global</strong> - Total: {formatCurrency(totalGlobalExpenses)}€
            </Link>
          </li>
          {groups.length > 0 ? (
            groups.map(g => (
              <li key={g._id}>
                <Link to={`/group/${g._id}`}>
                  <strong>{g.nombre}</strong> - {formatCurrency(g.totalExpenses)}€ ({formatCurrency(g.userShare)}€)
                </Link>
              </li>
            ))
          ) : (
            <p>No perteneces a ningún grupo.</p>
          )}
        </ul>
      </div>
    </div>
  );
};

export default HomePage;
