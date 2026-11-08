import mongoose from 'mongoose';
import Group, { IGroup } from '../models/Group';
import Expense, { IExpense } from '../models/Expense';
import Income from '../models/Income';
import RecurringItem, { IRecurringItem } from '../models/RecurringItem';
import User from '../models/User';
import AiService, { ExpenseInput } from './AiService';
import { BudgetService } from './BudgetService';
import { ExpenseService } from './ExpenseService';
import { GroupService } from './GroupService';
import { formatAmount } from './PushService';
import { AppError } from '../utils/AppError';
import { FRECUENCIAS } from '../utils/budgetCycle';

/**
 * Asistente de la barra de abajo: entiende un mensaje (texto, foto o nota de voz), contesta
 * preguntas sobre el grupo y propone acciones (añadir, editar o borrar gastos, partidas fijas,
 * ingresos y la configuración del presupuesto). No aplica nada por sí solo: el usuario revisa
 * las acciones y las confirma, y entonces `apply` las vuelve a validar y las ejecuta con los
 * mismos servicios (y las mismas reglas) que la app.
 */

export const ACTION_TYPES = [
  'crear_gasto', 'editar_gasto', 'borrar_gasto',
  'crear_partida', 'editar_partida', 'borrar_partida', 'confirmar_partida',
  'crear_ingreso', 'editar_ingreso', 'borrar_ingreso',
  'configurar_presupuesto'
] as const;
export type ActionType = typeof ACTION_TYPES[number];

/** Solo tienen sentido en un grupo personal (presupuesto) */
const PERSONAL_ONLY: ActionType[] = [
  'crear_partida', 'editar_partida', 'borrar_partida', 'confirmar_partida',
  'crear_ingreso', 'editar_ingreso', 'borrar_ingreso', 'configurar_presupuesto'
];
const WITH_ID: ActionType[] = [
  'editar_gasto', 'borrar_gasto', 'editar_partida', 'borrar_partida', 'confirmar_partida', 'editar_ingreso', 'borrar_ingreso'
];

export interface AssistantAction {
  tipo: ActionType;
  id?: string;
  datos?: Record<string, unknown>;
}

/** Acción lista para enseñar: con su resumen en castellano */
export interface ProposedAction extends AssistantAction {
  resumen: string;
  detalle?: string;
  /** Borra algo: la app la marca en rojo */
  peligro: boolean;
}

export interface AssistantReply {
  respuesta: string;
  acciones: ProposedAction[];
}

export interface HistoryTurn {
  rol: 'usuario' | 'asistente';
  texto: string;
}

export interface ActionResult {
  resumen: string;
  ok: boolean;
  error?: string;
}

export interface AssistantUser {
  id: string;
  nombre: string;
}

const MAX_ACTIONS = 20;
const MAX_HISTORY = 6;
const MAX_HISTORY_TEXT = 1000;
const RECENT_EXPENSES = 150;
const RECENT_INCOMES = 30;

const round2 = (n: number) => Math.round(n * 100) / 100;
const idOf = (value: unknown) => String((value as any)?._id ?? value);
const ymd = (date: Date) => date.toISOString().slice(0, 10);
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isDay = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) && !Number.isNaN(new Date(value.slice(0, 10)).getTime());
const shortDate = (value: string | Date) =>
  new Date(typeof value === 'string' ? `${value.slice(0, 10)}T00:00:00Z` : value)
    .toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
    .replace('.', '');
const money = (n: number) => formatAmount(n);
const categories = (value: unknown) =>
  (Array.isArray(value) ? value : typeof value === 'string' ? [value] : [])
    .filter((c): c is string => typeof c === 'string' && c.trim() !== '')
    .map(c => c.trim());
const positive = (value: unknown) => {
  const n = typeof value === 'string' ? Number(value.replace(',', '.')) : Number(value);
  return Number.isFinite(n) && n > 0 ? round2(n) : undefined;
};
const text = (value: unknown) => (typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined);

/** Fecha de hoy en España, p. ej. "domingo, 8 de noviembre de 2026 (2026-11-08)" */
const todayLabel = (now: Date) => {
  const timeZone = 'Europe/Madrid';
  const long = now.toLocaleDateString('es-ES', { timeZone, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return `${long} (${now.toLocaleDateString('sv-SE', { timeZone })})`;
};
const todayYmd = (now: Date) => now.toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });

/** Cambio de un campo para el resumen: "50,00 € → 55,00 €" */
type Change = { campo: string; antes: string; despues: string };
const describeChanges = (changes: Change[]) => changes.map(c => `${c.campo}: ${c.antes} → ${c.despues}`).join(' · ');

interface Context {
  group: IGroup;
  personal: boolean;
  members: { id: string; nombre: string }[];
}

export class AssistantService {
  private readonly budget: BudgetService;
  private readonly expenses = new ExpenseService();
  private readonly groups = new GroupService();

  constructor(private readonly now: () => Date = () => new Date()) {
    this.budget = new BudgetService(now);
  }

  // ---------- Proponer ----------

  async draft(groupId: string, user: AssistantUser, input: ExpenseInput, history: unknown = []): Promise<AssistantReply> {
    const ctx = await this.context(groupId);
    const prompt = await this.buildPrompt(ctx, user, input.kind, this.cleanHistory(history));
    const raw = await AiService.askWithFallback(prompt, input, t => {
      const parsed = AiService.parseJson(t);
      if (!isObject(parsed)) throw new Error('Formato JSON inválido devuelto por la IA (no es un objeto)');
      return parsed;
    });

    const respuesta = text(raw.respuesta) ?? '';
    const proposed = Array.isArray(raw.acciones) ? raw.acciones.slice(0, MAX_ACTIONS) : [];
    const acciones: ProposedAction[] = [];
    const descartadas: string[] = [];
    for (const action of proposed) {
      try {
        acciones.push(await this.prepare(ctx, user, action));
      } catch (error) {
        descartadas.push(error instanceof Error ? error.message : String(error));
      }
    }
    const aviso = descartadas.length ? `\n(No he podido preparar ${descartadas.length === 1 ? 'una acción' : `${descartadas.length} acciones`}: ${descartadas.join('; ')}.)` : '';
    const fallback = acciones.length ? '' : 'No he entendido qué quieres hacer. Prueba con algo como «Cena 45 €» o «¿Cuánto me queda este mes?».';
    return { respuesta: (respuesta || fallback) + aviso, acciones };
  }

  private cleanHistory(history: unknown): HistoryTurn[] {
    let list = history;
    if (typeof list === 'string') {
      try { list = JSON.parse(list); } catch { list = []; }
    }
    if (!Array.isArray(list)) return [];
    return list
      .filter((t): t is HistoryTurn => isObject(t) && (t.rol === 'usuario' || t.rol === 'asistente') && typeof t.texto === 'string')
      .slice(-MAX_HISTORY)
      .map(t => ({ rol: t.rol, texto: t.texto.slice(0, MAX_HISTORY_TEXT) }));
  }

  private async context(groupId: string): Promise<Context> {
    if (!mongoose.isValidObjectId(groupId)) throw new AppError('Grupo no válido', 400);
    const group = await Group.findById(groupId);
    if (!group) throw new AppError('Grupo no encontrado', 404);
    const users = await User.find({ _id: { $in: group.miembros } }).select('nombre').lean();
    return {
      group,
      personal: group.tipo === 'personal',
      members: users.map(u => ({ id: String(u._id), nombre: (u as any).nombre }))
    };
  }

  /** Todo lo que la IA necesita saber del grupo para contestar y para elegir ids. */
  private async buildPrompt(ctx: Context, user: AssistantUser, kind: ExpenseInput['kind'], history: HistoryTurn[]) {
    const groupId = idOf(ctx.group._id);
    const name = (id: unknown) => ctx.members.find(m => m.id === idOf(id))?.nombre ?? '¿?';
    const recent = await Expense.find({ grupo_id: groupId }).sort({ fecha: -1 }).limit(RECENT_EXPENSES);
    const datos: Record<string, unknown> = {
      grupo: { nombre: ctx.group.nombre, tipo: ctx.personal ? 'personal' : 'compartido' },
      yo: { id: user.id, nombre: user.nombre },
      miembros: ctx.members,
      gastosRecientes: recent.map(e => ({
        id: idOf(e._id),
        fecha: ymd(e.fecha),
        descripcion: e.descripcion,
        importe: e.monto,
        categoria: e.categoria,
        lugar: e.localization || undefined,
        pagadoPor: (e.pagado_por ?? []).map(name),
        partidaFija: e.recurrente_id ? idOf(e.recurrente_id) : undefined
      })),
      totalesPorCategoriaYMes: await this.monthlyTotals(groupId)
    };

    if (ctx.personal) {
      const [items, incomes, resumen, prevision] = await Promise.all([
        RecurringItem.find({ grupo_id: groupId }),
        Income.find({ grupo_id: groupId }).sort({ fecha: -1 }).limit(RECENT_INCOMES),
        this.budget.getSummary(groupId, user.id).catch(() => null),
        this.budget.getForecast(groupId, user.id, 13).catch(() => null)
      ]);
      datos.configuracionPresupuesto = ctx.group.presupuesto;
      datos.partidasFijas = items.map(i => ({
        id: idOf(i._id), tipo: i.tipo, nombre: i.nombre, importe: i.importe, frecuencia: i.frecuencia,
        fechaInicio: ymd(i.fechaInicio), fechaFin: i.fechaFin ? ymd(i.fechaFin) : undefined,
        categoria: i.categoria, activo: i.activo, hucha: i.prorratear || undefined
      }));
      datos.ingresosSueltos = incomes.map(i => ({ id: idOf(i._id), fecha: ymd(i.fecha), descripcion: i.descripcion, importe: i.monto }));
      if (resumen) {
        datos.cicloActual = {
          inicio: resumen.ciclo.inicio, fin: resumen.ciclo.fin, diasRestantes: resumen.ciclo.diasRestantes,
          ingresos: resumen.ingresos.total, facturas: resumen.facturas.total, apartadoEnHuchas: resumen.reservas.total,
          ahorroObjetivo: resumen.ahorroObjetivo, presupuestoParaGastar: resumen.presupuestoGastable,
          gastadoEnVariables: resumen.gastado, disponible: resumen.disponible, porDia: resumen.porDia, porSemana: resumen.porSemana,
          facturasDelCiclo: resumen.facturas.lineas.map(l => ({ nombre: l.nombre, fecha: l.fecha, importe: l.importe, estado: l.estado })),
          huchas: resumen.reservas.lineas.map(l => ({ nombre: l.nombre, cuota: l.cuota, saldo: l.saldo, proximoPago: l.proximoPago })),
          limitesCategoria: resumen.limitesCategoria
        };
      }
      if (prevision) {
        datos.prevision = prevision.ciclos.map(c => ({ inicio: c.inicio, ingresos: c.ingresos, facturas: c.facturas, huchas: c.reservas, paraGastar: c.presupuestoGastable }));
      }
    } else {
      const { balances } = await this.expenses.getGroupBalance(groupId);
      datos.balances = balances.map(b => ({ nombre: b.nombre, balance: b.balance }));
    }

    const source = kind === 'text'
      ? 'El usuario te escribe un mensaje.'
      : 'El usuario te manda un archivo: una foto (normalmente un ticket o factura) o una nota de voz con lo que quiere.';
    const conversation = history.length
      ? `\nConversación reciente (de más antigua a más nueva), por si el mensaje la continúa:\n${history.map(t => `${t.rol === 'usuario' ? 'Usuario' : 'Asistente'}: ${t.texto}`).join('\n')}\n`
      : '';

    return `Eres el asistente de Trincaunt, una app de gastos compartidos y presupuesto personal. Hablas en castellano, breve y claro.
${source}
Hoy es ${todayLabel(this.now())}. Usa esta fecha para resolver fechas relativas ("ayer", "el lunes", "el mes que viene").

Puedes hacer dos cosas, a la vez si hace falta:
1. Contestar preguntas sobre los datos de abajo (gastos, totales, balances${ctx.personal ? ', presupuesto, partidas fijas, previsión' : ''}). Haz las cuentas con cuidado y usa solo estos datos; si no están, dilo.
2. Proponer acciones para lo que el usuario pide cambiar. NO se aplican hasta que el usuario las confirme, así que propónlas sin pedir permiso.

Devuelve SOLO un objeto JSON crudo, sin markdown:
{"respuesta": "texto para el usuario", "acciones": [ ... ]}

- "respuesta": la respuesta a la pregunta, o una frase corta que resuma lo que propones. Si no está claro a qué gasto o partida se refiere (hay varios que encajan, o ninguno), pregunta cuál en "respuesta" y no propongas esa acción.
- "acciones": lista (vacía si solo es una pregunta). Cada acción es {"tipo": ..., "id": ..., "datos": {...}}. Usa los ids EXACTOS de los datos; nunca te los inventes.

Tipos de acción:
- "crear_gasto": datos {descripcion, monto, fecha (AAAA-MM-DD), categoria: [..], localization?, pagado_por? (id de un miembro, solo si se dice quién pagó)}. Categoría precisa (["Cervezas"] mejor que ["Ocio"], ["Tren"] mejor que ["Transporte"]). Un ticket con varios productos suele ser un solo gasto.
- "editar_gasto": id del gasto, datos solo con lo que cambia (descripcion, monto, fecha, categoria, localization, pagado_por).
- "borrar_gasto": id del gasto.
${ctx.personal ? `- "crear_partida": partida fija (factura o ingreso que se repite). datos {tipo: "factura"|"ingreso", nombre, importe, frecuencia: ${FRECUENCIAS.map(f => `"${f}"`).join('|')}, fechaInicio (primer pago, AAAA-MM-DD), fechaFin?, categoria?: [..], prorratear? (hucha: apartar cada ciclo una parte; solo facturas no mensuales o mensuales con fechaFin)}.
- "editar_partida": id, datos solo con lo que cambia (los mismos campos; activo: false la desactiva; fechaFin: null quita la fecha de fin).
- "borrar_partida": id.
- "confirmar_partida": marcar como pagada una factura fija (o cobrado un ingreso fijo) de este ciclo. id, datos {monto?, fecha?} si el real difiere del estimado.
- "crear_ingreso": ingreso suelto (no fijo). datos {descripcion, monto, fecha}.
- "editar_ingreso": id, datos con lo que cambia. "borrar_ingreso": id.
- "configurar_presupuesto": datos solo con lo que cambia: ahorroObjetivo (euros por ciclo), diaInicioCiclo (día de cobro, 1-31), limitesCategoria (lista COMPLETA [{categoria, limite}], incluye los que ya hay si se añade uno), incluirOtrosGrupos, avisos.` : '- En este grupo compartido solo puedes proponer acciones sobre gastos.'}
${conversation}
Datos del grupo (JSON):
${JSON.stringify(datos)}`;
  }

  /** Total por categoría en los tres últimos meses naturales: la IA suma mal listas largas. */
  private async monthlyTotals(groupId: string) {
    const today = todayYmd(this.now());
    const [y, m] = today.split('-').map(Number);
    const from = new Date(Date.UTC(y, m - 3, 1));
    const expenses = await Expense.find({ grupo_id: groupId, fecha: { $gte: from } }).select('monto fecha categoria').lean();
    const totals: Record<string, Record<string, number>> = {};
    for (const e of expenses as unknown as IExpense[]) {
      const month = ymd(e.fecha).slice(0, 7);
      const cats = e.categoria?.length ? e.categoria : ['Sin categoría'];
      totals[month] ??= {};
      totals[month].TOTAL = round2((totals[month].TOTAL ?? 0) + e.monto);
      for (const c of cats) totals[month][c] = round2((totals[month][c] ?? 0) + e.monto);
    }
    return totals;
  }

  // ---------- Validar y describir ----------

  /** Comprueba una acción (de la IA o devuelta por la app), limpia sus datos y la describe. */
  private async prepare(ctx: Context, user: AssistantUser, action: unknown): Promise<ProposedAction> {
    if (!isObject(action) || !ACTION_TYPES.includes(action.tipo as ActionType)) throw new Error('acción desconocida');
    const tipo = action.tipo as ActionType;
    if (PERSONAL_ONLY.includes(tipo) && !ctx.personal) throw new Error('el presupuesto solo existe en grupos personales');
    const id = WITH_ID.includes(tipo) ? String(action.id ?? '') : undefined;
    if (id !== undefined && !mongoose.isValidObjectId(id)) throw new Error('no encuentro a qué se refiere');
    const datos = isObject(action.datos) ? action.datos : {};
    const groupId = idOf(ctx.group._id);
    const name = (memberId: string) => ctx.members.find(m => m.id === memberId)?.nombre ?? '¿?';
    const payer = (value: unknown) => (typeof value === 'string' && ctx.members.some(m => m.id === value) ? value : undefined);

    switch (tipo) {
      case 'crear_gasto': {
        const descripcion = text(datos.descripcion);
        const monto = positive(datos.monto);
        if (!descripcion || !monto) throw new Error('un gasto necesita descripción e importe');
        const clean = {
          descripcion,
          monto,
          fecha: isDay(datos.fecha) ? datos.fecha.slice(0, 10) : todayYmd(this.now()),
          categoria: categories(datos.categoria).length ? categories(datos.categoria) : ['IA'],
          localization: text(datos.localization) ?? '',
          pagado_por: payer(datos.pagado_por) ?? user.id
        };
        return {
          tipo, datos: clean, peligro: false,
          resumen: `Nuevo gasto «${descripcion}» · ${money(monto)}`,
          detalle: [shortDate(clean.fecha), clean.categoria.join(', '), ctx.personal ? '' : `pagó ${name(clean.pagado_por)}`].filter(Boolean).join(' · ')
        };
      }
      case 'editar_gasto':
      case 'borrar_gasto': {
        const expense = await Expense.findOne({ _id: id, grupo_id: groupId });
        if (!expense) throw new Error('no encuentro ese gasto en este grupo');
        const label = `«${expense.descripcion}» · ${money(expense.monto)} · ${shortDate(expense.fecha)}`;
        if (tipo === 'borrar_gasto') return { tipo, id, peligro: true, resumen: `Borrar gasto ${label}` };

        const clean: Record<string, unknown> = {};
        const changes: Change[] = [];
        const descripcion = text(datos.descripcion);
        if (descripcion && descripcion !== expense.descripcion) { clean.descripcion = descripcion; changes.push({ campo: 'descripción', antes: expense.descripcion, despues: descripcion }); }
        const monto = positive(datos.monto);
        if (monto && monto !== expense.monto) { clean.monto = monto; changes.push({ campo: 'importe', antes: money(expense.monto), despues: money(monto) }); }
        if (isDay(datos.fecha) && datos.fecha.slice(0, 10) !== ymd(expense.fecha)) {
          clean.fecha = datos.fecha.slice(0, 10);
          changes.push({ campo: 'fecha', antes: shortDate(expense.fecha), despues: shortDate(datos.fecha) });
        }
        const cats = categories(datos.categoria);
        if (cats.length && cats.join('|') !== (expense.categoria ?? []).join('|')) {
          clean.categoria = cats;
          changes.push({ campo: 'categoría', antes: (expense.categoria ?? []).join(', ') || '—', despues: cats.join(', ') });
        }
        if (typeof datos.localization === 'string' && datos.localization.trim() !== (expense.localization ?? '')) {
          clean.localization = datos.localization.trim();
          changes.push({ campo: 'lugar', antes: expense.localization || '—', despues: datos.localization.trim() || '—' });
        }
        const newPayer = payer(datos.pagado_por);
        const oldPayers = (expense.pagado_por ?? []).map(idOf);
        if (newPayer && !(oldPayers.length === 1 && oldPayers[0] === newPayer)) {
          clean.pagado_por = newPayer;
          changes.push({ campo: 'pagó', antes: oldPayers.map(name).join(', '), despues: name(newPayer) });
        }
        if (!changes.length) throw new Error(`no hay nada que cambiar en «${expense.descripcion}»`);
        return { tipo, id, datos: clean, peligro: false, resumen: `Cambiar gasto ${label}`, detalle: describeChanges(changes) };
      }
      case 'crear_partida': {
        const clean = this.cleanItemFields(datos);
        if (!clean.nombre || !clean.importe || !clean.fechaInicio) throw new Error('una partida fija necesita nombre, importe y primer pago');
        clean.tipo = clean.tipo ?? 'factura';
        clean.frecuencia = clean.frecuencia ?? 'mensual';
        const kind = clean.tipo === 'ingreso' ? 'Nuevo ingreso fijo' : 'Nueva factura fija';
        return {
          tipo, datos: clean, peligro: false,
          resumen: `${kind} «${clean.nombre}» · ${money(clean.importe as number)} ${clean.frecuencia}`,
          detalle: [
            `desde el ${shortDate(clean.fechaInicio as string)}`,
            clean.fechaFin ? `hasta el ${shortDate(clean.fechaFin as string)}` : '',
            categories(clean.categoria).join(', '),
            clean.prorratear ? 'con hucha' : ''
          ].filter(Boolean).join(' · ')
        };
      }
      case 'editar_partida':
      case 'borrar_partida':
      case 'confirmar_partida': {
        const item = await RecurringItem.findOne({ _id: id, grupo_id: groupId });
        if (!item) throw new Error('no encuentro esa partida fija');
        const label = `«${item.nombre}» · ${money(item.importe)} ${item.frecuencia}`;
        if (tipo === 'borrar_partida') return { tipo, id, peligro: true, resumen: `Borrar partida fija ${label}` };
        if (tipo === 'confirmar_partida') {
          const monto = positive(datos.monto) ?? item.importe;
          const fecha = isDay(datos.fecha) ? datos.fecha.slice(0, 10) : todayYmd(this.now());
          return {
            tipo, id, datos: { monto, fecha }, peligro: false,
            resumen: `${item.tipo === 'ingreso' ? 'Marcar como cobrado' : 'Marcar como pagada'} «${item.nombre}» · ${money(monto)}`,
            detalle: shortDate(fecha)
          };
        }
        const clean = this.cleanItemFields(datos);
        const changes = this.itemChanges(item, clean);
        if (!changes.length) throw new Error(`no hay nada que cambiar en «${item.nombre}»`);
        return { tipo, id, datos: clean, peligro: false, resumen: `Cambiar partida fija ${label}`, detalle: describeChanges(changes) };
      }
      case 'crear_ingreso': {
        const descripcion = text(datos.descripcion);
        const monto = positive(datos.monto);
        if (!descripcion || !monto) throw new Error('un ingreso necesita descripción e importe');
        const fecha = isDay(datos.fecha) ? datos.fecha.slice(0, 10) : todayYmd(this.now());
        return { tipo, datos: { descripcion, monto, fecha }, peligro: false, resumen: `Nuevo ingreso «${descripcion}» · ${money(monto)}`, detalle: shortDate(fecha) };
      }
      case 'editar_ingreso':
      case 'borrar_ingreso': {
        const income = await Income.findOne({ _id: id, grupo_id: groupId });
        if (!income) throw new Error('no encuentro ese ingreso');
        const label = `«${income.descripcion}» · ${money(income.monto)} · ${shortDate(income.fecha)}`;
        if (tipo === 'borrar_ingreso') return { tipo, id, peligro: true, resumen: `Borrar ingreso ${label}` };
        const clean: Record<string, unknown> = {};
        const changes: Change[] = [];
        const descripcion = text(datos.descripcion);
        if (descripcion && descripcion !== income.descripcion) { clean.descripcion = descripcion; changes.push({ campo: 'descripción', antes: income.descripcion, despues: descripcion }); }
        const monto = positive(datos.monto);
        if (monto && monto !== income.monto) { clean.monto = monto; changes.push({ campo: 'importe', antes: money(income.monto), despues: money(monto) }); }
        if (isDay(datos.fecha) && datos.fecha.slice(0, 10) !== ymd(income.fecha)) {
          clean.fecha = datos.fecha.slice(0, 10);
          changes.push({ campo: 'fecha', antes: shortDate(income.fecha), despues: shortDate(datos.fecha) });
        }
        if (!changes.length) throw new Error(`no hay nada que cambiar en «${income.descripcion}»`);
        return { tipo, id, datos: clean, peligro: false, resumen: `Cambiar ingreso ${label}`, detalle: describeChanges(changes) };
      }
      case 'configurar_presupuesto': {
        const current = ctx.group.presupuesto;
        const clean: Record<string, unknown> = {};
        const changes: Change[] = [];
        if (datos.ahorroObjetivo !== undefined) {
          const n = Number(datos.ahorroObjetivo);
          if (Number.isFinite(n) && n >= 0 && n !== current?.ahorroObjetivo) {
            clean.ahorroObjetivo = round2(n);
            changes.push({ campo: 'ahorro objetivo', antes: money(current?.ahorroObjetivo ?? 0), despues: money(n) });
          }
        }
        if (datos.diaInicioCiclo !== undefined) {
          const n = Number(datos.diaInicioCiclo);
          if (Number.isInteger(n) && n >= 1 && n <= 31 && n !== current?.diaInicioCiclo) {
            clean.diaInicioCiclo = n;
            changes.push({ campo: 'día de cobro', antes: String(current?.diaInicioCiclo ?? '—'), despues: String(n) });
          }
        }
        if (Array.isArray(datos.limitesCategoria)) {
          const limites = datos.limitesCategoria
            .filter(isObject)
            .map(l => ({ categoria: text(l.categoria), limite: positive(l.limite) }))
            .filter((l): l is { categoria: string; limite: number } => !!l.categoria && !!l.limite);
          const fmt = (list: { categoria: string; limite: number }[]) => list.map(l => `${l.categoria} ${money(l.limite)}`).join(', ') || 'ninguno';
          const before = (current?.limitesCategoria ?? []).map(l => ({ categoria: l.categoria, limite: l.limite }));
          if (fmt(limites) !== fmt(before)) {
            clean.limitesCategoria = limites;
            changes.push({ campo: 'límites', antes: fmt(before), despues: fmt(limites) });
          }
        }
        for (const [key, campo] of [['incluirOtrosGrupos', 'contar grupos compartidos'], ['avisos', 'avisos']] as const) {
          if (typeof datos[key] === 'boolean' && datos[key] !== current?.[key]) {
            clean[key] = datos[key];
            changes.push({ campo, antes: current?.[key] ? 'sí' : 'no', despues: datos[key] ? 'sí' : 'no' });
          }
        }
        if (!changes.length) throw new Error('no hay nada que cambiar en el presupuesto');
        return { tipo, datos: clean, peligro: false, resumen: 'Cambiar el presupuesto', detalle: describeChanges(changes) };
      }
    }
  }

  private cleanItemFields(datos: Record<string, unknown>): Record<string, unknown> {
    const clean: Record<string, unknown> = {};
    if (datos.tipo === 'factura' || datos.tipo === 'ingreso') clean.tipo = datos.tipo;
    const nombre = text(datos.nombre);
    if (nombre) clean.nombre = nombre;
    const importe = positive(datos.importe ?? datos.monto);
    if (importe) clean.importe = importe;
    if (FRECUENCIAS.includes(datos.frecuencia as any)) clean.frecuencia = datos.frecuencia;
    if (isDay(datos.fechaInicio)) clean.fechaInicio = datos.fechaInicio.slice(0, 10);
    if (datos.fechaFin === null) clean.fechaFin = null;
    else if (isDay(datos.fechaFin)) clean.fechaFin = datos.fechaFin.slice(0, 10);
    if (datos.categoria !== undefined) clean.categoria = categories(datos.categoria);
    if (typeof datos.activo === 'boolean') clean.activo = datos.activo;
    if (typeof datos.prorratear === 'boolean') clean.prorratear = datos.prorratear;
    return clean;
  }

  /** Quita de `clean` lo que no cambia y devuelve los cambios para el resumen. */
  private itemChanges(item: IRecurringItem, clean: Record<string, unknown>): Change[] {
    const changes: Change[] = [];
    const yesNo = (b: unknown) => (b ? 'sí' : 'no');
    const fields: [string, string, unknown, (v: any) => string][] = [
      ['tipo', 'tipo', item.tipo, String],
      ['nombre', 'nombre', item.nombre, String],
      ['importe', 'importe', item.importe, money],
      ['frecuencia', 'frecuencia', item.frecuencia, String],
      ['fechaInicio', 'primer pago', ymd(item.fechaInicio), shortDate],
      ['fechaFin', 'hasta', item.fechaFin ? ymd(item.fechaFin) : null, v => (v ? shortDate(v) : 'sin fin')],
      ['categoria', 'categoría', (item.categoria ?? []).join('|'), v => String(v).split('|').filter(Boolean).join(', ') || '—'],
      ['activo', 'activa', item.activo, yesNo],
      ['prorratear', 'hucha', !!item.prorratear, yesNo]
    ];
    for (const [key, campo, before, fmt] of fields) {
      if (!(key in clean)) continue;
      const after = key === 'categoria' ? (clean.categoria as string[]).join('|') : clean[key];
      if (after === before) { delete clean[key]; continue; }
      changes.push({ campo, antes: fmt(before), despues: fmt(after) });
    }
    return changes;
  }

  // ---------- Aplicar ----------

  /**
   * Ejecuta las acciones que el usuario ha confirmado, una a una y en orden. Cada una se
   * vuelve a validar (pueden venir tocadas) y se aplica con los servicios de la app; si una
   * falla, las demás siguen. Devuelve el resultado de cada una y los gastos creados.
   */
  async apply(groupId: string, user: AssistantUser, actions: unknown): Promise<{ resultados: ActionResult[]; gastosCreados: IExpense[] }> {
    if (!Array.isArray(actions) || actions.length === 0) throw new AppError('No hay acciones que aplicar', 400);
    if (actions.length > MAX_ACTIONS) throw new AppError(`No se pueden aplicar más de ${MAX_ACTIONS} acciones a la vez`, 400);
    const ctx = await this.context(groupId);

    const resultados: ActionResult[] = [];
    const gastosCreados: IExpense[] = [];
    for (const raw of actions) {
      let resumen = isObject(raw) && typeof raw.resumen === 'string' ? raw.resumen : 'Acción';
      try {
        const action = await this.prepare(ctx, user, raw);
        resumen = action.resumen;
        const created = await this.execute(ctx, user, action);
        if (created) gastosCreados.push(created);
        if (action.tipo === 'configurar_presupuesto') ctx.group = (await Group.findById(groupId)) ?? ctx.group;
        resultados.push({ resumen, ok: true });
      } catch (error) {
        resultados.push({ resumen, ok: false, error: error instanceof Error ? error.message : String(error) });
      }
    }
    return { resultados, gastosCreados };
  }

  private async execute(ctx: Context, user: AssistantUser, action: ProposedAction): Promise<IExpense | null> {
    const groupId = idOf(ctx.group._id);
    const datos = action.datos ?? {};
    const id = action.id!;
    switch (action.tipo) {
      case 'crear_gasto':
        return this.expenses.createExpense({
          grupo_id: ctx.group._id as any,
          descripcion: datos.descripcion as string,
          monto: datos.monto as number,
          fecha: new Date(datos.fecha as string),
          categoria: datos.categoria as string[],
          localization: datos.localization as string,
          pagado_por: [datos.pagado_por as any]
        }, user.id);
      case 'editar_gasto':
        await this.expenses.updateExpense(id, {
          ...datos,
          ...(datos.fecha ? { fecha: new Date(datos.fecha as string) } : {}),
          ...(datos.pagado_por ? { pagado_por: [datos.pagado_por as any] } : {})
        } as Partial<IExpense>);
        return null;
      case 'borrar_gasto':
        await this.expenses.deleteExpense(id);
        return null;
      case 'crear_partida':
        await this.budget.createRecurringItem(groupId, user.id, datos);
        return null;
      case 'editar_partida':
        await this.budget.updateRecurringItem(id, user.id, datos);
        return null;
      case 'borrar_partida':
        await this.budget.deleteRecurringItem(id, user.id);
        return null;
      case 'confirmar_partida': {
        const result = await this.budget.confirmRecurringItem(id, user.id, datos as { monto?: number; fecha?: string });
        return result.tipo === 'gasto' ? result.data : null;
      }
      case 'crear_ingreso':
        await this.budget.createIncome(groupId, user.id, datos);
        return null;
      case 'editar_ingreso':
        await this.budget.updateIncome(id, user.id, datos);
        return null;
      case 'borrar_ingreso':
        await this.budget.deleteIncome(id, user.id);
        return null;
      case 'configurar_presupuesto':
        await this.groups.updateGroup(groupId, { presupuesto: datos } as any, user.id);
        return null;
    }
  }
}
