// Cálculo de ciclos de presupuesto y de cuándo tocan las partidas recurrentes.
//
// Todas las fechas son "fechas de calendario" en UTC a medianoche, igual que las que
// guarda el cliente (envía "YYYY-MM-DD", que Mongo guarda como 00:00 UTC). Así el
// día de un gasto no depende de la zona horaria del servidor.

export const FRECUENCIAS = ['mensual', 'bimestral', 'trimestral', 'semestral', 'anual'] as const;
export type Frecuencia = typeof FRECUENCIAS[number];

// Pagos especiales de una partida: otra cuota en esas fechas, o un extra que se suma
// cuota: otro importe; extra: se suma; salto: ese pago no se hace (una carencia, un mes que se salta)
export const PAGO_ESPECIAL_TIPOS = ['cuota', 'extra', 'salto'] as const;
export type PagoEspecialTipo = typeof PAGO_ESPECIAL_TIPOS[number];

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

/** La misma fecha `meses` meses después (antes si es negativo); si el mes es más corto, su último día. */
export const shiftMonths = (value: Date, meses: number): Date => {
  const date = toCalendarDate(value);
  return dateOn(date.getUTCFullYear(), date.getUTCMonth() + meses, date.getUTCDate());
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

/** Si un tramo de «sin pago» cubre esa fecha: ese pago no se hace. */
export const isSkipped = (item: { pagosEspeciales?: SpecialPayment[] | null }, date: Date): boolean => {
  const day = toCalendarDate(date).getTime();
  return (item.pagosEspeciales ?? []).some(p =>
    p.tipo === 'salto' && toCalendarDate(p.desde).getTime() <= day && day <= toCalendarDate(p.hasta).getTime());
};

/** Fechas en que toca una partida recurrente dentro de [inicio, fin), sin las que se saltan. */
export const occurrencesInRange = (
  item: { fechaInicio: Date; frecuencia: Frecuencia; fechaFin?: Date | null; pagosEspeciales?: SpecialPayment[] | null },
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
    if (occurrence >= inicio && !isSkipped(item, occurrence)) result.push(occurrence);
  }
  return result;
};

interface SpecialPayment {
  tipo: PagoEspecialTipo;
  desde: Date;
  hasta: Date;
  importe: number;
  aviso?: string;
  avisoDiasAntes?: number;
}

export interface PaymentOn {
  importe: number;          // lo que se paga ese día: cuota + extra
  cuota: number;            // el importe normal o el del tramo que lo cambia
  extra: number;            // pagos extra que se suman ese día
  aviso?: string;           // el de los tramos de ese día o, si no tienen, el de la partida
  avisoDiasAntes?: number;
}

/**
 * Lo que toca pagar en una fecha de la partida según sus pagos especiales: un tramo de
 * cuota sustituye al importe normal, los extras se suman y un «sin pago» lo deja en 0. Los avisos de los tramos de ese
 * día mandan sobre el de la partida.
 */
export const paymentOn = (
  item: { importe: number; aviso?: string | null; avisoDiasAntes?: number | null; pagosEspeciales?: SpecialPayment[] | null },
  date: Date
): PaymentOn => {
  if (isSkipped(item, date)) return { importe: 0, cuota: 0, extra: 0 };
  const day = toCalendarDate(date).getTime();
  const tramos = (item.pagosEspeciales ?? []).filter(p =>
    toCalendarDate(p.desde).getTime() <= day && day <= toCalendarDate(p.hasta).getTime());
  const cambio = tramos.find(p => p.tipo === 'cuota');
  const cuota = cambio ? cambio.importe : item.importe;
  const extra = Math.round(tramos.filter(p => p.tipo === 'extra').reduce((acc, p) => acc + p.importe, 0) * 100) / 100;
  const conAviso = tramos.filter(p => p.aviso?.trim());
  const dias = conAviso.map(p => p.avisoDiasAntes).filter((d): d is number => typeof d === 'number');
  return {
    importe: Math.round((cuota + extra) * 100) / 100,
    cuota,
    extra,
    ...(conAviso.length
      ? { aviso: conAviso.map(p => p.aviso!.trim()).join(' · '), ...(dias.length ? { avisoDiasAntes: Math.max(...dias) } : {}) }
      : item.aviso ? { aviso: item.aviso, ...(item.avisoDiasAntes != null ? { avisoDiasAntes: item.avisoDiasAntes } : {}) } : {})
  };
};
