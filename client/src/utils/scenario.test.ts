import { describe, it, expect } from 'vitest';
import { monthIndex, niceAmount, paysInMonth, shiftMonths, tweakedFields } from './scenario';

describe('scenario utils', () => {
  it('shifts dates by months, keeping the day or the last day of a shorter month', () => {
    expect(shiftMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(shiftMonths('2026-11-15T00:00:00.000Z', 2)).toBe('2027-01-15');
    expect(shiftMonths('2026-03-10', -3)).toBe('2025-12-10');
  });

  it('rounds stretched amounts to nice steps', () => {
    expect(niceAmount(43.4)).toBe(43);
    expect(niceAmount(123)).toBe(125);
    expect(niceAmount(712)).toBe(710);
    expect(niceAmount(0.2)).toBe(1);
  });

  it('knows in which months an item pays, moved or not', () => {
    const seguro = { frecuencia: 'anual' as const, fechaInicio: '2025-03-01' };
    expect(paysInMonth(seguro, monthIndex('2027-03-01'))).toBe(true);
    expect(paysInMonth(seguro, monthIndex('2027-04-01'))).toBe(false);
    expect(paysInMonth(seguro, monthIndex('2027-04-01'), 1)).toBe(true);
    const prestamo = { frecuencia: 'mensual' as const, fechaInicio: '2026-01-05', fechaFin: '2027-02-05' };
    expect(paysInMonth(prestamo, monthIndex('2027-03-01'))).toBe(false);
    expect(paysInMonth(prestamo, monthIndex('2027-03-01'), 1)).toBe(true);
    const gym = { frecuencia: 'mensual' as const, fechaInicio: '2026-01-05', pagosEspeciales: [{ tipo: 'salto' as const, desde: '2026-08-05', hasta: '2026-08-05', importe: 0 }] };
    expect(paysInMonth(gym, monthIndex('2026-08-01'))).toBe(false);
    expect(paysInMonth(gym, monthIndex('2026-09-01'), 1)).toBe(false);
  });

  it('builds the fields to save: amount, dates and special payments', () => {
    const item = {
      importe: 100, frecuencia: 'mensual' as const, fechaInicio: '2026-01-05', fechaFin: '2027-01-05',
      pagosEspeciales: [{ tipo: 'extra' as const, desde: '2026-12-05', hasta: '2026-12-05', importe: 50, aviso: 'Pedir' }]
    };
    expect(tweakedFields(item, { escala: 1.5, meses: 0 })).toEqual({
      importe: 150,
      pagosEspeciales: [{ tipo: 'extra', desde: '2026-12-05', hasta: '2026-12-05', importe: 75, aviso: 'Pedir' }]
    });
    expect(tweakedFields({ ...item, pagosEspeciales: [] }, { escala: 1, meses: 2 })).toEqual({ fechaInicio: '2026-03-05', fechaFin: '2027-03-05' });
  });
});
