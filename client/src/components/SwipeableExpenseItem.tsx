import React, { useState, useRef, useEffect } from 'react';
import './SwipeableExpenseItem.scss';

const formatCurrency = (amount: number) => {
  return amount.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

interface SwipeableExpenseItemProps {
  expense: any;
  isGlobal?: boolean;
  onEdit: (expense: any) => void;
  onDelete: (id: string) => void;
}

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
      setOffset(0);
    } else if (offset < -swipeThreshold) {
      // Swiped left -> Delete
      onDelete(expense._id);
      setOffset(0);
    } else {
      // Not enough swipe, reset
      setOffset(0);
    }
  };

  return (
    <div className="swipeable-container" onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
      {!isGlobal && (
        <>
          <div className="swipe-action swipe-action-left" style={{ opacity: offset > 0 ? 1 : 0 }}>
            <span>&#9998; Editar</span>
          </div>
          <div className="swipe-action swipe-action-right" style={{ opacity: offset < 0 ? 1 : 0 }}>
            <span>&#10006; Borrar</span>
          </div>
        </>
      )}
      
      <div 
        className="expense-item-content"
        style={{ 
          transform: `translateX(${offset}px)`,
          transition: isSwiping ? 'none' : 'transform 0.3s ease-out'
        }}
      >
        <div className="expense-item">
          <div className="expense-info">
            <div className="expense-details-row">
              <div className="expense-description" title={expense.descripcion}>
                {isGlobal && <strong>{expense.grupo_nombre}: </strong>}
                {expense.descripcion}
              </div>
              <div className="expense-dots"></div>
              <div className="expense-amount">
                <strong>{formatCurrency(expense.monto)}€</strong>
                {isGlobal && <span> (de {formatCurrency(expense.original_monto)}€)</span>}
              </div>
            </div>
          </div>
          
          {/* Desktop actions (hidden on mobile via CSS) */}
          {!isGlobal && (
            <div className="expense-actions desktop-actions">
              <button onClick={() => onEdit(expense)} className="desktop-edit-btn" title="Editar">&#9998;</button>
              <button onClick={() => onDelete(expense._id)} className="desktop-delete-btn" title="Borrar">&#10006;</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SwipeableExpenseItem;
