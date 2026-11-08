import React, { useEffect, useRef, useState } from 'react';
import './AiChatBar.scss';
import CameraModal from './CameraModal';
import { CameraIcon, CloseIcon, MicIcon, PaperclipIcon, SendIcon, TrashIcon } from './icons';
import { useAudioRecorder, formatRecordingTime } from '../hooks/useAudioRecorder';
import { getCurrentLocationName } from '../utils/location';
import { isMobileDevice } from '../utils/deviceUtils';
import { formatEuros } from '../utils/format';

interface AiChatBarProps {
  groupId: string;
  token: string;
  /** Después de aplicar cambios: la página recarga gastos y presupuesto */
  onExpensesAdded: () => void;
}

/** Acción que propone el asistente, tal y como la devuelve POST /groups/:id/assistant */
interface ProposedAction {
  tipo: string;
  id?: string;
  datos?: Record<string, unknown>;
  resumen: string;
  detalle?: string;
  peligro: boolean;
}

/** En un gasto nuevo se pueden corregir la descripción y el importe (escrito como texto, "12,50") */
interface EditableAction extends ProposedAction {
  descripcion?: string;
  importe?: string;
}

interface ActionResult {
  resumen: string;
  ok: boolean;
  error?: string;
}

interface HistoryTurn {
  rol: 'usuario' | 'asistente';
  texto: string;
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
  respuesta?: string;
  acciones: EditableAction[];
  /** Resultado de aplicar, si alguna acción ha fallado */
  resultados?: ActionResult[];
  error?: string;
};

const apiHost = import.meta.env.VITE_API_HOST || '';
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '/api/v1';
const MAX_HISTORY = 6;

const parseAmount = (value: string) => Number.parseFloat(value.replace(',', '.'));
const isNewExpense = (action: EditableAction) => action.tipo === 'crear_gasto';

const sentLabel = (sent: SentMessage) => {
  switch (sent.kind) {
    case 'text': return sent.text;
    case 'photo': return '📷 Foto';
    case 'audio': return `🎤 Nota de voz (${formatRecordingTime(sent.seconds)})`;
    case 'file': return `📎 ${sent.name}`;
  }
};

const toEditable = (action: ProposedAction): EditableAction => {
  if (!isNewExpense(action)) return action;
  return {
    ...action,
    descripcion: String(action.datos?.descripcion ?? ''),
    importe: Number(action.datos?.monto ?? 0).toFixed(2).replace('.', ',')
  };
};

/**
 * Barra fija abajo, como la de un chat, para hablar con el asistente: se escribe un mensaje,
 * se graba una nota de voz o se manda una foto del ticket. Contesta preguntas sobre el grupo
 * y propone cambios (gastos, partidas fijas, ingresos, presupuesto) en una burbuja; no se
 * aplica nada hasta que el usuario pulsa «Confirmar». Recuerda los últimos mensajes para que
 * se le pueda contestar cuando pregunta algo.
 */
const AiChatBar: React.FC<AiChatBarProps> = ({ groupId, token, onExpensesAdded }) => {
  const [text, setText] = useState('');
  const [exchange, setExchange] = useState<Exchange | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [showCameraModal, setShowCameraModal] = useState(false);
  const recorder = useAudioRecorder();

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const locationRef = useRef<Promise<string> | null>(null);
  const historyRef = useRef<HistoryTurn[]>([]);
  // Respuesta que se espera: si llega una anterior (el usuario ha mandado otra cosa), se ignora
  const requestIdRef = useRef(0);

  const isBusy = exchange?.status === 'thinking' || exchange?.status === 'saving';

  useEffect(() => {
    if (recorder.error) setExchange({ sent: null, status: 'error', acciones: [], error: recorder.error });
  }, [recorder.error]);

  const remember = (...turns: HistoryTurn[]) => {
    historyRef.current = [...historyRef.current, ...turns].slice(-MAX_HISTORY);
  };

  const send = async (sent: SentMessage, media?: File) => {
    const requestId = ++requestIdRef.current;
    setIsEditing(false);
    setExchange({ sent, status: 'thinking', acciones: [] });
    // La ubicación se busca mientras piensa la IA; se usa al guardar gastos nuevos
    locationRef.current = getCurrentLocationName();

    const formData = new FormData();
    if (media) formData.append('media', media);
    if (sent.kind === 'text') formData.append('texto', sent.text);
    formData.append('historial', JSON.stringify(historyRef.current));

    try {
      const res = await fetch(`${apiHost}${apiBaseUrl}/groups/${groupId}/assistant`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });
      const result = await res.json().catch(() => ({}));
      if (requestId !== requestIdRef.current) return;
      if (!res.ok) {
        setExchange({ sent, status: 'error', acciones: [], error: result.message || 'La IA no ha podido leerlo' });
        return;
      }
      const respuesta: string = result.data?.respuesta ?? '';
      const acciones: EditableAction[] = (result.data?.acciones as ProposedAction[] ?? []).map(toEditable);
      remember(
        { rol: 'usuario', texto: sentLabel(sent) },
        { rol: 'asistente', texto: [respuesta, ...acciones.map(a => `Propuesta: ${a.resumen}`)].filter(Boolean).join('\n') }
      );
      setExchange({ sent, status: 'ready', respuesta, acciones });
    } catch {
      if (requestId !== requestIdRef.current) return;
      setExchange({ sent, status: 'error', acciones: [], error: 'Error de red. Inténtalo de nuevo.' });
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
    historyRef.current = [];
    setExchange(null);
    setIsEditing(false);
  };

  const updateAction = (index: number, changes: Partial<EditableAction>) => {
    setExchange(prev => prev && {
      ...prev,
      acciones: prev.acciones.map((a, i) => (i === index ? { ...a, ...changes } : a))
    });
  };

  const removeAction = (index: number) => {
    setExchange(prev => prev && { ...prev, acciones: prev.acciones.filter((_, i) => i !== index) });
  };

  const handleConfirm = async () => {
    if (!exchange || exchange.acciones.length === 0) return;
    const invalid = exchange.acciones.some(a => isNewExpense(a) && (!a.descripcion?.trim() || !(parseAmount(a.importe ?? '') > 0)));
    if (invalid) {
      setIsEditing(true);
      setExchange({ ...exchange, error: 'Cada gasto necesita una descripción y un importe mayor que 0.' });
      return;
    }

    const current = exchange;
    setExchange({ ...current, status: 'saving', error: undefined, resultados: undefined });
    const location = (await locationRef.current) || '';
    const acciones = current.acciones.map(({ descripcion, importe, ...action }) => (
      isNewExpense(action)
        ? {
          ...action,
          datos: {
            ...action.datos,
            descripcion: descripcion!.trim(),
            monto: parseAmount(importe!),
            localization: action.datos?.localization || location
          }
        }
        : action
    ));
    try {
      const res = await fetch(`${apiHost}${apiBaseUrl}/groups/${groupId}/assistant/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ acciones })
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        setExchange({ ...current, status: 'ready', error: result.message || 'No se han podido aplicar los cambios' });
        return;
      }
      const resultados: ActionResult[] = result.data?.resultados ?? [];
      if (resultados.some(r => r.ok)) onExpensesAdded();
      if (resultados.every(r => r.ok)) {
        close();
        return;
      }
      // Lo que ha fallado se queda a la vista; lo aplicado ya no se puede volver a mandar
      setIsEditing(false);
      setExchange({ ...current, status: 'ready', acciones: [], resultados });
    } catch {
      setExchange({ ...current, status: 'ready', error: 'Error de red. Inténtalo de nuevo.' });
    }
  };

  const onlyNewExpenses = !!exchange?.acciones.length && exchange.acciones.every(isNewExpense);
  const total = exchange?.acciones.reduce((sum, a) => sum + (isNewExpense(a) ? parseAmount(a.importe ?? '') || 0 : 0), 0) ?? 0;

  const renderAction = (action: EditableAction, index: number) => {
    const removeButton = (
      <button
        type="button"
        className="ai-chat-bar__remove"
        onClick={() => removeAction(index)}
        aria-label={`Quitar ${(isNewExpense(action) && action.descripcion) || action.resumen}`}
      >
        <TrashIcon />
      </button>
    );
    return (
      <li key={index} className={`ai-chat-bar__draft${action.peligro ? ' ai-chat-bar__draft--danger' : ''}`}>
        {isEditing && isNewExpense(action) ? (
          <div className="ai-chat-bar__draft-fields">
            <input
              className="ai-chat-bar__field ai-chat-bar__field--description"
              value={action.descripcion}
              onChange={e => updateAction(index, { descripcion: e.target.value })}
              aria-label={`Descripción del gasto ${index + 1}`}
            />
            <input
              className="ai-chat-bar__field ai-chat-bar__field--amount"
              value={action.importe}
              inputMode="decimal"
              onChange={e => updateAction(index, { importe: e.target.value })}
              aria-label={`Importe del gasto ${index + 1}`}
            />
            {removeButton}
          </div>
        ) : (
          <div className="ai-chat-bar__draft-summary">
            {isNewExpense(action) ? (
              <>
                <span className="ai-chat-bar__draft-description">{action.descripcion}</span>
                <span className="ai-chat-bar__draft-amount">{formatEuros(parseAmount(action.importe ?? '') || 0)}</span>
              </>
            ) : (
              <span className="ai-chat-bar__draft-description">{action.resumen}</span>
            )}
            {isEditing && removeButton}
          </div>
        )}
        {action.detalle && <span className="ai-chat-bar__draft-meta">{action.detalle}</span>}
      </li>
    );
  };

  const renderReply = () => {
    if (!exchange) return null;
    if (exchange.status === 'thinking') {
      return <p className="ai-chat-bar__status" role="status">Pensando…</p>;
    }
    if (exchange.status === 'error') {
      return <p className="ai-chat-bar__error" role="alert">{exchange.error}</p>;
    }

    return (
      <>
        {exchange.respuesta && <p className="ai-chat-bar__answer">{exchange.respuesta}</p>}
        {exchange.resultados && (
          <ul className="ai-chat-bar__results" aria-label="Resultado">
            {exchange.resultados.map((r, i) => (
              <li key={i} className={`ai-chat-bar__result${r.ok ? '' : ' ai-chat-bar__result--failed'}`}>
                {r.ok ? '✓' : '✗'} {r.resumen}{r.error ? `: ${r.error}` : ''}
              </li>
            ))}
          </ul>
        )}
        {exchange.acciones.length > 0 && (
          <>
            <ul className="ai-chat-bar__drafts" aria-label="Cambios propuestos">
              {exchange.acciones.map(renderAction)}
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
                onClick={handleConfirm}
                disabled={isBusy}
              >
                {exchange.status === 'saving' ? 'Guardando…' : onlyNewExpenses ? `Guardar ${formatEuros(total)}` : 'Confirmar'}
              </button>
            </div>
          </>
        )}
      </>
    );
  };

  return (
    <div className="ai-chat-bar">
      {exchange && (
        <section className="ai-chat-bar__conversation" aria-label="Respuesta de la IA">
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
            placeholder="Escribe un gasto o pregunta…"
            aria-label="Escribe a la IA"
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
