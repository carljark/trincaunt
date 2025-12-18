import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Link } from 'react-router-dom';

import './HomePage.scss'; // Import the new SCSS file

const apiHost = import.meta.env.VITE_API_HOST;

const HomePage: React.FC = () => {
  const { user, token, logout } = useAuth();
  const [groups, setGroups] = useState<any[]>([]);

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

  useEffect(() => {
    fetchGroups();
  }, [token]);

  return (
    <div className="home-page"> {/* Main container */}
      <div className="user-info">
        <h1 className="welcome-message">Bienvenido, {user?.nombre}</h1>
        <button onClick={logout} className="logout-button">Logout</button>
      </div>
      
      <div className="create-group-section">
        <button onClick={createGroup} className="create-group-button">Crear Nuevo Grupo</button>
      </div>
      
      <div className="groups-list-section">
        <h3>Mis Grupos</h3>
        <ul>
          {groups.length > 0 ? (
            groups.map(g => (
              <li key={g._id}>
                <Link to={`/group/${g._id}`}>
                  <strong>{g.nombre}</strong> - {g.miembros.length} miembros
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
