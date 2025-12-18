import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Link } from 'react-router-dom';

const HomePage: React.FC = () => {
  const { user, token, logout } = useAuth();
  const [groups, setGroups] = useState<any[]>([]);

  const fetchGroups = async () => {
    if (!token) return;
    try {
      const res = await fetch(`http://localhost:3000/api/v1/groups`, {
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
      await fetch(`http://localhost:3000/api/v1/groups`, {
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
    <div style={{ padding: 20 }}>
      <h1>Bienvenido, {user?.nombre}</h1>
      <button onClick={logout}>Logout</button>
      <hr />
      <button onClick={createGroup}>Crear Nuevo Grupo</button>
      
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
  );
};

export default HomePage;
