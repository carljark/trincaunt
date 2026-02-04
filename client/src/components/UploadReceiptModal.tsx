import React, { useState, useRef } from 'react';
import axios from 'axios';

interface UploadReceiptModalProps {
  token: string;
  onClose: () => void;
  onUploadSuccess: (data: any) => void;
}

const apiHost = import.meta.env.VITE_API_HOST;
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '/api/v1';

const UploadReceiptModal: React.FC<UploadReceiptModalProps> = ({ token, onClose, onUploadSuccess }) => {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      const reader = new FileReader();
      reader.onload = (e) => {
        setImageSrc(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };
  
  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      setError('No se pudo acceder a la cámara. Asegúrate de tener permisos y que tu conexión sea HTTPS.');
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  };

  const takePicture = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext('2d');
      context?.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
      const dataUrl = canvas.toDataURL('image/png');
      setImageSrc(dataUrl);
      stopCamera();
    }
  };

  const uploadImage = async () => {
    if (!imageSrc) return;

    setLoading(true);
    setError(null);
    
    // Convert base64 to blob
    const fetchRes = await fetch(imageSrc);
    const blob = await fetchRes.blob();

    const formData = new FormData();
    formData.append('receipt', blob, 'receipt.png');

    try {
      const response = await axios.post(`${apiHost}${apiBaseUrl}/receipts/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          'Authorization': `Bearer ${token}`,
        },
      });
      onUploadSuccess(response.data);
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error al subir la imagen.');
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h3>Subir Recibo</h3>
        {error && <p className="error-message">{error}</p>}
        
        <div className="upload-options">
          {!stream && !imageSrc && (
            <>
              <button className="button button--primary" onClick={startCamera}>Tomar Foto</button>
              <label className="button button--secondary">
                Subir de la Galería
                <input type="file" accept="image/*" onChange={handleFileChange} style={{ display: 'none' }} />
              </label>
            </>
          )}
        </div>

        {stream && (
          <div className="camera-view">
            <video ref={videoRef} autoPlay playsInline style={{ width: '100%', borderRadius: '8px' }} />
            <div className="modal-actions" style={{ marginTop: '1rem' }}>
              <button className="button button--primary" onClick={takePicture}>Capturar</button>
              <button className="button button--secondary" onClick={stopCamera}>Cancelar</button>
            </div>
          </div>
        )}

        {imageSrc && !stream && (
          <div className="image-preview">
            <img src={imageSrc} alt="Vista previa del recibo" style={{ maxWidth: '100%', borderRadius: '8px' }} />
            <div className="modal-actions" style={{ marginTop: '1rem' }}>
              <button className="button button--primary" onClick={uploadImage} disabled={loading}>
                {loading ? 'Subiendo...' : 'Confirmar y Subir'}
              </button>
              <button className="button button--secondary" onClick={() => setImageSrc(null)} disabled={loading}>
                Volver a seleccionar
              </button>
            </div>
          </div>
        )}

        <div className="modal-actions" style={{ justifyContent: 'center', marginTop: '1.5rem' }}>
           {!stream && !imageSrc && (
            <button type="button" className="button button--secondary" onClick={onClose} disabled={loading}>
              Cerrar
            </button>
           )}
        </div>
      </div>
    </div>
  );
};

export default UploadReceiptModal;
