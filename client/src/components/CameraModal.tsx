import React, { useRef, useState, useEffect } from 'react';
import Dialog from './Dialog';
import './CameraModal.scss';

interface CameraModalProps {
  onClose: () => void;
  onCapture: (file: File) => void;
}

const CameraModal: React.FC<CameraModalProps> = ({ onClose, onCapture }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;

    const initCamera = async () => {
      try {
        // Cámara trasera si la hay: es la de fotografiar tickets
        const mediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        // Si el modal se cerró mientras se pedía permiso, no dejar la cámara encendida
        if (cancelled) {
          mediaStream.getTracks().forEach(track => track.stop());
          return;
        }
        stream = mediaStream;
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }
      } catch {
        if (!cancelled) setError('No se pudo acceder a la cámara. Revisa los permisos.');
      }
    };
    initCamera();

    return () => {
      cancelled = true;
      stream?.getTracks().forEach(track => track.stop());
    };
  }, []);

  const handleCapture = () => {
    if (videoRef.current && canvasRef.current) {
      const context = canvasRef.current.getContext('2d');
      if (context) {
        canvasRef.current.width = videoRef.current.videoWidth;
        canvasRef.current.height = videoRef.current.videoHeight;
        context.drawImage(videoRef.current, 0, 0, canvasRef.current.width, canvasRef.current.height);

        canvasRef.current.toBlob(blob => {
          if (blob) {
            const file = new File([blob], `photo_${Date.now()}.jpg`, { type: 'image/jpeg' });
            onCapture(file);
          }
        }, 'image/jpeg');
      }
    }
  };

  return (
    <Dialog
      title="Hacer foto"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="camera-modal__button camera-modal__button--secondary" onClick={onClose}>Cancelar</button>
          {!error && (
            <button type="button" className="camera-modal__button camera-modal__button--primary" onClick={handleCapture} disabled={!ready}>
              Tomar foto
            </button>
          )}
        </>
      }
    >
      {error ? (
        <p className="camera-modal__error" role="alert">{error}</p>
      ) : (
        <div className="camera-modal">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="camera-modal__preview"
            onLoadedData={() => setReady(true)}
          />
          {!ready && <span className="camera-modal__loading">Abriendo la cámara…</span>}
          <canvas ref={canvasRef} hidden />
        </div>
      )}
    </Dialog>
  );
};

export default CameraModal;
