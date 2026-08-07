import React, { useState, useEffect, useRef } from 'react';
import './QuickExpenseFAB.scss';
import { useAuth } from '../contexts/AuthContext';
import { IUser } from '../types/user';

interface QuickExpenseFABProps {
  groupId: string;
  token: string;
  userId: string;
  members: IUser[];
  onExpenseAdded: () => void;
  onOpenManual: () => void;
  onUploadTicket: () => void;
}

const PREDEFINED_ICONS = [
  { id: 'beer', emoji: '🍺', concept: 'Cervezas' },
  { id: 'food', emoji: '🍽️', concept: 'Comida' },
  { id: 'coffee', emoji: '☕', concept: 'Café' },
  { id: 'transport', emoji: '🚕', concept: 'Transporte' },
  { id: 'manual', emoji: '➕', concept: 'Manual' },
  { id: 'ticket', emoji: '🧾', concept: 'Ticket' },
];

const apiHost = import.meta.env.VITE_API_HOST || '';
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '/api/v1';

const QuickExpenseFAB: React.FC<QuickExpenseFABProps> = ({ groupId, token, userId, members, onExpenseAdded, onOpenManual, onUploadTicket }) => {
  const { user } = useAuth();
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeIcon, setActiveIcon] = useState('🍺');
  const [amount, setAmount] = useState(3.0);
  const [showIconSelector, setShowIconSelector] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [prices, setPrices] = useState<Record<string, number>>({});
  
  const [isMoveMode, setIsMoveMode] = useState(false);
  const [fabPosition, setFabPosition] = useState<{x: number | null, y: number | null}>({ x: null, y: null });
  const moveTimerRef = useRef<NodeJS.Timeout | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  // Cargar preferencias de posición
  useEffect(() => {
    if (userId) {
      const savedPos = localStorage.getItem(`fab-pos-${userId}`);
      if (savedPos) {
        try {
          setFabPosition(JSON.parse(savedPos));
        } catch (e) {}
      }
    }
  }, [userId]);

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
      grupo_id: groupId,
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

  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const wasLongPressRef = useRef(false);

  const handlePointerDown = (e: React.PointerEvent) => {
    setStartX(e.clientX);
    setStartY(e.clientY);
    wasLongPressRef.current = false;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    if (!isExpanded) {
      longPressTimerRef.current = setTimeout(() => {
        wasLongPressRef.current = true;
        setShowIconSelector(true);
        if (navigator.vibrate) navigator.vibrate(50);
      }, 1000);
    }
  };

  const handleDragHandlePointerDown = (e: React.PointerEvent) => {
    setIsMoveMode(true);
    setStartX(e.clientX);
    setStartY(e.clientY);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    e.stopPropagation();
    e.preventDefault();
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (startX === 0) return;
    const dx = e.clientX - startX;
    const dy = startY - e.clientY;
    
    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    }

    if (isMoveMode) {
      setOffsetX(dx);
      setOffsetY(e.clientY - startY);
      return;
    }
    
    // Si se arrastra horizontalmente (confirm/cancel)
    if (Math.abs(dx) > Math.abs(dy)) {
      setOffsetX(dx);
      setOffsetY(0);
    } else {
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
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    if (isMoveMode) {
      setIsMoveMode(false);
      setStartX(0);
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);

      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        // Calculate relative position to screen size (vw / vh) based on center
        const percentX = ((rect.left + rect.width / 2) / window.innerWidth) * 100;
        const percentY = ((rect.top + rect.height / 2) / window.innerHeight) * 100;
        
        const pos = { x: percentX, y: percentY };
        setFabPosition(pos);
        if (userId) {
          localStorage.setItem(`fab-pos-${userId}`, JSON.stringify(pos));
        }
      }
      setOffsetX(0);
      setOffsetY(0);
      return;
    }

    if (startX === 0) return;
    setStartX(0);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    
    // Threshold para confirmar el swipe.
    if (offsetX > 80) {
      handleDragSubmit();
    } else if (offsetX < -80) {
      setIsExpanded(false);
    }
    setOffsetX(0);
    setOffsetY(0);
  };

  const handleIconLongPress = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    setShowIconSelector(true);
  };

  let pillStyle: any = {};
  if (!isMoveMode) {
    if (offsetX > 0) {
      pillStyle = { transform: `translateX(${offsetX}px)`, backgroundColor: `rgba(46, 204, 113, ${Math.min(offsetX/100, 1)})` };
    } else if (offsetX < 0) {
      pillStyle = { transform: `translateX(${offsetX}px)`, backgroundColor: `rgba(231, 76, 60, ${Math.min(Math.abs(offsetX)/100, 1)})` };
    }
  }

  const containerStyle: any = fabPosition.x !== null && fabPosition.y !== null ? {
    left: `${Math.max(0, Math.min(fabPosition.x || 0, 100))}vw`,
    top: `${Math.max(0, Math.min(fabPosition.y || 0, 100))}vh`,
    right: 'auto',
    bottom: 'auto',
    margin: 0,
    transform: 'translate(-50%, -50%)'
  } : {};
  if (isMoveMode) {
    if (fabPosition.x !== null) {
      containerStyle.transform = `translate(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px))`;
    } else {
      containerStyle.transform = `translate(${offsetX}px, ${offsetY}px)`;
    }
    containerStyle.zIndex = 1001;
  }

  const handleMainClick = () => {
    if (wasLongPressRef.current) {
      wasLongPressRef.current = false;
      return;
    }
    // Si hubo un arrastre significativo, ignoramos el click
    if (Math.abs(offsetX) > 10 || Math.abs(offsetY) > 10) return;

    if (isMoveMode) return;
    if (activeIcon === '➕') {
      onOpenManual();
    } else if (activeIcon === '🧾') {
      onUploadTicket();
    } else {
      setIsExpanded(true);
    }
  };

  const isTopHalf = fabPosition.y !== null && fabPosition.y < 50;

  return (
    <div className={`quick-expense-fab-container ${isExpanded ? 'expanded' : ''} ${isMoveMode ? 'moving' : ''} ${isTopHalf ? 'icons-below' : ''}`} ref={containerRef} style={containerStyle}>
      {showIconSelector && (
        <div className="icon-selector">
          {PREDEFINED_ICONS.map(i => (
            <button 
              key={i.id} 
              onClick={() => { setActiveIcon(i.emoji); setShowIconSelector(false); }}
              className={activeIcon === i.emoji ? 'active' : ''}
              title={i.concept}
            >
              {i.emoji}
            </button>
          ))}
        </div>
      )}
      {!isExpanded ? (
        <div className="fab-wrapper" style={{ position: 'relative' }}>
          <div 
            className="drag-handle" 
            onPointerDown={handleDragHandlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            title="Arrastra para mover"
          >
            <div className="drag-dots"></div>
          </div>
          <button 
            className="fab-button round" 
            onClick={handleMainClick}
            onContextMenu={handleIconLongPress}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            style={pillStyle}
            title="Gasto rápido (Mantener para opciones)"
          >
            {activeIcon}
          </button>
        </div>
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
              onClick={(e) => { e.stopPropagation(); setShowIconSelector(prev => !prev); }}
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
