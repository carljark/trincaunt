// client/src/AppCameraExample.tsx
import React from 'react';
import CameraCapture from './CameraCapture'; // Assuming CameraCapture is in the same directory as App.tsx
import { UploadResponse } from './types';
import { AuthProvider } from './contexts/AuthContext'; // Needed if CameraCapture uses useAuth

const AppCameraExample: React.FC = () => {
  const handleUploadSuccess = (response: UploadResponse) => {
    console.log('Foto subida exitosamente:', response);
    alert(`Foto subida: ${response.filename || response.url}`);
    // Aquí puedes actualizar el estado global, mostrar notificación, etc.
  };

  const handleUploadError = (error: Error) => {
    console.error('Error al subir la foto:', error);
    alert(`Error al subir la foto: ${error.message}`);
  };

  return (
    // AuthProvider is needed if CameraCapture uses useAuth to get the token
    // In a real app, this would wrap your entire application.
    // For this example, we're assuming a mock token or that auth is handled elsewhere.
    <AuthProvider> 
      <div className="p-4 bg-gray-100 min-h-screen">
        <h1 className="text-3xl font-bold text-center mb-8">Componente de Cámara para Subida de Recibos</h1>
        <CameraCapture
          // userId="user123" // Optional: pass a user ID if your backend requires it for the upload
          onUploadSuccess={handleUploadSuccess}
          onUploadError={handleUploadError}
          maxSizeKB={1024} // Max 1MB
        />
      </div>
    </AuthProvider>
  );
};

export default AppCameraExample;
