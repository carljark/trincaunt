import React, { createContext, useContext, useState, ReactNode } from 'react';

export type JobStatus = 'loading' | 'success' | 'error';

export interface BackgroundJob {
  id: string;
  title: string;
  status: JobStatus;
  message: string;
}

interface NotificationContextType {
  jobs: BackgroundJob[];
  addJob: (job: Omit<BackgroundJob, 'id'>) => string;
  updateJob: (id: string, updates: Partial<BackgroundJob>) => void;
  removeJob: (id: string) => void;
  unreadCount: number;
  clearUnread: () => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider = ({ children }: { children: ReactNode }) => {
  const [jobs, setJobs] = useState<BackgroundJob[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const addJob = (job: Omit<BackgroundJob, 'id'>) => {
    const id = Math.random().toString(36).substr(2, 9);
    setJobs((prev) => [{ ...job, id }, ...prev]);
    if (job.status !== 'loading') {
      setUnreadCount((prev) => prev + 1);
    }
    return id;
  };

  const updateJob = (id: string, updates: Partial<BackgroundJob>) => {
    setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, ...updates } : j)));
    if (updates.status === 'success' || updates.status === 'error') {
      setUnreadCount((prev) => prev + 1);
    }
  };

  const removeJob = (id: string) => {
    setJobs((prev) => prev.filter((j) => j.id !== id));
  };

  const clearUnread = () => {
    setUnreadCount(0);
  };

  return (
    <NotificationContext.Provider value={{ jobs, addJob, updateJob, removeJob, unreadCount, clearUnread }}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications debe usarse dentro de un NotificationProvider');
  }
  return context;
};
