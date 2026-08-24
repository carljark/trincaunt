import React, { useState, useRef, useEffect } from 'react';
import './AudioRecorderModal.scss';

interface AudioRecorderModalProps {
  onClose: () => void;
  onCapture: (file: File) => void;
}

const AudioRecorderModal: React.FC<AudioRecorderModalProps> = ({ onClose, onCapture }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [error, setError] = useState('');
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      stopRecording();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const file = new File([blob], `audio_${Date.now()}.webm`, { type: 'audio/webm' });
        onCapture(file);
        
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

    } catch (err: any) {
      setError('No se pudo acceder al micrófono. Revisa los permisos.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content audio-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>🎤 Grabar audio</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {error ? (
            <p className="error">{error}</p>
          ) : (
            <div className="recording-status">
              <div className={`record-indicator ${isRecording ? 'pulsing' : ''}`}></div>
              <span className="time">{recordingTime}s</span>
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="cancel-button" onClick={onClose}>Cancelar</button>
          {!error && (
            isRecording ? (
              <button className="stop-button primary-button danger" onClick={stopRecording}>Detener y Enviar</button>
            ) : (
              <button className="start-button primary-button" onClick={startRecording}>Comenzar Grabación</button>
            )
          )}
        </div>
      </div>
    </div>
  );
};

export default AudioRecorderModal;
