import React, { useState, useRef } from 'react';
import { IExpensePopulated } from '../types/expense';
import { IUserPopulated } from '../types/user';
import { PencilIcon, TrashIcon } from './icons';
import './SwipeableExpenseItem.scss';

const formatEuros = (amount: number) =>
  amount.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

export type SwipeableExpense = IExpensePopulated & {
  grupo_nombre?: string;
  original_monto?: number;
};

interface SwipeableExpenseItemProps {
  expense: SwipeableExpense;
  isGlobal?: boolean;
  onEdit: (expense: SwipeableExpense) => void;
  onDelete: (id: string) => void;
}

// Los gastos antiguos guardaban un único pagador en vez de un array
const payerNames = (pagadoPor: IExpensePopulated['pagado_por'] | IUserPopulated) =>
  (Array.isArray(pagadoPor) ? pagadoPor : [pagadoPor]).filter(Boolean).map(p => p.nombre).join(', ');

const SwipeableExpenseItem: React.FC<SwipeableExpenseItemProps> = ({ expense, isGlobal, onEdit, onDelete }) => {
  const [offset, setOffset] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const startX = useRef(0);
  const currentX = useRef(0);
  const swipeThreshold = 80;

  const handleTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    setIsSwiping(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isSwiping) return;
    currentX.current = e.touches[0].clientX;
    const diff = currentX.current - startX.current;

    // Allow max swipe of 100px in both directions
    const newOffset = Math.max(-100, Math.min(100, diff));
    setOffset(newOffset);
  };

  const handleTouchEnd = () => {
    setIsSwiping(false);
    if (offset > swipeThreshold) {
      // Swiped right -> Edit
      onEdit(expense);
    } else if (offset < -swipeThreshold) {
      // Swiped left -> Delete
      onDelete(expense._id);
    }
    setOffset(0);
  };

  const payers = payerNames(expense.pagado_por);
  const details = isGlobal
    ? [expense.grupo_nombre, expense.original_monto !== undefined ? `de ${formatEuros(expense.original_monto)}` : null]
    : [payers && `Pagó ${payers}`, ...(expense.categoria ?? [])];

  return (
    <div className="expense-row" onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
      {!isGlobal && (
        <>
          <div className="expense-row__swipe expense-row__swipe--edit" style={{ opacity: offset > 0 ? 1 : 0 }} aria-hidden="true">
            <PencilIcon /> Editar
          </div>
          <div className="expense-row__swipe expense-row__swipe--delete" style={{ opacity: offset < 0 ? 1 : 0 }} aria-hidden="true">
            Borrar <TrashIcon />
          </div>
        </>
      )}

      <div
        className="expense-row__content"
        style={{
          transform: `translateX(${offset}px)`,
          transition: isSwiping ? 'none' : 'transform 0.3s ease-out'
        }}
      >
        <div className="expense-row__info">
          <span className="expense-row__description" title={expense.descripcion}>{expense.descripcion}</span>
          {details.some(Boolean) && (
            <span className="expense-row__details">{details.filter(Boolean).join(' · ')}</span>
          )}
        </div>
        <span className="expense-row__amount">{formatEuros(expense.monto)}</span>

        {/* Acciones de escritorio (en móvil se usa el deslizamiento) */}
        {!isGlobal && (
          <div className="expense-row__actions">
            <button type="button" className="expense-row__action" onClick={() => onEdit(expense)} aria-label={`Editar ${expense.descripcion}`} title="Editar">
              <PencilIcon />
            </button>
            <button type="button" className="expense-row__action expense-row__action--delete" onClick={() => onDelete(expense._id)} aria-label={`Borrar ${expense.descripcion}`} title="Borrar">
              <TrashIcon />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default SwipeableExpenseItem;
