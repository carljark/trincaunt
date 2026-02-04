import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import GroupDetailPage from './pages/GroupDetailPage';
import CameraCapture from './CameraCapture';
import { UploadResponse } from './types';
import './styles/CameraButton.scss';

// Componente para proteger rutas
const PrivateRoute: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? children : <Navigate to="/login" />;
};

const AppContent: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const [showCameraModal, setShowCameraModal] = useState(false);

  const handleOpenCameraModal = () => setShowCameraModal(true);
  const handleCloseCameraModal = () => setShowCameraModal(false);

  const handleUploadSuccess = (response: UploadResponse) => {
    console.log('Upload successful:', response);
    alert('Recibo subido con éxito. Próximamente se procesará.');
    setShowCameraModal(false);
  };

  const handleUploadError = (error: Error) => {
    console.error('Upload error:', error);
    alert(`Error al subir la imagen: ${error.message}`);
  };

  return (
    <>
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
        {/* Redirección por defecto */}
        <Route path="*" element={<Navigate to={isAuthenticated ? "/" : "/login"} />} />
      </Routes>

      {isAuthenticated && (
        <>
          <button className="camera-ia-button" onClick={handleOpenCameraModal}>
            Cam-&gt;IA
          </button>
          {showCameraModal && (
            <div className="modal-overlay">
              <div className="modal-content">
                <CameraCapture
                  onUploadSuccess={handleUploadSuccess}
                  onUploadError={handleUploadError}
                />
                <button
                  className="button button--secondary"
                  style={{ marginTop: '1rem', width: '100%' }}
                  onClick={handleCloseCameraModal}
                >
                  Cerrar
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
};


const App: React.FC = () => {
  return (
    <AuthProvider>
      <Router>
        <AppContent />
      </Router>
    </AuthProvider>
  );
};

export default App;