import React, { useState } from 'react';
import Dialog from './Dialog';
import { FRECUENCIA_LABELS, Frecuencia, IRecurringItem, RecurringTipo } from '../types/budget';
import { RecurringItemInput } from '../utils/budgetApi';
import { todayYmd } from '../utils/format';
import './RecurringItemDialog.scss';

interface RecurringItemDialogProps {
  item?: IRecurringItem;          // Sin item: alta nueva
  defaultTipo?: RecurringTipo;
  onSave: (data: RecurringItemInput) => Promise<void>;
  onDelete?: () => Promise<void>;
  onClose: () => void;
}

const TIPOS: { id: RecurringTipo; label: string }[] = [
  { id: 'factura', label: 'Factura / gasto fijo' },
  { id: 'ingreso', label: 'Ingreso' }
];

// Alta y edición de una partida fija (nómina, alquiler, luz...)
const RecurringItemDialog: React.FC<RecurringItemDialogProps> = ({ item, defaultTipo = 'factura', onSave, onDelete, onClose }) => {
  const [tipo, setTipo] = useState<RecurringTipo>(item?.tipo ?? defaultTipo);
  const [nombre, setNombre] = useState(item?.nombre ?? '');
  const [importe, setImporte] = useState(item ? String(item.importe) : '');
  const [frecuencia, setFrecuencia] = useState<Frecuencia>(item?.frecuencia ?? 'mensual');
  const [fechaInicio, setFechaInicio] = useState(item?.fechaInicio.slice(0, 10) ?? todayYmd());
  const [fechaFin, setFechaFin] = useState(item?.fechaFin?.slice(0, 10) ?? '');
  const [categoria, setCategoria] = useState(item?.categoria.join(', ') ?? '');
  const [activo, setActivo] = useState(item?.activo ?? true);
  const [prorratear, setProrratear] = useState(item?.prorratear ?? false);
  // Vacía: empieza hoy. Una ya pasada solo vale si es la que tenía (la hucha ya está en marcha)
  const savedDesde = item?.prorratear ? item.prorrateoDesde?.slice(0, 10) ?? '' : '';
  const [desde, setDesde] = useState(savedDesde);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar.');
      setBusy(false);
    }
  };

  // Una factura mensual ya cae entera en cada ciclo: no hay nada que repartir
  // Una mensual solo si tiene fin (cuotas de un aplazamiento): sin fin ya cae igual cada ciclo
  const canProrate = tipo === 'factura' && (frecuencia !== 'mensual' || !!fechaFin);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(importe.replace(',', '.'));
    if (!nombre.trim()) return setError('Ponle un nombre.');
    if (!(amount > 0)) return setError('El importe debe ser mayor que 0.');
    if (fechaFin && fechaFin < fechaInicio) return setError('La fecha de fin no puede ser anterior a la primera.');
    const huchaOn = canProrate && prorratear;
    if (huchaOn && desde && desde !== savedDesde && desde < todayYmd()) return setError('La hucha no puede empezar antes de hoy.');

    void run(() => onSave({
      tipo,
      nombre: nombre.trim(),
      importe: Math.round(amount * 100) / 100,
      frecuencia,
      fechaInicio,
      fechaFin: fechaFin || (item?.fechaFin ? null : undefined),
      categoria: categoria.split(',').map(c => c.trim()).filter(Boolean),
      activo,
      prorratear: huchaOn,
      prorrateoDesde: huchaOn ? desde || (savedDesde ? null : undefined) : undefined
    }));
  };

  return (
    <Dialog
      title={item ? 'Editar partida fija' : 'Nueva partida fija'}
      onClose={onClose}
      onSubmit={submit}
      busy={busy}
      footer={
        confirmingDelete ? (
          <>
            <button type="button" className="recurring-item__button recurring-item__button--secondary" onClick={() => setConfirmingDelete(false)} disabled={busy}>
              No borrar
            </button>
            <button type="button" className="recurring-item__button recurring-item__button--danger" onClick={() => onDelete && run(onDelete)} disabled={busy}>
              Sí, borrar
            </button>
          </>
        ) : (
          <>
            {item && onDelete && (
              <button type="button" className="recurring-item__button recurring-item__button--ghost-danger" onClick={() => setConfirmingDelete(true)} disabled={busy}>
                Borrar
              </button>
            )}
            <button type="button" className="recurring-item__button recurring-item__button--secondary" onClick={onClose} disabled={busy}>
              Cancelar
            </button>
            <button type="submit" className="recurring-item__button recurring-item__button--primary" disabled={busy}>
              {busy ? 'Guardando…' : 'Guardar'}
            </button>
          </>
        )
      }
    >
      <div className="recurring-item">
        {error && <p className="recurring-item__error" role="alert">{error}</p>}
        {confirmingDelete && (
          <p className="recurring-item__warning">
            Se borrará «{item?.nombre}». Los pagos y cobros que ya confirmaste se quedan como están.
          </p>
        )}

        <div className="recurring-item__types" role="radiogroup" aria-label="Tipo de partida">
          {TIPOS.map(t => (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={tipo === t.id}
              className={`recurring-item__type ${tipo === t.id ? 'recurring-item__type--active' : ''}`}
              onClick={() => setTipo(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <label className="recurring-item__field">
          <span className="recurring-item__label">Nombre</span>
          <input
            className="recurring-item__input"
            type="text"
            value={nombre}
            onChange={e => setNombre(e.target.value)}
            placeholder={tipo === 'ingreso' ? 'Ej.: Nómina' : 'Ej.: Alquiler, luz, gimnasio…'}
            autoFocus={!item}
          />
        </label>

        <div className="recurring-item__row">
          <label className="recurring-item__field">
            <span className="recurring-item__label">Importe {tipo === 'factura' ? 'aproximado' : ''}</span>
            <span className="recurring-item__amount">
              <input
                className="recurring-item__input recurring-item__input--amount"
                type="text"
                inputMode="decimal"
                value={importe}
                onChange={e => setImporte(e.target.value)}
              />
              <span className="recurring-item__currency" aria-hidden="true">€</span>
            </span>
          </label>

          <label className="recurring-item__field">
            <span className="recurring-item__label">Frecuencia</span>
            <select className="recurring-item__select" value={frecuencia} onChange={e => setFrecuencia(e.target.value as Frecuencia)}>
              {Object.entries(FRECUENCIA_LABELS).map(([id, label]) => (
                <option key={id} value={id}>{label}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="recurring-item__row">
          <label className="recurring-item__field">
            <span className="recurring-item__label">{tipo === 'ingreso' ? 'Primer cobro' : 'Primer pago'}</span>
            <input className="recurring-item__input" type="date" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)} required />
          </label>
          <label className="recurring-item__field">
            <span className="recurring-item__label">Hasta (opcional)</span>
            <input className="recurring-item__input" type="date" value={fechaFin} onChange={e => setFechaFin(e.target.value)} />
          </label>
        </div>
        <p className="recurring-item__hint">El día de la primera fecha es el que se repite cada vez.</p>

        {tipo === 'factura' && (
          <label className="recurring-item__field">
            <span className="recurring-item__label">Categorías (separadas por comas)</span>
            <input className="recurring-item__input" type="text" value={categoria} onChange={e => setCategoria(e.target.value)} placeholder="Ej.: Hogar" />
          </label>
        )}

        {canProrate && (
          <>
            <label className="recurring-item__check">
              <input className="recurring-item__checkbox" type="checkbox" checked={prorratear} onChange={e => setProrratear(e.target.checked)} />
              <span>Apartar una parte cada ciclo (hucha)</span>
            </label>
            {prorratear && (
              <label className="recurring-item__field">
                <span className="recurring-item__label">Empezar a apartar desde</span>
                <input
                  className="recurring-item__input"
                  type="date"
                  value={desde}
                  min={savedDesde && savedDesde < todayYmd() ? savedDesde : todayYmd()}
                  onChange={e => setDesde(e.target.value)}
                />
              </label>
            )}
            <p className="recurring-item__hint">
              {prorratear ? 'Si no pones fecha, empieza hoy. Hasta esa fecha no se aparta nada; desde ella se pone al día. ' : ''}
              {frecuencia === 'mensual'
                ? 'Cada ciclo se reserva lo mismo, repartiendo lo que queda hasta la última cuota, y las cuotas salen de la hucha.'
                : 'Cada ciclo se reserva lo que falta hasta el próximo pago, y ese pago sale de la hucha en vez de tu presupuesto del mes.'}
            </p>
          </>
        )}

        {item && (
          <label className="recurring-item__check">
            <input className="recurring-item__checkbox" type="checkbox" checked={activo} onChange={e => setActivo(e.target.checked)} />
            <span>Activa (si la desactivas deja de contar en los próximos ciclos)</span>
          </label>
        )}
      </div>
    </Dialog>
  );
};

export default RecurringItemDialog;
