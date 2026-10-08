import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
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

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
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
        {user?.email === 'elcal.lico@gmail.com' && (
          <>
            <button onClick={handleDownloadDDBB}>Download DDBB</button>
            <button onClick={() => { fileInputRef.current?.click(); }}>Cargar DDBB</button>
            <input type="file" ref={fileInputRef} style={{display: 'none'}} accept=".json" onChange={handleUploadDDBB} />
          </>
        )}
        <button className="logout-item" onClick={() => { logout(); setIsOpen(false); }}>
          Logout
        </button>
      </div>
    </div>
  );
};

export default UserMenu;
