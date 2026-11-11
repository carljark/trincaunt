import React, { useState } from 'react';
import Dialog from './Dialog';
import { FRECUENCIA_LABELS, Frecuencia, IScenarioItem, RecurringTipo } from '../types/budget';
import { todayYmd } from '../utils/format';
import './ScenarioItemDialog.scss';

interface ScenarioItemDialogProps {
  onAdd: (item: IScenarioItem) => void;
  onClose: () => void;
}

const TIPOS: { id: RecurringTipo; label: string }[] = [
  { id: 'factura', label: 'Gasto' },
  { id: 'ingreso', label: 'Ingreso' }
];

// Una partida inventada para el ensayo: lo justo para ver cómo cambia la previsión
const ScenarioItemDialog: React.FC<ScenarioItemDialogProps> = ({ onAdd, onClose }) => {
  const [tipo, setTipo] = useState<RecurringTipo>('factura');
  const [nombre, setNombre] = useState('');
  const [importe, setImporte] = useState('');
  const [frecuencia, setFrecuencia] = useState<Frecuencia>('mensual');
  const [fechaInicio, setFechaInicio] = useState(todayYmd());
  const [fechaFin, setFechaFin] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(importe.replace(',', '.'));
    if (!nombre.trim()) return setError('Ponle un nombre.');
    if (!(amount > 0)) return setError('El importe debe ser mayor que 0.');
    if (fechaFin && fechaFin < fechaInicio) return setError('La fecha de fin no puede ser anterior a la primera.');
    onAdd({
      tipo,
      nombre: nombre.trim(),
      importe: Math.round(amount * 100) / 100,
      frecuencia,
      fechaInicio,
      ...(fechaFin ? { fechaFin } : {})
    });
  };

  return (
    <Dialog
      title="¿Y si…?"
      onClose={onClose}
      onSubmit={submit}
      footer={
        <>
          <button type="button" className="scenario-item__button scenario-item__button--secondary" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="scenario-item__button scenario-item__button--primary">
            Añadir al ensayo
          </button>
        </>
      }
    >
      <div className="scenario-item">
        {error && <p className="scenario-item__error" role="alert">{error}</p>}

        <div className="scenario-item__types" role="radiogroup" aria-label="Tipo de partida">
          {TIPOS.map(t => (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={tipo === t.id}
              className={`scenario-item__type ${tipo === t.id ? 'scenario-item__type--active' : ''}`}
              onClick={() => setTipo(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <label className="scenario-item__field">
          <span className="scenario-item__label">Nombre</span>
          <input
            className="scenario-item__input"
            type="text"
            value={nombre}
            onChange={e => setNombre(e.target.value)}
            placeholder={tipo === 'ingreso' ? 'Ej.: Clases particulares' : 'Ej.: Coche nuevo'}
            autoFocus
          />
        </label>

        <div className="scenario-item__row">
          <label className="scenario-item__field">
            <span className="scenario-item__label">Importe</span>
            <span className="scenario-item__amount">
              <input
                className="scenario-item__input scenario-item__input--amount"
                type="text"
                inputMode="decimal"
                value={importe}
                onChange={e => setImporte(e.target.value)}
              />
              <span className="scenario-item__currency" aria-hidden="true">€</span>
            </span>
          </label>
          <label className="scenario-item__field">
            <span className="scenario-item__label">Frecuencia</span>
            <select className="scenario-item__select" value={frecuencia} onChange={e => setFrecuencia(e.target.value as Frecuencia)}>
              {Object.entries(FRECUENCIA_LABELS).map(([id, label]) => (
                <option key={id} value={id}>{label}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="scenario-item__row">
          <label className="scenario-item__field">
            <span className="scenario-item__label">Desde</span>
            <input className="scenario-item__input" type="date" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)} required />
          </label>
          <label className="scenario-item__field">
            <span className="scenario-item__label">Hasta (opcional)</span>
            <input className="scenario-item__input" type="date" value={fechaFin} onChange={e => setFechaFin(e.target.value)} />
          </label>
        </div>
      </div>
    </Dialog>
  );
};

export default ScenarioItemDialog;
