import React from 'react';
import { IPagoEspecial, PagoEspecialTipo } from '../types/budget';
import { PlusIcon, TrashIcon } from './icons';
import './SpecialPaymentsEditor.scss';

// Un tramo tal y como se escribe en el formulario
export interface SpecialRow {
  key: number;
  tipo: PagoEspecialTipo;
  desde: string;
  hasta: string;
  importe: string;
  aviso: string;
  avisoDias: string;
}

interface SpecialPaymentsEditorProps {
  rows: SpecialRow[];
  onChange: (rows: SpecialRow[]) => void;
  conAvisos: boolean; // los avisos solo tienen sentido en las facturas
  defaultDesde: string;
}

const TIPOS: { id: PagoEspecialTipo; label: string }[] = [
  { id: 'cuota', label: 'Otra cuota' },
  { id: 'extra', label: 'Pago extra' }
];

let nextKey = 0;

export const toRows = (list: IPagoEspecial[] = []): SpecialRow[] => list.map(p => ({
  key: nextKey++,
  tipo: p.tipo,
  desde: p.desde.slice(0, 10),
  hasta: p.hasta.slice(0, 10),
  importe: String(p.importe),
  aviso: p.aviso ?? '',
  avisoDias: String(p.avisoDiasAntes ?? 3)
}));

/** Los tramos listos para guardar, o el primer error que impide hacerlo. */
export const parseRows = (rows: SpecialRow[], conAvisos: boolean): { data: IPagoEspecial[] } | { error: string } => {
  const data: IPagoEspecial[] = [];
  for (const [i, row] of rows.entries()) {
    const n = rows.length > 1 ? ` ${i + 1}` : '';
    const importe = Number(row.importe.replace(',', '.'));
    if (!row.desde) return { error: `Pago especial${n}: falta la fecha.` };
    const hasta = row.hasta || row.desde;
    if (hasta < row.desde) return { error: `Pago especial${n}: la fecha final no puede ser anterior a la inicial.` };
    if (!(importe > 0)) return { error: `Pago especial${n}: el importe debe ser mayor que 0.` };
    const aviso = conAvisos ? row.aviso.trim() : '';
    const dias = Number(row.avisoDias);
    if (aviso && !(Number.isInteger(dias) && dias >= 0 && dias <= 31)) return { error: `Pago especial${n}: los días de antelación van de 0 a 31.` };
    data.push({
      tipo: row.tipo,
      desde: row.desde,
      hasta,
      importe: Math.round(importe * 100) / 100,
      ...(aviso ? { aviso, avisoDiasAntes: dias } : {})
    });
  }
  return { data };
};

// Lista de tramos de una partida: cada uno cambia la cuota o suma un pago extra entre dos fechas
const SpecialPaymentsEditor: React.FC<SpecialPaymentsEditorProps> = ({ rows, onChange, conAvisos, defaultDesde }) => {
  const update = (key: number, patch: Partial<SpecialRow>) => onChange(rows.map(r => (r.key === key ? { ...r, ...patch } : r)));
  const add = () => {
    const last = rows[rows.length - 1];
    onChange([...rows, {
      key: nextKey++,
      tipo: last?.tipo ?? 'cuota',
      desde: last?.hasta || defaultDesde,
      hasta: '',
      importe: '',
      aviso: '',
      avisoDias: last?.avisoDias ?? '3'
    }]);
  };

  return (
    <div className="special-payments">
      {rows.map((row, i) => (
        <fieldset key={row.key} className="special-payments__item">
          <legend className="special-payments__legend">Pago especial {rows.length > 1 ? i + 1 : ''}</legend>
          <div className="special-payments__header">
            <div className="special-payments__types" role="radiogroup" aria-label={`Tipo del pago especial ${i + 1}`}>
              {TIPOS.map(t => (
                <button
                  key={t.id}
                  type="button"
                  role="radio"
                  aria-checked={row.tipo === t.id}
                  className={`special-payments__type ${row.tipo === t.id ? 'special-payments__type--active' : ''}`}
                  onClick={() => update(row.key, { tipo: t.id })}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="special-payments__remove"
              onClick={() => onChange(rows.filter(r => r.key !== row.key))}
              aria-label={`Quitar el pago especial ${i + 1}`}
              title="Quitar"
            >
              <TrashIcon />
            </button>
          </div>

          <div className="special-payments__row">
            <label className="special-payments__field">
              <span className="special-payments__label">Desde</span>
              <input className="special-payments__input" type="date" value={row.desde} onChange={e => update(row.key, { desde: e.target.value })} />
            </label>
            <label className="special-payments__field">
              <span className="special-payments__label">Hasta (si es más de un pago)</span>
              <input className="special-payments__input" type="date" value={row.hasta} min={row.desde} onChange={e => update(row.key, { hasta: e.target.value })} />
            </label>
          </div>

          <label className="special-payments__field">
            <span className="special-payments__label">{row.tipo === 'cuota' ? 'Cuota en esas fechas' : 'Extra en cada una de esas fechas'}</span>
            <span className="special-payments__amount">
              <input
                className="special-payments__input special-payments__input--amount"
                type="text"
                inputMode="decimal"
                value={row.importe}
                onChange={e => update(row.key, { importe: e.target.value })}
              />
              <span className="special-payments__currency" aria-hidden="true">€</span>
            </span>
          </label>

          {conAvisos && (
            <div className="special-payments__row special-payments__row--reminder">
              <label className="special-payments__field">
                <span className="special-payments__label">Aviso (opcional)</span>
                <input
                  className="special-payments__input"
                  type="text"
                  value={row.aviso}
                  onChange={e => update(row.key, { aviso: e.target.value })}
                  placeholder={row.tipo === 'cuota' ? 'Ej.: Cambia la cuota en el banco' : 'Ej.: Pide la amortización anticipada'}
                  maxLength={200}
                />
              </label>
              <label className="special-payments__field">
                <span className="special-payments__label">Días antes</span>
                <input
                  className="special-payments__input"
                  type="text"
                  inputMode="numeric"
                  value={row.avisoDias}
                  onChange={e => update(row.key, { avisoDias: e.target.value })}
                  disabled={!row.aviso.trim()}
                />
              </label>
            </div>
          )}
        </fieldset>
      ))}

      <button type="button" className="special-payments__add" onClick={add}>
        <PlusIcon /> Añadir pago especial
      </button>
      <p className="special-payments__hint">
        «Otra cuota» cambia el importe en esas fechas; «Pago extra» se paga además de la cuota (por ejemplo, una amortización
        anticipada). Su aviso sustituye al de la partida en esas fechas.
      </p>
    </div>
  );
};

export default SpecialPaymentsEditor;
