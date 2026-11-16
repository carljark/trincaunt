import { AppError } from '../utils/AppError';

export const TICKET_ILEGIBLE = 'ticket_ilegible';
export const IA_DESACTIVADA = 'ia_desactivada';

/** Lo que la IA lee de un ticket. Importes en euros, tal como salen (descuentos en negativo). */
export interface ParsedReceipt {
  tienda?: string;
  fecha?: string;
  total: number;
  lineas: { texto: string; cantidad?: number; importe: number }[];
}

export interface ReceiptLine {
  texto: string;
  cantidad?: number;
  importe: number;
}

// Diferencia que se tolera entre la suma de las líneas y el total del ticket (redondeos del ticket)
const MAX_DESCUADRE_CENTS = 2;
const MAX_LINEAS = 200;
const MAX_TEXTO = 100;

export const PARTES = [1, 0.5];

export const toCents = (euros: number) => Math.round(euros * 100);

/** La mitad (o la parte que sea) de un importe en céntimos; el céntimo suelto se redondea hacia arriba. */
export const shareCents = (cents: number, parte: number) => Math.ceil(cents * parte - 1e-9);

/**
 * Reparte `total` céntimos en proporción a `pesos` (método del mayor resto): cada uno recibe la
 * parte entera de lo suyo y los céntimos que faltan van a los de mayor resto, en orden si empatan.
 * La suma es siempre exactamente `total`. Los pesos pueden ser negativos (descuentos), pero no
 * pueden sumar 0 o menos.
 */
export const splitCents = (total: number, pesos: number[]): number[] => {
  const sumaPesos = pesos.reduce((a, b) => a + b, 0);
  if (sumaPesos <= 0) throw new Error('Los pesos deben sumar más de 0');
  const exactos = pesos.map(p => (p * total) / sumaPesos);
  const partes = exactos.map(Math.floor);
  let faltan = total - partes.reduce((a, b) => a + b, 0);
  const porResto = exactos
    .map((exacto, i) => ({ i, resto: exacto - partes[i] }))
    .sort((a, b) => b.resto - a.resto || a.i - b.i);
  for (const { i } of porResto) {
    if (faltan <= 0) break;
    partes[i] += 1;
    faltan -= 1;
  }
  return partes;
};

/**
 * Limpia la respuesta de la IA. Si no es un objeto lanza (respuesta rota: se reintenta); si no trae
 * un total válido, `total` queda en 0 y quien llama decide que el ticket es ilegible.
 */
export const validateReceipt = (data: unknown): ParsedReceipt => {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Formato JSON inválido devuelto por la IA (no es un objeto)');
  }
  const r = data as Record<string, unknown>;
  const lineas = Array.isArray(r.lineas) ? r.lineas : [];
  return {
    tienda: typeof r.tienda === 'string' && r.tienda.trim() ? r.tienda.trim() : undefined,
    fecha: typeof r.fecha === 'string' ? r.fecha : undefined,
    total: typeof r.total === 'number' && Number.isFinite(r.total) && r.total > 0 ? r.total : 0,
    lineas: lineas
      .filter((l): l is Record<string, unknown> =>
        !!l && typeof l === 'object' && typeof (l as any).texto === 'string' && typeof (l as any).importe === 'number' && Number.isFinite((l as any).importe))
      .map(l => ({
        texto: String(l.texto).trim().slice(0, MAX_TEXTO),
        ...(typeof l.cantidad === 'number' && Number.isFinite(l.cantidad) && l.cantidad > 0 ? { cantidad: l.cantidad } : {}),
        importe: l.importe as number,
      }))
      .filter(l => l.texto !== ''),
  };
};

export const parseParte = (value: unknown): number => {
  if (value === undefined || value === null || value === '') return 1;
  const parte = Number(value);
  if (!PARTES.includes(parte)) throw new AppError('parte debe ser 1 o 0.5', 400);
  return parte;
};

/**
 * Lo que se apunta de un ticket: `monto` en euros (ya con la parte aplicada) y sus líneas, que
 * suman exactamente `monto`. Si el usuario dio el importe se usa ése; si las líneas no cuadran con
 * el total (la IA se saltó o inventó algo) o el importe del usuario no es el del ticket, el gasto
 * va sin líneas.
 */
export const buildReceiptExpense = (receipt: ParsedReceipt, parte: number, montoUsuario?: number) => {
  const totalTicket = toCents(receipt.total);
  const total = montoUsuario !== undefined ? toCents(montoUsuario) : totalTicket;
  const monto = shareCents(total, parte);

  const lineCents = receipt.lineas.map(l => toCents(l.importe));
  const sumaLineas = lineCents.reduce((a, b) => a + b, 0);
  const cuadra = receipt.lineas.length > 0
    && receipt.lineas.length <= MAX_LINEAS
    && sumaLineas > 0
    && Math.abs(sumaLineas - totalTicket) <= MAX_DESCUADRE_CENTS
    && Math.abs(total - totalTicket) <= MAX_DESCUADRE_CENTS;

  if (!cuadra) {
    return { monto: monto / 100, lineas: undefined, lineasDescartadas: receipt.lineas.length > 0 };
  }
  const importes = splitCents(monto, lineCents);
  const lineas: ReceiptLine[] = receipt.lineas.map((l, i) => ({
    texto: l.texto,
    ...(l.cantidad !== undefined ? { cantidad: l.cantidad } : {}),
    importe: importes[i] / 100,
  }));
  return { monto: monto / 100, lineas, lineasDescartadas: false };
};
