// client/src/CameraCapture.tsx
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { CameraCaptureProps, UploadResponse } from './types';
import { dataURLtoBlob, compressImage, uploadFile } from './uploadUtils';
import { useAuth } from './contexts/AuthContext'; // Assuming AuthContext provides the token

const CameraCapture: React.FC<CameraCaptureProps> = ({
  onUploadSuccess,
  onUploadError,
  maxSizeKB = 500, // Default to 500KB
}) => {
  const { token } = useAuth(); // Get token from AuthContext

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isCameraActive, setIsCameraActive] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);

  const startCamera = useCallback(async () => {
    setError(null);
    setPhotoPreview(null);
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }, // Prefer rear camera on mobile
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
      setIsCameraActive(true);
    } catch (err: any) {
      setError(`Error al acceder a la cámara: ${err.message || 'Permiso denegado o cámara no encontrada.'}`);
      console.error('Camera access error:', err);
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
    setIsCameraActive(false);
  }, [stream]);

  const capturePhoto = useCallback(() => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext('2d');

      if (context) {
        context.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.9); // Capture as JPEG for better compression
        setPhotoPreview(dataUrl);
        stopCamera();
      }
    }
  }, [stopCamera]);

  const retakePhoto = useCallback(() => {
    setPhotoPreview(null);
    startCamera(); // Restart camera for a new capture
  }, [startCamera]);

  const handleFileSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      const reader = new FileReader();
      reader.onload = (e) => {
        setPhotoPreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  }, []);

  const handleUpload = useCallback(async () => {
    if (!photoPreview || !token) {
      setError('No hay foto para subir o no estás autenticado.');
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      let finalDataUrl = photoPreview;
      let blob: Blob;

      // Convert to Blob to check size before compression
      let initialBlob = await dataURLtoBlob(photoPreview);

      if (initialBlob.size > maxSizeKB * 1024) {
        // Only compress if size exceeds maxSizeKB
        finalDataUrl = await compressImage(photoPreview);
        blob = await dataURLtoBlob(finalDataUrl);
      } else {
        blob = initialBlob;
      }

      const response: UploadResponse = await uploadFile(blob, token);

      if (response.success) {
        onUploadSuccess?.(response);
        setPhotoPreview(null); // Clear preview after successful upload
      } else {
        setError(response.message || 'Error desconocido al subir la foto.');
        onUploadError?.(new Error(response.message || 'Upload failed'));
      }
    } catch (err: any) {
      setError(`Error al subir la imagen: ${err.message || 'Error de red.'}`);
      onUploadError?.(err);
    } finally {
      setIsUploading(false);
    }
  }, [photoPreview, token, maxSizeKB, onUploadSuccess, onUploadError]);

  // Cleanup camera stream on component unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  return (
    <div className="camera-capture-container p-4 max-w-md mx-auto bg-white rounded-lg shadow-md">
      <h2 className="text-2xl font-bold text-center mb-4">Subir Recibo</h2>

      {error && <p className="text-red-500 text-center mb-4">{error}</p>}

      {!isCameraActive && !photoPreview && (
        <div className="flex flex-col space-y-4">
          <button
            onClick={startCamera}
            className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
          >
            Activar Cámara
          </button>
          <label className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded cursor-pointer text-center">
            Subir desde Galería
            <input type="file" accept="image/*" onChange={handleFileSelect} className="hidden" ref={fileInputRef} />
          </label>
        </div>
      )}

      {isCameraActive && (
        <div className="camera-view mb-4">
          <video ref={videoRef} autoPlay playsInline className="w-full rounded-md border border-gray-300"></video>
          <button
            onClick={capturePhoto}
            className="mt-4 w-full bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded"
          >
            Capturar Foto
          </button>
        </div>
      )}

      {photoPreview && !isCameraActive && (
        <div className="photo-preview mb-4">
          <img src={photoPreview} alt="Captured preview" className="w-full rounded-md border border-gray-300 mb-4" />
          <div className="flex space-x-2">
            <button
              onClick={handleUpload}
              disabled={isUploading}
              className="flex-1 bg-purple-500 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded"
            >
              {isUploading ? 'Subiendo...' : 'Subir Foto'}
            </button>
            <button
              onClick={retakePhoto}
              disabled={isUploading}
              className="flex-1 bg-yellow-500 hover:bg-yellow-700 text-white font-bold py-2 px-4 rounded"
            >
              Tomar de nuevo
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CameraCapture;
