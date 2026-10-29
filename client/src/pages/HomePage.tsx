import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Link } from 'react-router-dom';
import UserMenu from '../components/UserMenu';
import { ChevronRightIcon, PlusIcon } from '../components/icons';
import { IExpensePopulated } from '../types/expense';
import { IGroup } from '../types/group';
import { IUserPopulated } from '../types/user';

import './HomePage.scss'; // Import the new SCSS file

const apiHost = import.meta.env.VITE_API_HOST;

const formatEuros = (amount: number) =>
  amount.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

const initialOf = (name: string) => name.trim().charAt(0).toUpperCase() || '?';

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
  const [isCreating, setIsCreating] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);

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

  const createGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    const nombre = newGroupName.trim();
    if (!nombre || !token) return;
    setCreateError(null);
    try {
      const res = await fetch(`${apiHost}/api/v1/groups`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ nombre })
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'No se pudo crear el grupo');
      }
      setNewGroupName('');
      setIsCreating(false);
      fetchGroups();
    } catch (error) {
      console.error(error);
      setCreateError(error instanceof Error ? error.message : 'No se pudo crear el grupo');
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
    <div className="home">
      <UserMenu onExportXLSX={handleExportXLSX} />
      <header className="home__header">
        <h1 className="home__greeting">Hola, {user?.nombre}</h1>
      </header>

      <Link to="/group/global" className="home__global">
        <span className="home__global-text">
          <span className="home__global-label">Todos los grupos · tu parte</span>
          <span className="home__global-total">{formatEuros(totalGlobalExpenses)}</span>
        </span>
        <ChevronRightIcon className="home__chevron home__chevron--light" />
      </Link>

      <section className="home__card">
        <div className="home__card-header">
          <h2 className="home__title">Mis grupos</h2>
          <button
            type="button"
            className={`home__icon-button ${isCreating ? 'home__icon-button--active' : ''}`}
            onClick={() => { setIsCreating(open => !open); setCreateError(null); }}
            aria-label="Crear grupo"
            aria-expanded={isCreating}
            title="Crear grupo"
          >
            <PlusIcon />
          </button>
        </div>

        {isCreating && (
          <form className="home__form" onSubmit={createGroup}>
            <input
              className="home__input"
              type="text"
              placeholder="Nombre del grupo"
              value={newGroupName}
              onChange={e => setNewGroupName(e.target.value)}
              aria-label="Nombre del nuevo grupo"
              autoFocus
              required
            />
            {createError && <p className="home__error">{createError}</p>}
            <div className="home__form-actions">
              <button type="button" className="home__button home__button--secondary" onClick={() => setIsCreating(false)}>
                Cancelar
              </button>
              <button type="submit" className="home__button home__button--primary">Crear</button>
            </div>
          </form>
        )}

        {groups.length > 0 ? (
          <ul className="home__groups">
            {groups.map(g => (
              <li key={g._id} className="home__group">
                <Link to={`/group/${g._id}`} className="home__group-link">
                  <span className="home__avatar" aria-hidden="true">{initialOf(g.nombre)}</span>
                  <span className="home__group-text">
                    <span className="home__group-name">{g.nombre}</span>
                    <span className="home__group-meta">
                      {g.miembros.length} {g.miembros.length === 1 ? 'miembro' : 'miembros'}
                    </span>
                  </span>
                  <span className="home__group-amounts">
                    <span className="home__group-total">{formatEuros(g.totalExpenses)}</span>
                    <span className="home__group-share">tu parte {formatEuros(g.userShare)}</span>
                  </span>
                  <ChevronRightIcon className="home__chevron" />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="home__empty">Todavía no estás en ningún grupo. Crea uno con el botón +.</p>
        )}
      </section>
    </div>
  );
};

export default HomePage;
