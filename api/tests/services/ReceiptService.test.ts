import { describe, it, expect } from 'vitest';
import { buildReceiptItems, foldDiscounts, parseParte, shareCents, splitCents, validateReceipt } from '../../src/services/ReceiptService';

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
          { texto: 'LECHE', nombre: ' Leche entera ', categoria: 'Comida', cantidad: 6, importe: 5.34 },
          { texto: 'DTO', nombre: '', categoria: 3, importe: -0.5 },
          { texto: '', importe: 1 },
          { texto: 'PAN', importe: 'uno' },
          { texto: 'X'.repeat(300), cantidad: -1, importe: 0.66 },
        ],
      });
      expect(receipt.tienda).toBe('Mercadona');
      expect(receipt.lineas).toEqual([
        { texto: 'LECHE', nombre: 'Leche entera', categoria: 'Comida', cantidad: 6, importe: 5.34 },
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

  describe('foldDiscounts', () => {
    it('adds each discount to the article above it, and a leading one to the first', () => {
      const folded = foldDiscounts([
        { texto: 'DTO', importe: -0.5 }, { texto: 'A', importe: 2 }, { texto: 'B', importe: 3 }, { texto: 'DTO B', importe: -1 }, { texto: 'C', importe: 1 },
      ]);
      expect(folded.map(f => [f.linea.texto, f.cents])).toEqual([['A', 150], ['B', 200], ['C', 100]]);
    });
  });

  describe('buildReceiptItems', () => {
    const receipt = {
      total: 10.01,
      lineas: [
        { texto: 'LECHE ENT', nombre: 'Leche entera', categoria: 'Comida', importe: 3.33 },
        { texto: 'PAN', cantidad: 2, importe: 3.33 },
        { texto: 'LEJIA', categoria: 'Limpieza', cantidad: 0.5, importe: 3.35 },
      ],
    };

    it('one item per line, with its readable name, units and category', () => {
      const { monto, articulos, lineasDescartadas } = buildReceiptItems(receipt, 1);
      expect(monto).toBe(10.01);
      expect(articulos).toEqual([
        { descripcion: 'Leche entera', categoria: 'Comida', importe: 3.33 },
        { descripcion: '2 PAN', importe: 3.33 },
        { descripcion: 'LEJIA', categoria: 'Limpieza', importe: 3.35 },
      ]);
      expect(lineasDescartadas).toBe(false);
    });

    it('half: the odd cent goes up, the items add up exactly to it and say so', () => {
      const { monto, articulos } = buildReceiptItems(receipt, 0.5);
      expect(monto).toBe(5.01);
      expect(articulos!.map(a => a.importe)).toEqual([1.67, 1.66, 1.68]);
      expect(sumEuros(articulos!)).toBe(501);
      expect(articulos![0].descripcion).toBe('Leche entera · a medias');
    });

    it('a discount lowers the article above it instead of being an item', () => {
      const { monto, articulos } = buildReceiptItems({ total: 9, lineas: [{ texto: 'A', importe: 7 }, { texto: 'DTO', importe: -1 }, { texto: 'B', importe: 3 }] }, 1);
      expect(monto).toBe(9);
      expect(articulos!.map(a => [a.descripcion, a.importe])).toEqual([['A', 6], ['B', 3]]);
    });

    it('one expense when a discount leaves an article at 0 or less', () => {
      expect(buildReceiptItems({ total: 2, lineas: [{ texto: 'A', importe: 1 }, { texto: 'DTO', importe: -1 }, { texto: 'B', importe: 2 }] }, 1).articulos).toBeUndefined();
    });

    it('drops an item that a half leaves at 0 cents', () => {
      // 501 céntimos sobre 1000/1/1: A 500, B 1, C 0
      const { articulos } = buildReceiptItems({ total: 10.02, lineas: [{ texto: 'A', importe: 10 }, { texto: 'B', importe: 0.01 }, { texto: 'C', importe: 0.01 }] }, 0.5);
      expect(articulos!.map(a => [a.descripcion, a.importe])).toEqual([['A · a medias', 5], ['B · a medias', 0.01]]);
    });

    it('tolerates the ticket rounding by 2 cents', () => {
      const { articulos } = buildReceiptItems({ total: 10.03, lineas: receipt.lineas }, 1);
      expect(sumEuros(articulos!)).toBe(1003);
    });

    it('one expense when the lines do not add up to the total', () => {
      expect(buildReceiptItems({ total: 12, lineas: receipt.lineas }, 1)).toEqual({ monto: 12, articulos: undefined, lineasDescartadas: true });
    });

    it('the user amount wins; items only if it matches the ticket', () => {
      expect(buildReceiptItems(receipt, 0.5, 20)).toEqual({ monto: 10, articulos: undefined, lineasDescartadas: true });
      expect(buildReceiptItems(receipt, 1, 10.01).articulos).toHaveLength(3);
    });

    it('a ticket without lines is just its total', () => {
      expect(buildReceiptItems({ total: 4.2, lineas: [] }, 1)).toEqual({ monto: 4.2, articulos: undefined, lineasDescartadas: false });
    });
  });
});
