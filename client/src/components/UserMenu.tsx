import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './UserMenu.scss';

interface UserMenuProps {
  onExportXLSX?: () => void;
}

const UserMenu: React.FC<UserMenuProps> = ({ onExportXLSX }) => {
  const [isOpen, setIsOpen] = useState(false);
  const { logout } = useAuth();
  const menuRef = useRef<HTMLDivElement>(null);

  const toggleMenu = () => setIsOpen(!isOpen);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  return (
    <div className="user-menu-container" ref={menuRef}>
      <button className="menu-trigger" onClick={toggleMenu} aria-label="Menu de usuario">
        &#8942;
      </button>
      <div className={`menu-dropdown ${isOpen ? 'open' : ''}`}>
        <Link to="/preferences" onClick={() => setIsOpen(false)}>Preferencias</Link>
        {onExportXLSX && (
          <button onClick={() => { onExportXLSX(); setIsOpen(false); }}>
            Exportar a XLSX
          </button>
        )}
        <button className="logout-item" onClick={() => { logout(); setIsOpen(false); }}>
          Logout
        </button>
      </div>
    </div>
  );
};

export default UserMenu;
