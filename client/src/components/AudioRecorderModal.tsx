import React, { useState, useRef, useEffect } from 'react';
import Dialog from './Dialog';
import './AudioRecorderModal.scss';

interface AudioRecorderModalProps {
  onClose: () => void;
  onCapture: (file: File) => void;
}

const formatTime = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

// Safari (iPhone) graba en audio/mp4 y Chrome en audio/webm: se usa el formato real del grabador
const fileForRecording = (chunks: BlobPart[], recorderType: string) => {
  const type = (recorderType || 'audio/webm').split(';')[0];
  const extension = type.split('/')[1] === 'mp4' ? 'm4a' : type.split('/')[1];
  return new File([new Blob(chunks, { type })], `audio_${Date.now()}.${extension}`, { type });
};

const AudioRecorderModal: React.FC<AudioRecorderModalProps> = ({ onClose, onCapture }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [error, setError] = useState('');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Solo se envía el audio al pulsar «Detener y enviar», no al cancelar o cerrar
  const sendOnStopRef = useRef(false);

  // Al desmontar (cancelar, cerrar, Escape) se apaga el micrófono aunque se esté grabando
  useEffect(() => {
    return () => {
      sendOnStopRef.current = false;
      if (timerRef.current) clearInterval(timerRef.current);
      if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
      streamRef.current?.getTracks().forEach(track => track.stop());
    };
  }, []);

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
        stream.getTracks().forEach(track => track.stop());
        if (sendOnStopRef.current) onCapture(fileForRecording(chunksRef.current, mediaRecorder.mimeType));
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);

      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

    } catch {
      setError('No se pudo acceder al micrófono. Revisa los permisos.');
    }
  };

  const stopAndSend = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      sendOnStopRef.current = true;
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  return (
    <Dialog
      title="Grabar audio"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="audio-recorder__button audio-recorder__button--secondary" onClick={onClose}>Cancelar</button>
          {!error && (
            isRecording ? (
              <button type="button" className="audio-recorder__button audio-recorder__button--danger" onClick={stopAndSend}>Detener y enviar</button>
            ) : (
              <button type="button" className="audio-recorder__button audio-recorder__button--primary" onClick={startRecording}>Empezar a grabar</button>
            )
          )}
        </>
      }
    >
      {error ? (
        <p className="audio-recorder__error" role="alert">{error}</p>
      ) : (
        <div className="audio-recorder">
          <span className={`audio-recorder__indicator ${isRecording ? 'audio-recorder__indicator--recording' : ''}`} aria-hidden="true" />
          <span className="audio-recorder__time" role="timer" aria-live="off">{formatTime(recordingTime)}</span>
          <p className="audio-recorder__hint">
            {isRecording ? 'Grabando… Di qué has pagado, cuánto y quién.' : 'Por ejemplo: «Cena en el puerto, 64 euros, pagó Ana».'}
          </p>
        </div>
      )}
    </Dialog>
  );
};

export default AudioRecorderModal;
