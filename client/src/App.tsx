import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import GroupDetailPage from './pages/GroupDetailPage';
import PreferencesPage from './pages/PreferencesPage';
import AdminPage from './pages/AdminPage';
import OAuthConsentPage from './pages/OAuthConsentPage';

// Componente para proteger rutas: sin sesión, al login, que luego vuelve aquí
const PrivateRoute: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  return isAuthenticated ? children : <Navigate to="/login" state={{ from: location.pathname + location.search }} />;
};

const AppContent: React.FC = () => {
  const { isAuthenticated } = useAuth();
  
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route 
        path="/" 
        element={
          <PrivateRoute>
            <HomePage />
          </PrivateRoute>
        } 
      />
      <Route 
        path="/group/:groupId" 
        element={
          <PrivateRoute>
            <GroupDetailPage />
          </PrivateRoute>
        } 
      />
      <Route 
        path="/preferences" 
        element={
          <PrivateRoute>
            <PreferencesPage />
          </PrivateRoute>
        } 
      />
      <Route 
        path="/admin" 
        element={
          <PrivateRoute>
            <AdminPage />
          </PrivateRoute>
        } 
      />
      <Route
        path="/oauth/consent"
        element={
          <PrivateRoute>
            <OAuthConsentPage />
          </PrivateRoute>
        }
      />
      {/* Redirección por defecto */}
      <Route path="*" element={<Navigate to={isAuthenticated ? "/" : "/login"} />} />
    </Routes>
  );
};


import { NotificationProvider } from './contexts/NotificationContext';
import { SocketProvider } from './contexts/SocketContext';
import NotificationBell from './components/NotificationBell';
import InstallPrompt from './components/InstallPrompt';
import UpdatePrompt from './components/UpdatePrompt';

const App: React.FC = () => {
  return (
    <AuthProvider>
      <NotificationProvider>
          <SocketProvider>
        <Router>
          <NotificationBell />
          <AppContent />
          <InstallPrompt />
          <UpdatePrompt />
        </Router>
                </SocketProvider>
        </NotificationProvider>
    </AuthProvider>
  );
};

export default App;