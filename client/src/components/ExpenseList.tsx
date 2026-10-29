import React from 'react';
import { IExpensePopulated } from '../types/expense';
import SwipeableExpenseItem, { SwipeableExpense } from './SwipeableExpenseItem';
import { SortIcon } from './icons';
import './ExpenseList.scss';

interface ExpenseListProps {
  expenses: SwipeableExpense[];
  total: number;
  grandTotal: number;
  averagePerDay: number;
  sortOrder: 'asc' | 'desc';
  onToggleSort: () => void;
  isGlobal?: boolean;
  onEdit: (expense: IExpensePopulated) => void;
  onDelete: (id: string) => void;
}

const formatEuros = (amount: number) =>
  amount.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

const dayKey = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

// «Hoy», «Ayer» o «mar, 28 oct» (con año si no es el actual)
export const formatDayLabel = (date: Date, now = new Date()) => {
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (dayKey(date) === dayKey(now)) return 'Hoy';
  if (dayKey(date) === dayKey(yesterday)) return 'Ayer';
  return date.toLocaleDateString('es-ES', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(date.getFullYear() !== now.getFullYear() && { year: 'numeric' })
  });
};

// Agrupa por día respetando el orden ya aplicado a la lista
const groupByDay = (expenses: SwipeableExpense[]) => {
  const groups: { key: string; date: Date; items: SwipeableExpense[]; total: number }[] = [];
  for (const expense of expenses) {
    const date = new Date(expense.fecha);
    const key = dayKey(date);
    let group = groups[groups.length - 1];
    if (!group || group.key !== key) {
      group = { key, date, items: [], total: 0 };
      groups.push(group);
    }
    group.items.push(expense);
    group.total += expense.monto;
  }
  return groups;
};

const ExpenseList: React.FC<ExpenseListProps> = ({
  expenses, total, grandTotal, averagePerDay, sortOrder, onToggleSort, isGlobal, onEdit, onDelete
}) => {
  const isFiltered = Math.abs(total - grandTotal) > 0.005;

  return (
    <div className="expense-list">
      <section className="expense-list__summary">
        <div className="expense-list__summary-text">
          <span className="expense-list__summary-label">
            {isFiltered ? 'Total filtrado' : 'Total'}
          </span>
          <span className="expense-list__total">{formatEuros(total)}</span>
          <span className="expense-list__meta">
            {expenses.length} {expenses.length === 1 ? 'gasto' : 'gastos'}
            {expenses.length > 0 && ` · ${formatEuros(averagePerDay)} al día`}
            {isFiltered && ` · de ${formatEuros(grandTotal)}`}
          </span>
        </div>
        <button
          type="button"
          className="expense-list__sort"
          onClick={onToggleSort}
          aria-label={sortOrder === 'desc' ? 'Ordenar de más antiguos a más recientes' : 'Ordenar de más recientes a más antiguos'}
          title={sortOrder === 'desc' ? 'Más recientes primero' : 'Más antiguos primero'}
        >
          <SortIcon direction={sortOrder} />
        </button>
      </section>

      {expenses.length === 0 ? (
        <p className="expense-list__empty">No hay gastos que coincidan con los filtros.</p>
      ) : (
        groupByDay(expenses).map(day => (
          <section key={day.key} className="expense-list__day">
            <h3 className="expense-list__day-header">
              <span className="expense-list__day-label">{formatDayLabel(day.date)}</span>
              <span className="expense-list__day-total">{formatEuros(day.total)}</span>
            </h3>
            <ul className="expense-list__items">
              {day.items.map(expense => (
                <li key={expense._id} className="expense-list__item">
                  <SwipeableExpenseItem expense={expense} isGlobal={isGlobal} onEdit={onEdit} onDelete={onDelete} />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
};

export default ExpenseList;
