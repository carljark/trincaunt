import React, { useState, useEffect, useRef } from 'react';
import './QuickExpenseFAB.scss';
import { useAuth } from '../contexts/AuthContext';
import { IUser } from '../types/user';

interface QuickExpenseFABProps {
  groupId: string;
  token: string;
  members: IUser[];
  onExpenseAdded: () => void;
}

const PREDEFINED_ICONS = [
  { id: 'beer', emoji: '🍺', concept: 'Cervezas' },
  { id: 'food', emoji: '🍽️', concept: 'Comida' },
  { id: 'coffee', emoji: '☕', concept: 'Café' },
  { id: 'transport', emoji: '🚕', concept: 'Transporte' },
];

const apiHost = import.meta.env.VITE_API_HOST || '';
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '/api/v1';

const QuickExpenseFAB: React.FC<QuickExpenseFABProps> = ({ groupId, token, members, onExpenseAdded }) => {
  const { user } = useAuth();
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeIcon, setActiveIcon] = useState('🍺');
  const [amount, setAmount] = useState(3.0);
  const [showIconSelector, setShowIconSelector] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [prices, setPrices] = useState<Record<string, number>>({});
  
  const containerRef = useRef<HTMLDivElement>(null);

  // Cargar preferencias
  useEffect(() => {
    const fetchPrefs = async () => {
      try {
        const res = await fetch(`${apiHost}${apiBaseUrl}/user-preferences`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          if (data.quickExpense) {
            if (data.quickExpense.lastIcon) setActiveIcon(data.quickExpense.lastIcon);
            if (data.quickExpense.prices) setPrices(data.quickExpense.prices);
          }
        }
      } catch (e) {
        console.error('Error fetching preferences', e);
      }
    };
    fetchPrefs();
  }, [token]);

  // Actualizar precio cuando cambie el icono
  useEffect(() => {
    if (prices[activeIcon] !== undefined) {
      setAmount(prices[activeIcon]);
    } else {
      setAmount(activeIcon === '🍺' ? 3.0 : 15.0); // Default placeholders
    }
  }, [activeIcon, prices]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsExpanded(false);
        setShowIconSelector(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleDragSubmit = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    
    const activeConcept = PREDEFINED_ICONS.find(i => i.emoji === activeIcon)?.concept || 'Varios';
    
    // Obtener localización si es posible (10s timeout)
    let locString = '';
    try {
      const getPosition = () => new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 });
      });
      const pos = await getPosition();
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${pos.coords.latitude}&lon=${pos.coords.longitude}`);
      if (res.ok) {
        const data = await res.json();
        locString = data.address?.road ? `${data.address.road}, ${data.address.city || data.address.town || ''}` : data.display_name;
      }
    } catch (e) {
      console.log('No se pudo obtener localización', e);
    }

    const payload = {
      grupo: groupId,
      descripcion: activeConcept,
      monto: amount,
      pagado_por: [user?._id],
      participantes: members.map(m => m._id),
      fecha: new Date().toISOString().split('T')[0],
      asume_gasto: false,
      categoria: [activeConcept],
      localization: locString
    };

    try {
      const res = await fetch(`${apiHost}${apiBaseUrl}/expenses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload)
      });
      
      if (res.ok) {
        // Update prefs
        const newPrices = { ...prices, [activeIcon]: amount };
        await fetch(`${apiHost}${apiBaseUrl}/user-preferences`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ quickExpense: { lastIcon: activeIcon, prices: newPrices } })
        });
        setPrices(newPrices);
        setIsExpanded(false);
        onExpenseAdded();
      }
    } catch (err) {
      alert('Error guardando el gasto rápido');
    } finally {
      setIsSubmitting(false);
    }
  };

  const [startX, setStartX] = useState(0);
  const [startY, setStartY] = useState(0);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!isExpanded) return;
    setStartX(e.clientX);
    setStartY(e.clientY);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isExpanded || startX === 0) return;
    const dx = e.clientX - startX;
    const dy = startY - e.clientY; // Up is positive
    
    // Si se arrastra horizontalmente (confirm/cancel)
    if (Math.abs(dx) > Math.abs(dy)) {
      setOffsetX(dx);
      setOffsetY(0);
    } else {
      // Si se arrastra verticalmente (ajuste precio)
      setOffsetY(dy);
      setOffsetX(0);
      
      if (Math.abs(dy) > 20) {
        const adjustment = dy > 0 ? 0.5 : -0.5;
        setAmount(prev => Math.max(0, prev + adjustment));
        setStartY(e.clientY); // Reset to allow continuous adjustment
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isExpanded || startX === 0) return;
    setStartX(0);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    
    if (offsetX > 80) {
      // Swiped right -> confirm
      handleDragSubmit();
    } else if (offsetX < -80) {
      // Swiped left -> cancel
      setIsExpanded(false);
    }
    setOffsetX(0);
    setOffsetY(0);
  };

  const handleIconLongPress = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    setShowIconSelector(!showIconSelector);
  };

  let pillStyle = {};
  if (offsetX > 0) pillStyle = { transform: `translateX(${offsetX}px)`, backgroundColor: `rgba(46, 204, 113, ${Math.min(offsetX/100, 1)})` };
  if (offsetX < 0) pillStyle = { transform: `translateX(${offsetX}px)`, backgroundColor: `rgba(231, 76, 60, ${Math.min(Math.abs(offsetX)/100, 1)})` };

  return (
    <div className={`quick-expense-fab-container ${isExpanded ? 'expanded' : ''}`} ref={containerRef}>
      {showIconSelector && (
        <div className="icon-selector">
          {PREDEFINED_ICONS.map(i => (
            <button 
              key={i.id} 
              onClick={() => { setActiveIcon(i.emoji); setShowIconSelector(false); }}
              className={activeIcon === i.emoji ? 'active' : ''}
            >
              {i.emoji}
            </button>
          ))}
        </div>
      )}
      
      {!isExpanded ? (
        <button 
          className="fab-button round" 
          onClick={() => setIsExpanded(true)}
          title="Gasto rápido"
        >
          {activeIcon}
        </button>
      ) : (
        <div 
          className="fab-button pill" 
          style={pillStyle}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          <div className="pill-content">
            <span className="swipe-hint left">«</span>
            <div 
              className="icon-part"
              onContextMenu={handleIconLongPress}
              onClick={(e) => { e.stopPropagation(); setShowIconSelector(!showIconSelector); }}
            >
              {activeIcon}
            </div>
            <div className="amount-part">
              {amount.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
            </div>
            {isSubmitting && <span className="spinner">...</span>}
            <span className="swipe-hint right">»</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default QuickExpenseFAB;
