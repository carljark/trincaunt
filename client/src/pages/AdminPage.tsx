import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { IUser } from '../types/user/IUser';
import { useNavigate } from 'react-router-dom';
import './AdminPage.scss';

const apiHost = import.meta.env.VITE_API_HOST || '';
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '/api/v1';

const AdminPage: React.FC = () => {
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState<IUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user?.role !== 'admin') {
      navigate('/');
      return;
    }

    const fetchUsers = async () => {
      try {
        const res = await fetch(`${apiHost}${apiBaseUrl}/users/admin/all`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setUsers(data.data);
        }
      } catch (err) {
        console.error('Error cargando usuarios', err);
      } finally {
        setLoading(false);
      }
    };

    fetchUsers();
  }, [user, navigate, token]);

  const toggleAi = async (id: string, currentStatus: boolean) => {
    try {
      const res = await fetch(`${apiHost}${apiBaseUrl}/users/admin/${id}/ai`, {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({ aiEnabled: !currentStatus })
      });
      if (res.ok) {
        setUsers(prev => prev.map(u => u._id === id ? { ...u, aiEnabled: !currentStatus } : u));
      }
    } catch (err) {
      console.error('Error actualizando usuario', err);
    }
  };

  if (loading) return <div>Cargando...</div>;

  return (
    <div className="admin-page">
      <h2>Panel de Administración</h2>
      <p>Control de acceso a funcionalidades premium (Inteligencia Artificial)</p>
      
      <div className="users-list">
        {users.map(u => (
          <div key={u._id} className="user-card">
            <div className="user-info">
              <strong>{u.nombre}</strong> <span className="badge">{u.role}</span>
              <div className="email">{u.email}</div>
            </div>
            
            {u.role !== 'admin' && (
              <div className="user-actions">
                <label className="toggle-switch">
                  <input 
                    type="checkbox" 
                    checked={!!u.aiEnabled} 
                    onChange={() => toggleAi(u._id, !!u.aiEnabled)}
                  />
                  <span className="slider"></span>
                  <span className="label">Acceso a IA</span>
                </label>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default AdminPage;
