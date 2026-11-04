import { cycleContaining, dateOn, daysBetween, occurrencesInRange, todayIn, toCalendarDate } from '../../src/utils/budgetCycle';

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const ymd = (date: Date) => date.toISOString().slice(0, 10);
const cycle = (date: string, dia: number, offset = 0) => {
  const c = cycleContaining(d(date), dia, offset);
  return [ymd(c.inicio), ymd(c.fin)];
};

describe('budgetCycle', () => {
  describe('dateOn', () => {
    it('clamps the day to the last day of short months', () => {
      expect(ymd(dateOn(2026, 1, 31))).toBe('2026-02-28');
      expect(ymd(dateOn(2028, 1, 30))).toBe('2028-02-29'); // bisiesto
      expect(ymd(dateOn(2026, 3, 31))).toBe('2026-04-30');
    });

    it('overflows months into the next or previous year', () => {
      expect(ymd(dateOn(2026, 12, 5))).toBe('2027-01-05');
      expect(ymd(dateOn(2026, -1, 28))).toBe('2025-12-28');
    });
  });

  describe('cycleContaining', () => {
    it('starts on payday: before it you are still in the previous cycle', () => {
      expect(cycle('2026-11-04', 28)).toEqual(['2026-10-28', '2026-11-28']);
      expect(cycle('2026-11-27', 28)).toEqual(['2026-10-28', '2026-11-28']);
      expect(cycle('2026-11-28', 28)).toEqual(['2026-11-28', '2026-12-28']);
    });

    it('works like calendar months with day 1', () => {
      expect(cycle('2026-11-04', 1)).toEqual(['2026-11-01', '2026-12-01']);
      expect(cycle('2026-12-31', 1)).toEqual(['2026-12-01', '2027-01-01']);
    });

    it('crosses the year boundary', () => {
      expect(cycle('2027-01-10', 25)).toEqual(['2026-12-25', '2027-01-25']);
    });

    it('handles payday 31 in short months', () => {
      expect(cycle('2026-03-01', 31)).toEqual(['2026-02-28', '2026-03-31']);
      expect(cycle('2026-02-28', 31)).toEqual(['2026-02-28', '2026-03-31']);
      expect(cycle('2026-02-27', 31)).toEqual(['2026-01-31', '2026-02-28']);
    });

    it('moves to previous and next cycles with offset', () => {
      expect(cycle('2026-11-04', 28, -1)).toEqual(['2026-09-28', '2026-10-28']);
      expect(cycle('2026-11-04', 28, 1)).toEqual(['2026-11-28', '2026-12-28']);
      expect(cycle('2026-01-04', 28, -1)).toEqual(['2025-11-28', '2025-12-28']);
    });
  });

  describe('occurrencesInRange', () => {
    const range = (inicio: string, fin: string) => ({ inicio: d(inicio), fin: d(fin) });
    const dates = (item: Parameters<typeof occurrencesInRange>[0], r: ReturnType<typeof range>) =>
      occurrencesInRange(item, r).map(ymd);

    it('returns the monthly date inside a payday cycle', () => {
      const item = { fechaInicio: d('2026-01-05'), frecuencia: 'mensual' as const };
      expect(dates(item, range('2026-10-28', '2026-11-28'))).toEqual(['2026-11-05']);
    });

    it('includes the first day of the cycle but not the end (exclusive)', () => {
      const item = { fechaInicio: d('2026-01-28'), frecuencia: 'mensual' as const };
      expect(dates(item, range('2026-10-28', '2026-11-28'))).toEqual(['2026-10-28']);
    });

    it('can return two dates when a stretched cycle covers the same day twice', () => {
      // Cobro el 31: el ciclo de febrero va del 28-feb al 31-mar y una factura del día 28 toca dos veces
      const item = { fechaInicio: d('2026-01-28'), frecuencia: 'mensual' as const };
      expect(dates(item, range('2026-02-28', '2026-03-31'))).toEqual(['2026-02-28', '2026-03-28']);
    });

    it('respects multi-month frequencies from the anchor month', () => {
      const quarterly = { fechaInicio: d('2026-02-10'), frecuencia: 'trimestral' as const };
      expect(dates(quarterly, range('2026-11-01', '2026-12-01'))).toEqual(['2026-11-10']);
      expect(dates(quarterly, range('2026-12-01', '2027-01-01'))).toEqual([]);
      expect(dates(quarterly, range('2027-02-01', '2027-03-01'))).toEqual(['2027-02-10']);

      const yearly = { fechaInicio: d('2025-03-15'), frecuencia: 'anual' as const };
      expect(dates(yearly, range('2026-03-01', '2026-04-01'))).toEqual(['2026-03-15']);
      expect(dates(yearly, range('2026-04-01', '2026-05-01'))).toEqual([]);
    });

    it('clamps the day to short months (31 → 28 Feb)', () => {
      const item = { fechaInicio: d('2026-01-31'), frecuencia: 'mensual' as const };
      expect(dates(item, range('2026-02-01', '2026-03-01'))).toEqual(['2026-02-28']);
      expect(dates(item, range('2026-03-01', '2026-04-01'))).toEqual(['2026-03-31']);
    });

    it('ignores dates before the start and after the end', () => {
      const item = { fechaInicio: d('2026-11-10'), frecuencia: 'mensual' as const, fechaFin: d('2027-01-09') };
      expect(dates(item, range('2026-10-01', '2026-11-01'))).toEqual([]);
      expect(dates(item, range('2026-12-01', '2027-01-01'))).toEqual(['2026-12-10']);
      expect(dates(item, range('2027-01-01', '2027-02-01'))).toEqual([]);
    });
  });

  describe('todayIn / toCalendarDate / daysBetween', () => {
    it('uses the Madrid calendar date, not the UTC one', () => {
      // 23:30 UTC del 27 = 00:30 del 28 en Madrid (horario de invierno)
      expect(ymd(todayIn('Europe/Madrid', new Date('2026-11-27T23:30:00Z')))).toBe('2026-11-28');
      expect(ymd(todayIn('Europe/Madrid', new Date('2026-11-27T22:30:00Z')))).toBe('2026-11-27');
    });

    it('turns a YYYY-MM-DD string into its UTC midnight', () => {
      expect(toCalendarDate('2026-11-05').toISOString()).toBe('2026-11-05T00:00:00.000Z');
      expect(toCalendarDate(new Date('2026-11-05T15:20:00Z')).toISOString()).toBe('2026-11-05T00:00:00.000Z');
    });

    it('counts whole days', () => {
      expect(daysBetween(d('2026-10-28'), d('2026-11-28'))).toBe(31);
      expect(daysBetween(d('2026-02-28'), d('2026-03-31'))).toBe(31);
    });
  });
});
