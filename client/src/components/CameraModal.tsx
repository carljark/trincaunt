import React, { useRef, useState, useEffect } from 'react';
import './CameraModal.scss';

interface CameraModalProps {
  onClose: () => void;
  onCapture: (file: File) => void;
}

const CameraModal: React.FC<CameraModalProps> = ({ onClose, onCapture }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    const initCamera = async () => {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({ video: true });
        setStream(mediaStream);
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }
      } catch (err: any) {
        setError('No se pudo acceder a la cámara. Revisa los permisos.');
      }
    };
    initCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [stream]);

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
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content camera-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>📸 Hacer foto</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {error ? (
            <p className="error">{error}</p>
          ) : (
            <>
              <video ref={videoRef} autoPlay playsInline className="camera-preview" />
              <canvas ref={canvasRef} style={{ display: 'none' }} />
            </>
          )}
        </div>
        <div className="modal-footer">
          <button className="cancel-button" onClick={onClose}>Cancelar</button>
          {!error && <button className="capture-button primary-button" onClick={handleCapture}>Tomar Foto</button>}
        </div>
      </div>
    </div>
  );
};

export default CameraModal;
