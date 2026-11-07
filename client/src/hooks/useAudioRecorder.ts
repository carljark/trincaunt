import { useCallback, useEffect, useRef, useState } from 'react';

// Safari (iPhone) graba en audio/mp4 y Chrome en audio/webm: se usa el formato real del grabador
export const fileForRecording = (chunks: BlobPart[], recorderType: string) => {
  const type = (recorderType || 'audio/webm').split(';')[0];
  const extension = type.split('/')[1] === 'mp4' ? 'm4a' : type.split('/')[1];
  return new File([new Blob(chunks, { type })], `audio_${Date.now()}.${extension}`, { type });
};

export const formatRecordingTime = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

/**
 * Graba una nota de voz. `start()` pide el micrófono y empieza; `stop()` termina y devuelve
 * el archivo; `cancel()` lo descarta. Al desmontar se apaga el micrófono sin devolver nada.
 */
export const useAudioRecorder = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState('');

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resolveRef = useRef<((file: File | null) => void) | null>(null);

  const cleanup = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    setIsRecording(false);
  }, []);

  useEffect(() => () => {
    resolveRef.current = null;
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    cleanup();
  }, [cleanup]);

  const start = useCallback(async () => {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const resolve = resolveRef.current;
        resolveRef.current = null;
        cleanup();
        resolve?.(fileForRecording(chunksRef.current, recorder.mimeType));
      };

      recorder.start();
      setSeconds(0);
      setIsRecording(true);
      timerRef.current = setInterval(() => setSeconds(prev => prev + 1), 1000);
    } catch {
      cleanup();
      setError('No se pudo acceder al micrófono. Revisa los permisos.');
    }
  }, [cleanup]);

  /** Termina la grabación y devuelve el audio (null si no se estaba grabando). */
  const stop = useCallback(() => new Promise<File | null>(resolve => {
    const recorder = recorderRef.current;
    if (recorder?.state !== 'recording') return resolve(null);
    resolveRef.current = resolve;
    recorder.stop();
  }), []);

  const cancel = useCallback(() => {
    resolveRef.current = null;
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    cleanup();
  }, [cleanup]);

  return { isRecording, seconds, error, start, stop, cancel };
};
