import { describe, it, expect } from 'vitest';
import { addDays, formatEuros, formatShortDate, todayYmd } from './format';

describe('format', () => {
  it('formats euros the Spanish way', () => {
    expect(formatEuros(1234.5).replace(/\s/g, ' ')).toMatch(/^1\.?234,50 €$/);
    expect(formatEuros(-3).replace(/\s/g, ' ')).toBe('-3,00 €');
  });

  it('formats calendar dates without shifting the day', () => {
    expect(formatShortDate('2026-11-05')).toBe('5 nov');
    expect(formatShortDate('2026-11-05T00:00:00.000Z')).toBe('5 nov');
  });

  it('adds and subtracts days across months', () => {
    expect(addDays('2026-11-28', -1)).toBe('2026-11-27');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it("returns today's local date", () => {
    expect(todayYmd(new Date(2026, 10, 4, 23, 59))).toBe('2026-11-04');
  });
});
