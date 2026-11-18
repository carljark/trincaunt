import { AppError } from '../utils/AppError';

export const TICKET_ILEGIBLE = 'ticket_ilegible';
export const IA_DESACTIVADA = 'ia_desactivada';

/**
 * Una línea del ticket tal como la lee la IA: `texto` como sale impreso, `nombre` legible y
 * `categoria` del artículo si los da. Importe en euros (los descuentos en negativo). `articulo` es
 * el artículo de la lista de la compra al que corresponde, si se mandó la lista y la IA lo encontró.
 */
export interface ReceiptLine {
  texto: string;
  nombre?: string;
  categoria?: string;
  articulo?: string;
  cantidad?: number;
  importe: number;
}

/** Lo que la IA lee de un ticket. */
export interface ParsedReceipt {
  tienda?: string;
  fecha?: string;
  total: number;
  lineas: ReceiptLine[];
}

/** Un artículo que se apunta como gasto propio: `importe` en euros, con la parte ya aplicada. */
export interface ReceiptItem {
  descripcion: string;
  categoria?: string;
  importe: number;
}

// Diferencia que se tolera entre la suma de las líneas y el total del ticket (redondeos del ticket)
const MAX_DESCUADRE_CENTS = 2;
const MAX_LINEAS = 200;
const MAX_TEXTO = 100;
const MAX_CATEGORIA = 40;
const MAX_ARTICULOS = 100;
const MAX_ARTICULO = 60;

export const SUFIJO_A_MEDIAS = ' · a medias';

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

const optionalText = (value: unknown, max: number) =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : undefined;

/**
 * Los artículos de la lista de la compra que manda cgsshoppings (`datos.articulos`), para que la IA
 * diga a cuál corresponde cada línea. Sin repetir; lo que no es texto se ignora.
 */
export const parseArticulos = (value: unknown): string[] => {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new AppError('articulos debe ser una lista', 400);
  const articulos = value.map(a => optionalText(a, MAX_ARTICULO)).filter((a): a is string => !!a);
  return [...new Set(articulos)].slice(0, MAX_ARTICULOS);
};

/**
 * Limpia la respuesta de la IA. Si no es un objeto lanza (respuesta rota: se reintenta); si no trae
 * un total válido, `total` queda en 0 y quien llama decide que el ticket es ilegible.
 */
export const validateReceipt = (data: unknown, articulos: string[] = []): ParsedReceipt => {
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
        ...(optionalText(l.nombre, MAX_TEXTO) ? { nombre: optionalText(l.nombre, MAX_TEXTO) } : {}),
        ...(optionalText(l.categoria, MAX_CATEGORIA) ? { categoria: optionalText(l.categoria, MAX_CATEGORIA) } : {}),
        // Solo un artículo de la lista, tal cual: la IA no puede inventarse otro
        ...(typeof l.articulo === 'string' && articulos.includes(l.articulo) ? { articulo: l.articulo } : {}),
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
 * Junta cada descuento con el artículo de antes (en los tickets el descuento va debajo de lo que
 * rebaja); uno que vaya al principio se suma al primer artículo. Devuelve los artículos con su
 * importe neto en céntimos.
 */
export const foldDiscounts = (lineas: ReceiptLine[]) => {
  const articulos: { linea: ReceiptLine; cents: number }[] = [];
  let pendiente = 0;
  for (const linea of lineas) {
    const cents = toCents(linea.importe);
    if (cents < 0 && articulos.length > 0) articulos[articulos.length - 1].cents += cents;
    else if (cents < 0) pendiente += cents;
    else {
      articulos.push({ linea, cents: cents + pendiente });
      pendiente = 0;
    }
  }
  return articulos;
};

/** Nombre del gasto de un artículo: el legible si la IA lo dio, con las unidades delante si son varias. */
const itemDescription = (linea: ReceiptLine, parte: number) => {
  const nombre = linea.nombre ?? linea.texto;
  const unidades = linea.cantidad !== undefined && Number.isInteger(linea.cantidad) && linea.cantidad > 1 ? `${linea.cantidad} ` : '';
  return `${unidades}${nombre}${parte === 1 ? '' : SUFIJO_A_MEDIAS}`;
};

/**
 * Lo que se apunta de un ticket: un gasto por artículo (`articulos`), que entre todos suman
 * exactamente `monto` (en euros, ya con la parte aplicada). Si el usuario dio el importe se usa
 * ése. Si las líneas no cuadran con el total (la IA se saltó o inventó algo), el importe del
 * usuario no es el del ticket o un descuento deja un artículo a 0 o menos, no hay `articulos` y
 * se apunta un solo gasto por `monto`.
 */
export const buildReceiptItems = (receipt: ParsedReceipt, parte: number, montoUsuario?: number) => {
  const totalTicket = toCents(receipt.total);
  const total = montoUsuario !== undefined ? toCents(montoUsuario) : totalTicket;
  const monto = shareCents(total, parte);

  const sumaLineas = receipt.lineas.reduce((suma, l) => suma + toCents(l.importe), 0);
  const articulos = foldDiscounts(receipt.lineas);
  const cuadra = articulos.length > 0
    && receipt.lineas.length <= MAX_LINEAS
    && articulos.every(a => a.cents > 0)
    && Math.abs(sumaLineas - totalTicket) <= MAX_DESCUADRE_CENTS
    && Math.abs(total - totalTicket) <= MAX_DESCUADRE_CENTS;

  if (!cuadra) {
    return { monto: monto / 100, articulos: undefined, lineasDescartadas: receipt.lineas.length > 0 };
  }
  const importes = splitCents(monto, articulos.map(a => a.cents));
  const items: ReceiptItem[] = articulos
    .map(({ linea }, i) => ({
      descripcion: itemDescription(linea, parte),
      ...(linea.categoria ? { categoria: linea.categoria } : {}),
      importe: importes[i] / 100,
    }))
    // Un artículo de 1 céntimo a medias puede quedarse en 0: sin él el resto sigue sumando `monto`
    .filter(item => item.importe > 0);
  return { monto: monto / 100, articulos: items, lineasDescartadas: false };
};
