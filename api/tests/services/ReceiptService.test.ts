import { describe, it, expect } from 'vitest';
import { buildReceiptExpense, parseParte, shareCents, splitCents, validateReceipt } from '../../src/services/ReceiptService';

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const sumEuros = (lineas: { importe: number }[]) => Math.round(sum(lineas.map(l => l.importe * 100)));

describe('ReceiptService', () => {
  describe('splitCents', () => {
    it('gives the loose cents to the largest remainders, in order on ties', () => {
      // 501 × 333/1001 = 166,666…; 501 × 335/1001 = 167,667…: C has the largest remainder, then A
      expect(splitCents(501, [333, 333, 335])).toEqual([167, 166, 168]);
      expect(splitCents(5, [1, 1, 1])).toEqual([2, 2, 1]);
    });

    it('always adds up to the total, with discounts as negative weights', () => {
      for (const [total, pesos] of [[1000, [700, 400, -100]], [7, [3, 3, 3]], [1, [50, 50]], [999, [1]]] as [number, number[]][]) {
        expect(sum(splitCents(total, pesos))).toBe(total);
      }
    });

    it('rejects weights that do not add up to more than 0', () => {
      expect(() => splitCents(100, [100, -100])).toThrow();
    });
  });

  it('shareCents rounds the odd cent up', () => {
    expect(shareCents(1001, 0.5)).toBe(501);
    expect(shareCents(1000, 0.5)).toBe(500);
    expect(shareCents(1001, 1)).toBe(1001);
  });

  it('parseParte accepts only 1 and 0.5', () => {
    expect(parseParte(undefined)).toBe(1);
    expect(parseParte('0.5')).toBe(0.5);
    expect(parseParte(1)).toBe(1);
    for (const value of [0, 0.3, 2, 'mitad']) {
      expect(() => parseParte(value)).toThrow();
    }
  });

  describe('validateReceipt', () => {
    it('keeps only usable lines', () => {
      const receipt = validateReceipt({
        tienda: ' Mercadona ',
        total: 5.5,
        lineas: [
          { texto: 'LECHE', cantidad: 6, importe: 5.34 },
          { texto: 'DTO', importe: -0.5 },
          { texto: '', importe: 1 },
          { texto: 'PAN', importe: 'uno' },
          { texto: 'X'.repeat(300), cantidad: -1, importe: 0.66 },
        ],
      });
      expect(receipt.tienda).toBe('Mercadona');
      expect(receipt.lineas).toEqual([
        { texto: 'LECHE', cantidad: 6, importe: 5.34 },
        { texto: 'DTO', importe: -0.5 },
        { texto: 'X'.repeat(100), importe: 0.66 },
      ]);
    });

    it('leaves the total at 0 when there is none, and throws on a broken answer', () => {
      expect(validateReceipt({ total: 0, lineas: [] }).total).toBe(0);
      expect(validateReceipt({ lineas: [] }).total).toBe(0);
      expect(() => validateReceipt([])).toThrow();
      expect(() => validateReceipt(null)).toThrow();
    });
  });

  describe('buildReceiptExpense', () => {
    const receipt = {
      total: 10.01,
      lineas: [{ texto: 'A', importe: 3.33 }, { texto: 'B', cantidad: 2, importe: 3.33 }, { texto: 'C', importe: 3.35 }],
    };

    it('keeps the whole ticket with its lines', () => {
      const { monto, lineas, lineasDescartadas } = buildReceiptExpense(receipt, 1);
      expect(monto).toBe(10.01);
      expect(lineas).toEqual([{ texto: 'A', importe: 3.33 }, { texto: 'B', cantidad: 2, importe: 3.33 }, { texto: 'C', importe: 3.35 }]);
      expect(lineasDescartadas).toBe(false);
    });

    it('half: the odd cent goes up and the lines add up exactly to it', () => {
      const { monto, lineas } = buildReceiptExpense(receipt, 0.5);
      expect(monto).toBe(5.01);
      expect(lineas!.map(l => l.importe)).toEqual([1.67, 1.66, 1.68]);
      expect(sumEuros(lineas!)).toBe(501);
    });

    it('splits discounts too', () => {
      const { monto, lineas } = buildReceiptExpense({ total: 9, lineas: [{ texto: 'A', importe: 7 }, { texto: 'B', importe: 3 }, { texto: 'DTO', importe: -1 }] }, 0.5);
      expect(monto).toBe(4.5);
      expect(sumEuros(lineas!)).toBe(450);
      expect(lineas![2].importe).toBeLessThan(0);
    });

    it('tolerates the ticket rounding by 2 cents', () => {
      const { lineas } = buildReceiptExpense({ total: 10.03, lineas: receipt.lineas }, 1);
      expect(sumEuros(lineas!)).toBe(1003);
    });

    it('drops the lines when they do not add up to the total', () => {
      expect(buildReceiptExpense({ total: 12, lineas: receipt.lineas }, 1)).toEqual({ monto: 12, lineas: undefined, lineasDescartadas: true });
    });

    it('the user amount wins; lines only if it matches the ticket', () => {
      expect(buildReceiptExpense(receipt, 0.5, 20)).toEqual({ monto: 10, lineas: undefined, lineasDescartadas: true });
      expect(buildReceiptExpense(receipt, 1, 10.01).lineas).toHaveLength(3);
    });

    it('a ticket without lines is just its total', () => {
      expect(buildReceiptExpense({ total: 4.2, lineas: [] }, 1)).toEqual({ monto: 4.2, lineas: undefined, lineasDescartadas: false });
    });
  });
});
