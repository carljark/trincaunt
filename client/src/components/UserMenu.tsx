import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { MoreVerticalIcon } from './icons';
import './UserMenu.scss';

interface UserMenuProps {
  onExportXLSX?: () => void;
}

const UserMenu: React.FC<UserMenuProps> = ({ onExportXLSX }) => {
  const [isOpen, setIsOpen] = useState(false);
  const { logout, user, token } = useAuth();
  const menuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const toggleMenu = () => setIsOpen(!isOpen);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  const handleDownloadDDBB = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${import.meta.env.VITE_API_HOST}/api/v1/db/export`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `backup_db_${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setIsOpen(false);
    } catch (err) {
      alert('Error descargando BD: ' + err);
    }
  };

  const handleUploadDDBB = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !token) return;

    if (!window.confirm("¿Seguro que quieres sobreescribir TODA la base de datos?")) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const jsonContent = JSON.parse(event.target?.result as string);
        const res = await fetch(`${import.meta.env.VITE_API_HOST}/api/v1/db/import`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(jsonContent)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message);
        alert('BD restaurada con éxito');
        window.location.reload();
      } catch (err) {
        alert('Error cargando BD: ' + err);
      }
    };
    reader.readAsText(file);
    setIsOpen(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="user-menu" ref={menuRef}>
      <button
        type="button"
        className={`user-menu__trigger ${isOpen ? 'user-menu__trigger--open' : ''}`}
        onClick={toggleMenu}
        aria-label="Menú de usuario"
        aria-haspopup="true"
        aria-expanded={isOpen}
      >
        <MoreVerticalIcon />
      </button>
      {isOpen && (
        <div className="user-menu__dropdown">
          {user?.nombre && <div className="user-menu__user">{user.nombre}</div>}
          <Link to="/preferences" className="user-menu__item" onClick={() => setIsOpen(false)}>Preferencias</Link>
          {onExportXLSX && (
            <button type="button" className="user-menu__item" onClick={() => { onExportXLSX(); setIsOpen(false); }}>
              Exportar a Excel
            </button>
          )}
          {user?.email === 'elcal.lico@gmail.com' && (
            <>
              <button type="button" className="user-menu__item" onClick={handleDownloadDDBB}>Descargar copia de la BD</button>
              <button type="button" className="user-menu__item" onClick={() => { fileInputRef.current?.click(); }}>Restaurar BD</button>
            </>
          )}
          <button type="button" className="user-menu__item user-menu__item--danger" onClick={() => { logout(); setIsOpen(false); }}>
            Cerrar sesión
          </button>
        </div>
      )}
      {/* Fuera del desplegable: si se desmontara al cerrarlo, se perdería el archivo elegido */}
      {user?.email === 'elcal.lico@gmail.com' && (
        <input type="file" ref={fileInputRef} hidden accept=".json" onChange={handleUploadDDBB} />
      )}
    </div>
  );
};

export default UserMenu;
