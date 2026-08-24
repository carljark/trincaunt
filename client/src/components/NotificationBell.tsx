import React, { useState } from 'react';
import { useNotifications } from '../contexts/NotificationContext';
import './NotificationBell.scss';

const NotificationBell: React.FC = () => {
  const { jobs, unreadCount, clearUnread } = useNotifications();
  const [isOpen, setIsOpen] = useState(false);

  const toggleDropdown = () => {
    setIsOpen(!isOpen);
    if (!isOpen) clearUnread();
  };

  return (
    <div className="notification-bell-container">
      <button className="bell-button" onClick={toggleDropdown}>
        🔔
        {unreadCount > 0 && <span className="badge">{unreadCount}</span>}
      </button>

      {isOpen && (
        <div className="dropdown">
          <div className="dropdown-header">
            <h4>Notificaciones</h4>
            <button onClick={() => setIsOpen(false)}>×</button>
          </div>
          <div className="dropdown-body">
            {jobs.length === 0 ? (
              <p className="empty">No hay notificaciones</p>
            ) : (
              jobs.map(job => (
                <div key={job.id} className={`job-item ${job.status}`}>
                  <div className="job-title">{job.title}</div>
                  <div className="job-message">{job.message}</div>
                  {job.status === 'loading' && <div className="spinner">↻</div>}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
