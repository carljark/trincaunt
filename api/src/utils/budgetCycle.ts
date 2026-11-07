// Cálculo de ciclos de presupuesto y de cuándo tocan las partidas recurrentes.
//
// Todas las fechas son "fechas de calendario" en UTC a medianoche, igual que las que
// guarda el cliente (envía "YYYY-MM-DD", que Mongo guarda como 00:00 UTC). Así el
// día de un gasto no depende de la zona horaria del servidor.

export const FRECUENCIAS = ['mensual', 'bimestral', 'trimestral', 'semestral', 'anual'] as const;
export type Frecuencia = typeof FRECUENCIAS[number];

export const MESES_POR_FRECUENCIA: Record<Frecuencia, number> = {
  mensual: 1,
  bimestral: 2,
  trimestral: 3,
  semestral: 6,
  anual: 12
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface Cycle {
  inicio: Date; // incluido
  fin: Date;    // excluido (= inicio del ciclo siguiente)
}

const daysInMonth = (year: number, month: number) => new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

/** Día `day` del mes `month` (puede desbordar de año); si el mes es más corto, su último día. */
export const dateOn = (year: number, month: number, day: number): Date => {
  const first = new Date(Date.UTC(year, month, 1));
  const y = first.getUTCFullYear();
  const m = first.getUTCMonth();
  return new Date(Date.UTC(y, m, Math.min(day, daysInMonth(y, m))));
};

/** Fecha de hoy (medianoche UTC) según el calendario de `timeZone`. */
export const todayIn = (timeZone = 'Europe/Madrid', now = new Date()): Date => {
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(now)
    .split('-')
    .map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

/** Convierte "YYYY-MM-DD" (o cualquier fecha) en su fecha de calendario a medianoche UTC. */
export const toCalendarDate = (value: string | Date): Date => {
  const date = new Date(value);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
};

export const daysBetween = (from: Date, to: Date) => Math.round((to.getTime() - from.getTime()) / MS_PER_DAY);

/**
 * Ciclo que contiene `date` cuando el ciclo empieza el día `diaInicio` de cada mes
 * (el día de cobro). `offset` -1 es el ciclo anterior, 1 el siguiente.
 * Con diaInicio 31, en meses más cortos el ciclo empieza el último día del mes.
 */
export const cycleContaining = (date: Date, diaInicio: number, offset = 0): Cycle => {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth();
  const startMonth = (date < dateOn(y, m, diaInicio) ? m - 1 : m) + offset;
  return { inicio: dateOn(y, startMonth, diaInicio), fin: dateOn(y, startMonth + 1, diaInicio) };
};

// Los ciclos se numeran por el mes en que empiezan, contando desde enero de 2000
const BASE_YEAR = 2000;

/** Número del ciclo que contiene `date` (consecutivo: el siguiente es +1). */
export const cycleIndex = (date: Date, diaInicio: number): number => {
  const { inicio } = cycleContaining(date, diaInicio);
  return (inicio.getUTCFullYear() - BASE_YEAR) * 12 + inicio.getUTCMonth();
};

/** Ciclo número `index` (ver cycleIndex). */
export const cycleAt = (index: number, diaInicio: number): Cycle => ({
  inicio: dateOn(BASE_YEAR, index, diaInicio),
  fin: dateOn(BASE_YEAR, index + 1, diaInicio)
});

/** Fechas en que toca una partida recurrente dentro de [inicio, fin). */
export const occurrencesInRange = (
  item: { fechaInicio: Date; frecuencia: Frecuencia; fechaFin?: Date | null },
  { inicio, fin }: Cycle
): Date[] => {
  const step = MESES_POR_FRECUENCIA[item.frecuencia] ?? 1;
  const anchor = toCalendarDate(item.fechaInicio);
  const ay = anchor.getUTCFullYear();
  const am = anchor.getUTCMonth();
  const day = anchor.getUTCDate();
  const end = item.fechaFin ? toCalendarDate(item.fechaFin) : null;

  // Empezamos un paso antes del ciclo para no saltarnos ninguna fecha
  const monthsToCycle = (inicio.getUTCFullYear() - ay) * 12 + inicio.getUTCMonth() - am;
  const result: Date[] = [];
  for (let k = Math.max(0, Math.floor(monthsToCycle / step) - 1); ; k++) {
    const occurrence = dateOn(ay, am + k * step, day);
    if (occurrence >= fin || (end && occurrence > end)) break;
    if (occurrence >= inicio) result.push(occurrence);
  }
  return result;
};
