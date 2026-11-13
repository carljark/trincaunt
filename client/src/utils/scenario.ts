import { Frecuencia, IPagoEspecial, IScenarioItem } from '../types/budget';
import { RecurringItemInput } from './budgetApi';

// Retoque de una pelotita en el ensayo: importe multiplicado por escala y fechas movidas meses
export interface Tweak {
  escala: number;
  meses: number;
}

export const SIN_RETOQUE: Tweak = { escala: 1, meses: 0 };
export const MAX_MESES = 12;

const MESES: Record<Frecuencia, number> = { mensual: 1, bimestral: 2, trimestral: 3, semestral: 6, anual: 12 };

const round2 = (n: number) => Math.round(n * 100) / 100;

export const isTweaked = (t?: Tweak) => !!t && (t.escala !== 1 || t.meses !== 0);

/** "2026-01-31" movida 1 mes -> "2026-02-28": el mismo día o, si el mes es más corto, el último. */
export const shiftMonths = (ymd: string, meses: number) => {
  const [y, m, d] = ymd.slice(0, 10).split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1 + meses, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(d, last));
  return first.toISOString().slice(0, 10);
};

/** Número de mes consecutivo ("2026-03-..." -> 2026 * 12 + 2) para comparar meses. */
export const monthIndex = (ymd: string) => {
  const [y, m] = ymd.slice(0, 10).split('-').map(Number);
  return y * 12 + m - 1;
};

/** Importe redondo para lo que se estira: de euro en euro, de 5 en 5 o de 10 en 10. */
export const niceAmount = (value: number) => {
  const step = value < 50 ? 1 : value < 500 ? 5 : 10;
  return Math.max(step, Math.round(value / step) * step);
};

interface Payable {
  frecuencia: Frecuencia;
  fechaInicio: string;
  fechaFin?: string;
}

/** Si la partida, movida `meses`, toca en el mes `month` (ver monthIndex). */
export const paysInMonth = (item: Payable, month: number, meses = 0) => {
  const inicio = shiftMonths(item.fechaInicio, meses);
  const diff = month - monthIndex(inicio);
  if (diff < 0 || diff % MESES[item.frecuencia] !== 0) return false;
  if (!item.fechaFin) return true;
  return shiftMonths(item.fechaInicio, meses + diff) <= shiftMonths(item.fechaFin, meses);
};

/** Una partida inventada con el retoque ya aplicado (el servidor solo retoca las guardadas). */
export const tweakScenarioItem = (item: IScenarioItem, t: Tweak): IScenarioItem => ({
  ...item,
  importe: round2(item.importe * t.escala),
  fechaInicio: shiftMonths(item.fechaInicio, t.meses),
  ...(item.fechaFin ? { fechaFin: shiftMonths(item.fechaFin, t.meses) } : {})
});

interface Stored extends Payable {
  importe: number;
  pagosEspeciales?: IPagoEspecial[];
}

/** Lo que hay que guardar para que una partida quede como en el ensayo. */
export const tweakedFields = (item: Stored, t: Tweak): Partial<RecurringItemInput> => {
  const data: Partial<RecurringItemInput> = {};
  if (t.escala !== 1) data.importe = round2(item.importe * t.escala);
  if (t.meses !== 0) {
    data.fechaInicio = shiftMonths(item.fechaInicio, t.meses);
    if (item.fechaFin) data.fechaFin = shiftMonths(item.fechaFin, t.meses);
  }
  if (item.pagosEspeciales?.length && isTweaked(t)) {
    data.pagosEspeciales = item.pagosEspeciales.map(p => ({
      ...p,
      importe: round2(p.importe * t.escala),
      desde: shiftMonths(p.desde, t.meses),
      hasta: shiftMonths(p.hasta, t.meses)
    }));
  }
  return data;
};
