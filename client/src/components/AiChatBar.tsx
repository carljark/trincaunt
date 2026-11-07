import React, { useEffect, useRef, useState } from 'react';
import './AiChatBar.scss';
import CameraModal from './CameraModal';
import { CameraIcon, CloseIcon, MicIcon, PaperclipIcon, SendIcon, TrashIcon } from './icons';
import { useAudioRecorder, formatRecordingTime } from '../hooks/useAudioRecorder';
import { getCurrentLocationName } from '../utils/location';
import { isMobileDevice } from '../utils/deviceUtils';
import { formatEuros, formatShortDate } from '../utils/format';

interface AiChatBarProps {
  groupId: string;
  token: string;
  members: Array<{ _id: string; nombre: string }>;
  onExpensesAdded: () => void;
}

/** Gasto que propone la IA, tal y como lo devuelve POST /expenses/ai-draft */
interface ExpenseDraft {
  descripcion: string;
  monto: number;
  fecha: string;
  categoria: string[];
  localization: string;
  pagado_por: string;
}

/** Borrador en edición: el importe se escribe como texto ("12,50") */
interface EditableDraft extends Omit<ExpenseDraft, 'monto'> {
  importe: string;
}

type SentMessage =
  | { kind: 'text'; text: string }
  | { kind: 'photo' }
  | { kind: 'audio'; seconds: number }
  | { kind: 'file'; name: string };

type Exchange = {
  /** Lo que mandó el usuario (null si falló antes de mandar nada, p. ej. sin micrófono) */
  sent: SentMessage | null;
  status: 'thinking' | 'ready' | 'saving' | 'error';
  drafts: EditableDraft[];
  error?: string;
};

const apiHost = import.meta.env.VITE_API_HOST || '';
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '/api/v1';

const parseAmount = (value: string) => Number.parseFloat(value.replace(',', '.'));

const sentLabel = (sent: SentMessage) => {
  switch (sent.kind) {
    case 'text': return sent.text;
    case 'photo': return '📷 Foto';
    case 'audio': return `🎤 Nota de voz (${formatRecordingTime(sent.seconds)})`;
    case 'file': return `📎 ${sent.name}`;
  }
};

/**
 * Barra fija abajo, como la de un chat, para añadir gastos con la IA: se escribe un mensaje,
 * se graba una nota de voz o se manda una foto del ticket. La IA propone los gastos en una
 * burbuja y no se guarda nada hasta que el usuario pulsa «Guardar».
 */
const AiChatBar: React.FC<AiChatBarProps> = ({ groupId, token, members, onExpensesAdded }) => {
  const [text, setText] = useState('');
  const [exchange, setExchange] = useState<Exchange | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [showCameraModal, setShowCameraModal] = useState(false);
  const recorder = useAudioRecorder();

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const locationRef = useRef<Promise<string> | null>(null);
  // Respuesta que se espera: si llega una anterior (el usuario ha mandado otra cosa), se ignora
  const requestIdRef = useRef(0);

  const isBusy = exchange?.status === 'thinking' || exchange?.status === 'saving';

  useEffect(() => {
    if (recorder.error) setExchange({ sent: null, status: 'error', drafts: [], error: recorder.error });
  }, [recorder.error]);

  const memberName = (id: string) => members.find(m => m._id === id)?.nombre ?? '¿?';

  const send = async (sent: SentMessage, media?: File) => {
    const requestId = ++requestIdRef.current;
    setIsEditing(false);
    setExchange({ sent, status: 'thinking', drafts: [] });
    // La ubicación se busca mientras piensa la IA; se usa al guardar
    locationRef.current = getCurrentLocationName();

    const formData = new FormData();
    formData.append('grupo_id', groupId);
    if (media) formData.append('media', media);
    if (sent.kind === 'text') formData.append('texto', sent.text);

    try {
      const res = await fetch(`${apiHost}${apiBaseUrl}/expenses/ai-draft`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });
      const result = await res.json().catch(() => ({}));
      if (requestId !== requestIdRef.current) return;
      if (!res.ok) {
        setExchange({ sent, status: 'error', drafts: [], error: result.message || 'La IA no ha podido leerlo' });
        return;
      }
      const drafts: EditableDraft[] = (result.data as ExpenseDraft[] ?? []).map(({ monto, ...rest }) => ({
        ...rest,
        importe: monto.toFixed(2).replace('.', ',')
      }));
      setExchange({ sent, status: 'ready', drafts });
    } catch {
      if (requestId !== requestIdRef.current) return;
      setExchange({ sent, status: 'error', drafts: [], error: 'Error de red. Inténtalo de nuevo.' });
    }
  };

  const handleSubmitText = (e: React.FormEvent) => {
    e.preventDefault();
    const message = text.trim();
    if (!message || isBusy) return;
    setText('');
    send({ kind: 'text', text: message });
  };

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>, kind: 'photo' | 'file') => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    send(kind === 'photo' ? { kind: 'photo' } : { kind: 'file', name: file.name }, file);
  };

  const handleCamera = () => {
    if (isMobileDevice()) cameraInputRef.current?.click();
    else setShowCameraModal(true);
  };

  const handleStopRecording = async () => {
    const seconds = recorder.seconds;
    const file = await recorder.stop();
    if (file) send({ kind: 'audio', seconds }, file);
  };

  const close = () => {
    requestIdRef.current++;
    setExchange(null);
    setIsEditing(false);
  };

  const updateDraft = (index: number, changes: Partial<EditableDraft>) => {
    setExchange(prev => prev && {
      ...prev,
      drafts: prev.drafts.map((d, i) => (i === index ? { ...d, ...changes } : d))
    });
  };

  const removeDraft = (index: number) => {
    setExchange(prev => prev && { ...prev, drafts: prev.drafts.filter((_, i) => i !== index) });
  };

  const handleSave = async () => {
    if (!exchange || exchange.drafts.length === 0) return;
    const invalid = exchange.drafts.some(d => !d.descripcion.trim() || !(parseAmount(d.importe) > 0));
    if (invalid) {
      setIsEditing(true);
      setExchange({ ...exchange, error: 'Cada gasto necesita una descripción y un importe mayor que 0.' });
      return;
    }

    const current = exchange;
    setExchange({ ...current, status: 'saving', error: undefined });
    const location = (await locationRef.current) || '';
    try {
      const res = await fetch(`${apiHost}${apiBaseUrl}/expenses/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          grupo_id: groupId,
          gastos: current.drafts.map(({ importe, ...d }) => ({
            ...d,
            descripcion: d.descripcion.trim(),
            monto: parseAmount(importe),
            localization: d.localization || location
          }))
        })
      });
      if (!res.ok) {
        const result = await res.json().catch(() => ({}));
        setExchange({ ...current, status: 'ready', error: result.message || 'No se han podido guardar los gastos' });
        return;
      }
      close();
      onExpensesAdded();
    } catch {
      setExchange({ ...current, status: 'ready', error: 'Error de red. Inténtalo de nuevo.' });
    }
  };

  const total = exchange?.drafts.reduce((sum, d) => sum + (parseAmount(d.importe) || 0), 0) ?? 0;

  const renderReply = () => {
    if (!exchange) return null;
    if (exchange.status === 'thinking') {
      return <p className="ai-chat-bar__status" role="status">Analizando…</p>;
    }
    if (exchange.status === 'error') {
      return <p className="ai-chat-bar__error" role="alert">{exchange.error}</p>;
    }
    if (exchange.drafts.length === 0) {
      return <p className="ai-chat-bar__status">No he encontrado ningún gasto. Prueba con algo como «Cena 45 €, pagó Ana».</p>;
    }

    return (
      <>
        <ul className="ai-chat-bar__drafts">
          {exchange.drafts.map((draft, index) => (
            <li key={index} className="ai-chat-bar__draft">
              {isEditing ? (
                <div className="ai-chat-bar__draft-fields">
                  <input
                    className="ai-chat-bar__field ai-chat-bar__field--description"
                    value={draft.descripcion}
                    onChange={e => updateDraft(index, { descripcion: e.target.value })}
                    aria-label={`Descripción del gasto ${index + 1}`}
                  />
                  <input
                    className="ai-chat-bar__field ai-chat-bar__field--amount"
                    value={draft.importe}
                    inputMode="decimal"
                    onChange={e => updateDraft(index, { importe: e.target.value })}
                    aria-label={`Importe del gasto ${index + 1}`}
                  />
                  <button
                    type="button"
                    className="ai-chat-bar__remove"
                    onClick={() => removeDraft(index)}
                    aria-label={`Quitar ${draft.descripcion || `el gasto ${index + 1}`}`}
                  >
                    <TrashIcon />
                  </button>
                </div>
              ) : (
                <div className="ai-chat-bar__draft-summary">
                  <span className="ai-chat-bar__draft-description">{draft.descripcion}</span>
                  <span className="ai-chat-bar__draft-amount">{formatEuros(parseAmount(draft.importe) || 0)}</span>
                </div>
              )}
              <span className="ai-chat-bar__draft-meta">
                {formatShortDate(draft.fecha)} · {draft.categoria.join(', ')} · pagó {memberName(draft.pagado_por)}
              </span>
            </li>
          ))}
        </ul>
        {exchange.error && <p className="ai-chat-bar__error" role="alert">{exchange.error}</p>}
        <div className="ai-chat-bar__actions">
          {!isEditing && (
            <button type="button" className="ai-chat-bar__action" onClick={() => setIsEditing(true)} disabled={isBusy}>
              Editar
            </button>
          )}
          <button
            type="button"
            className="ai-chat-bar__action ai-chat-bar__action--primary"
            onClick={handleSave}
            disabled={isBusy}
          >
            {exchange.status === 'saving' ? 'Guardando…' : `Guardar ${formatEuros(total)}`}
          </button>
        </div>
      </>
    );
  };

  return (
    <div className="ai-chat-bar">
      {exchange && (
        <section className="ai-chat-bar__conversation" aria-label="Gastos propuestos por la IA">
          <button type="button" className="ai-chat-bar__close" onClick={close} aria-label="Descartar" disabled={exchange.status === 'saving'}>
            <CloseIcon />
          </button>
          {exchange.sent && <p className="ai-chat-bar__bubble ai-chat-bar__bubble--sent">{sentLabel(exchange.sent)}</p>}
          <div className="ai-chat-bar__bubble ai-chat-bar__bubble--reply">{renderReply()}</div>
        </section>
      )}

      <input
        type="file"
        accept="image/*"
        capture="environment"
        className="ai-chat-bar__hidden-input"
        ref={cameraInputRef}
        onChange={e => handleFileSelected(e, 'photo')}
        data-testid="ai-camera-input"
      />
      <input
        type="file"
        accept="image/*,audio/*"
        className="ai-chat-bar__hidden-input"
        ref={fileInputRef}
        onChange={e => handleFileSelected(e, 'file')}
        data-testid="ai-file-input"
      />

      {recorder.isRecording ? (
        <div className="ai-chat-bar__bar">
          <button type="button" className="ai-chat-bar__icon" onClick={recorder.cancel} aria-label="Cancelar grabación">
            <TrashIcon />
          </button>
          <span className="ai-chat-bar__recording" role="timer">
            <span className="ai-chat-bar__recording-dot" aria-hidden="true" />
            {formatRecordingTime(recorder.seconds)} Grabando…
          </span>
          <button type="button" className="ai-chat-bar__send" onClick={handleStopRecording} aria-label="Enviar nota de voz">
            <SendIcon />
          </button>
        </div>
      ) : (
        <form className="ai-chat-bar__bar" onSubmit={handleSubmitText}>
          <button type="button" className="ai-chat-bar__icon" onClick={() => fileInputRef.current?.click()} aria-label="Adjuntar archivo" disabled={isBusy}>
            <PaperclipIcon />
          </button>
          <input
            className="ai-chat-bar__input"
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Escribe un gasto…"
            aria-label="Describe un gasto para la IA"
            enterKeyHint="send"
            maxLength={2000}
          />
          {!text.trim() && (
            <button type="button" className="ai-chat-bar__icon" onClick={handleCamera} aria-label="Hacer foto" disabled={isBusy}>
              <CameraIcon />
            </button>
          )}
          {text.trim() ? (
            <button type="submit" className="ai-chat-bar__send" aria-label="Enviar" disabled={isBusy}>
              <SendIcon />
            </button>
          ) : (
            <button type="button" className="ai-chat-bar__send" onClick={recorder.start} aria-label="Grabar nota de voz" disabled={isBusy}>
              <MicIcon />
            </button>
          )}
        </form>
      )}

      {showCameraModal && (
        <CameraModal
          onClose={() => setShowCameraModal(false)}
          onCapture={file => {
            setShowCameraModal(false);
            send({ kind: 'photo' }, file);
          }}
        />
      )}
    </div>
  );
};

export default AiChatBar;
