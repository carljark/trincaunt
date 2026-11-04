export const formatEuros = (amount: number) =>
  amount.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

/** "2026-11-05" -> "5 nov" (fecha de calendario, sin zona horaria). */
export const formatShortDate = (ymd: string) =>
  new Date(`${ymd.slice(0, 10)}T00:00:00Z`)
    .toLocaleDateString('es-ES', { day: 'numeric', month: 'short', timeZone: 'UTC' })
    .replace('.', '');

/** Suma (o resta, con negativos) días a una fecha "YYYY-MM-DD". */
export const addDays = (ymd: string, days: number) => {
  const date = new Date(`${ymd.slice(0, 10)}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

/** Hoy en el calendario local, como "YYYY-MM-DD". */
export const todayYmd = (now = new Date()) => {
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${mm}-${dd}`;
};
