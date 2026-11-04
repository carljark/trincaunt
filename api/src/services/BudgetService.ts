import mongoose from 'mongoose';
import Group, { IGroup, IGroupPresupuesto, ILimiteCategoria, PRESUPUESTO_POR_DEFECTO } from '../models/Group';
import CategoryAlias from '../models/CategoryAlias';
import Expense, { IExpense } from '../models/Expense';
import Income, { IIncome } from '../models/Income';
import RecurringItem, { IRecurringItem } from '../models/RecurringItem';
import { AppError } from '../utils/AppError';
import {
  Cycle,
  FRECUENCIAS,
  cycleContaining,
  daysBetween,
  occurrencesInRange,
  toCalendarDate,
  todayIn
} from '../utils/budgetCycle';

const round2 = (n: number) => Math.round(n * 100) / 100;
const sum = (values: number[]) => round2(values.reduce((acc, v) => acc + v, 0));
const idOf = (value: unknown) => String((value as any)?._id ?? value);

/** Parte de un gasto que le corresponde a `userId` (misma regla que la vista global). */
export const userShareOf = (expense: Pick<IExpense, 'monto' | 'pagado_por' | 'participantes' | 'asume_gasto'>, userId: string): number => {
  const payers = (Array.isArray(expense.pagado_por) ? expense.pagado_por : [expense.pagado_por]).map(idOf);
  const participants = (expense.participantes ?? []).map(idOf);
  if (expense.asume_gasto) {
    return payers.includes(userId) ? expense.monto / payers.length : 0;
  }
  if (!participants.includes(userId)) return 0;
  return expense.monto / participants.length;
};

export type BillEstado = 'pagada' | 'pendiente';
export type IncomeEstado = 'recibido' | 'previsto';

export interface BudgetLine<E> {
  recurrente_id?: string;
  nombre: string;
  fecha: string;      // YYYY-MM-DD
  importe: number;
  estado: E;
  movimiento_id?: string; // Gasto o ingreso real, si existe
}

export interface CategoryLimitStatus {
  categoria: string;
  limite: number;
  gastado: number;
  restante: number;   // negativo si te has pasado
  porcentaje: number; // gastado / limite * 100, redondeado
}

export interface BudgetSummary {
  ciclo: {
    inicio: string;
    fin: string; // excluido
    offset: number;
    diasTotales: number;
    diasTranscurridos: number; // incluye hoy en el ciclo actual
    diasRestantes: number;     // incluye hoy en el ciclo actual
  };
  configuracion: IGroupPresupuesto;
  ingresos: { recibidos: number; previstos: number; total: number; lineas: BudgetLine<IncomeEstado>[] };
  facturas: { pagadas: number; pendientes: number; total: number; lineas: BudgetLine<BillEstado>[] };
  ahorroObjetivo: number;
  gastosVariables: number;
  otrosGrupos: { total: number; grupos: { _id: string; nombre: string; total: number }[] } | null;
  presupuestoGastable: number; // ingresos - facturas - ahorro
  gastado: number;             // gastos variables + otros grupos
  disponible: number;          // presupuestoGastable - gastado
  porDia: number | null;
  porSemana: number | null;
  ritmo: { gastoIdeal: number; desviacion: number } | null; // desviacion > 0: vas por encima
  limitesCategoria: CategoryLimitStatus[];
}

const normalize = (value: string) => value.trim().toLocaleLowerCase('es');

const RECURRING_FIELDS = ['tipo', 'nombre', 'importe', 'frecuencia', 'fechaInicio', 'fechaFin', 'categoria', 'activo'] as const;
const INCOME_FIELDS = ['descripcion', 'monto', 'fecha'] as const;

const ymd = (date: Date) => date.toISOString().slice(0, 10);
const inCycle = (date: Date, cycle: Cycle) => date >= cycle.inicio && date < cycle.fin;

export class BudgetService {
  constructor(private readonly now: () => Date = () => new Date()) {}

  // ---------- Acceso ----------

  /** Grupo personal del que `userId` es miembro; si no, error. */
  private async getBudgetGroup(groupId: string, userId: string): Promise<IGroup> {
    if (!mongoose.isValidObjectId(groupId)) throw new AppError('Grupo no válido', 400);
    const group = await Group.findById(groupId);
    if (!group) throw new AppError('Grupo no encontrado', 404);
    if (!group.miembros.some(m => m.toString() === userId)) {
      throw new AppError('No perteneces a este grupo', 403);
    }
    if (group.tipo !== 'personal') {
      throw new AppError('El presupuesto solo está disponible en grupos personales', 400);
    }
    return group;
  }

  private async getOwnedRecurringItem(itemId: string, userId: string) {
    if (!mongoose.isValidObjectId(itemId)) throw new AppError('Partida no válida', 400);
    const item = await RecurringItem.findById(itemId);
    if (!item) throw new AppError('Partida recurrente no encontrada', 404);
    const group = await this.getBudgetGroup(item.grupo_id.toString(), userId);
    return { item, group };
  }

  private async getOwnedIncome(incomeId: string, userId: string) {
    if (!mongoose.isValidObjectId(incomeId)) throw new AppError('Ingreso no válido', 400);
    const income = await Income.findById(incomeId);
    if (!income) throw new AppError('Ingreso no encontrado', 404);
    await this.getBudgetGroup(income.grupo_id.toString(), userId);
    return income;
  }

  // ---------- Resumen del ciclo ----------

  async getSummary(groupId: string, userId: string, offset = 0): Promise<BudgetSummary> {
    if (!Number.isInteger(offset) || Math.abs(offset) > 120) throw new AppError('Ciclo no válido', 400);
    const group = await this.getBudgetGroup(groupId, userId);
    const config: IGroupPresupuesto = { ...PRESUPUESTO_POR_DEFECTO, ...(group.presupuesto ? JSON.parse(JSON.stringify(group.presupuesto)) : {}) };

    const today = todayIn('Europe/Madrid', this.now());
    const cycle = cycleContaining(today, config.diaInicioCiclo, offset);
    const fechaEnCiclo = { $gte: cycle.inicio, $lt: cycle.fin };

    const [items, expenses, incomes] = await Promise.all([
      RecurringItem.find({ grupo_id: groupId }),
      Expense.find({ grupo_id: groupId, fecha: fechaEnCiclo }),
      Income.find({ grupo_id: groupId, fecha: fechaEnCiclo })
    ]);

    const facturas = this.buildLines(
      items.filter(i => i.tipo === 'factura'),
      expenses.filter(e => e.recurrente_id).map(e => ({
        _id: idOf(e._id), recurrente_id: idOf(e.recurrente_id), nombre: e.descripcion, fecha: e.fecha, importe: userShareOf(e, userId)
      })),
      cycle,
      'pagada',
      'pendiente'
    );

    const ingresos = this.buildLines(
      items.filter(i => i.tipo === 'ingreso'),
      incomes.map(i => ({
        _id: idOf(i._id), recurrente_id: i.recurrente_id ? idOf(i.recurrente_id) : undefined, nombre: i.descripcion, fecha: i.fecha, importe: i.monto
      })),
      cycle,
      'recibido',
      'previsto'
    );

    const variables = expenses.filter(e => !e.recurrente_id);
    const gastosVariables = sum(variables.map(e => userShareOf(e, userId)));
    const otros = config.incluirOtrosGrupos ? await this.otherGroupsShare(groupId, userId, cycle) : null;
    const otrosGrupos = otros && { total: otros.total, grupos: otros.grupos };
    const limitesCategoria = await this.categoryLimits(config.limitesCategoria, [...variables, ...(otros?.expenses ?? [])], userId);

    const ingresosTotal = sum(ingresos.map(l => l.importe));
    const facturasTotal = sum(facturas.map(l => l.importe));
    const presupuestoGastable = round2(ingresosTotal - facturasTotal - config.ahorroObjetivo);
    const gastado = round2(gastosVariables + (otrosGrupos?.total ?? 0));
    const disponible = round2(presupuestoGastable - gastado);

    const diasTotales = daysBetween(cycle.inicio, cycle.fin);
    const diasTranscurridos = Math.min(diasTotales, Math.max(0, daysBetween(cycle.inicio, today) + 1));
    const diasRestantes = diasTotales - diasTranscurridos + (diasTranscurridos > 0 && inCycle(today, cycle) ? 1 : 0);
    const isCurrent = inCycle(today, cycle);

    const porDia = diasRestantes > 0 ? round2(disponible / diasRestantes) : null;
    const porSemana = diasRestantes > 0 ? round2(disponible * Math.min(7, diasRestantes) / diasRestantes) : null;
    const gastoIdeal = round2(presupuestoGastable * diasTranscurridos / diasTotales);

    return {
      ciclo: { inicio: ymd(cycle.inicio), fin: ymd(cycle.fin), offset, diasTotales, diasTranscurridos, diasRestantes },
      configuracion: config,
      ingresos: {
        recibidos: sum(ingresos.filter(l => l.estado === 'recibido').map(l => l.importe)),
        previstos: sum(ingresos.filter(l => l.estado === 'previsto').map(l => l.importe)),
        total: ingresosTotal,
        lineas: ingresos
      },
      facturas: {
        pagadas: sum(facturas.filter(l => l.estado === 'pagada').map(l => l.importe)),
        pendientes: sum(facturas.filter(l => l.estado === 'pendiente').map(l => l.importe)),
        total: facturasTotal,
        lineas: facturas
      },
      ahorroObjetivo: config.ahorroObjetivo,
      gastosVariables,
      otrosGrupos,
      presupuestoGastable,
      gastado,
      disponible,
      porDia,
      porSemana,
      ritmo: isCurrent ? { gastoIdeal, desviacion: round2(gastado - gastoIdeal) } : null,
      limitesCategoria
    };
  }

  /**
   * Lo gastado del ciclo en cada categoría con límite: tus gastos variables (no las
   * facturas) y, si está activado, tu parte de los de otros grupos. Un gasto cuenta en
   * una categoría si la lleva o si lleva un alias suyo (del mismo grupo o global).
   */
  private async categoryLimits(limits: ILimiteCategoria[], expenses: IExpense[], userId: string): Promise<CategoryLimitStatus[]> {
    if (!limits.length) return [];

    const groupIds = [...new Set(expenses.map(e => idOf(e.grupo_id)))];
    const aliases = groupIds.length
      ? await CategoryAlias.find({ $or: [{ grupo_id: { $in: groupIds } }, { grupo_id: null }] }).lean()
      : [];

    const spent = new Map<string, number>(limits.map(l => [normalize(l.categoria), 0]));
    for (const expense of expenses) {
      const share = userShareOf(expense, userId);
      if (!share) continue;
      const own = new Set((expense.categoria ?? []).map(normalize));
      const cats = new Set(own);
      for (const alias of aliases) {
        if (alias.grupo_id && idOf(alias.grupo_id) !== idOf(expense.grupo_id)) continue;
        if (own.has(normalize(alias.alias))) alias.mainCategories.forEach(c => cats.add(normalize(c)));
      }
      for (const key of cats) if (spent.has(key)) spent.set(key, spent.get(key)! + share);
    }

    return limits.map(({ categoria, limite }) => {
      const gastado = round2(spent.get(normalize(categoria)) ?? 0);
      return { categoria, limite, gastado, restante: round2(limite - gastado), porcentaje: Math.round(gastado / limite * 100) };
    });
  }

  /**
   * Mezcla lo que toca en el ciclo según las partidas activas con los movimientos
   * reales enlazados. Cada movimiento real "cubre" una fecha prevista de su partida;
   * las fechas que quedan sin cubrir salen como pendientes con el importe estimado.
   * Los movimientos reales cuentan aunque la partida ya no exista o esté inactiva.
   */
  private buildLines<E extends string>(
    items: IRecurringItem[],
    movements: { _id: string; recurrente_id?: string; nombre: string; fecha: Date; importe: number }[],
    cycle: Cycle,
    doneState: E,
    pendingState: E
  ): BudgetLine<E>[] {
    const lines: BudgetLine<E>[] = movements.map(m => ({
      recurrente_id: m.recurrente_id,
      nombre: m.nombre,
      fecha: ymd(toCalendarDate(m.fecha)),
      importe: round2(m.importe),
      estado: doneState,
      movimiento_id: m._id
    }));

    for (const item of items.filter(i => i.activo)) {
      const covered = movements.filter(m => m.recurrente_id === idOf(item._id)).length;
      occurrencesInRange(item, cycle).slice(covered).forEach(date => {
        lines.push({ recurrente_id: idOf(item._id), nombre: item.nombre, fecha: ymd(date), importe: round2(item.importe), estado: pendingState });
      });
    }

    return lines.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.nombre.localeCompare(b.nombre));
  }

  /** Tu parte de los gastos del ciclo en tus grupos compartidos (no en otros personales). */
  private async otherGroupsShare(groupId: string, userId: string, cycle: Cycle) {
    const groups = await Group.find({ miembros: userId, _id: { $ne: groupId }, tipo: { $ne: 'personal' } });
    if (groups.length === 0) return { total: 0, grupos: [], expenses: [] };

    const expenses = await Expense.find({
      grupo_id: { $in: groups.map(g => g._id) },
      fecha: { $gte: cycle.inicio, $lt: cycle.fin }
    });

    const grupos = groups
      .map(g => ({
        _id: idOf(g._id),
        nombre: g.nombre,
        total: sum(expenses.filter(e => idOf(e.grupo_id) === idOf(g._id)).map(e => userShareOf(e, userId)))
      }))
      .filter(g => g.total > 0);

    return { total: sum(grupos.map(g => g.total)), grupos, expenses };
  }

  // ---------- Partidas recurrentes ----------

  private validateRecurring(data: Record<string, unknown>, partial: boolean) {
    const clean: Record<string, unknown> = {};
    for (const key of RECURRING_FIELDS) if (data[key] !== undefined) clean[key] = data[key];

    if (!partial) {
      for (const key of ['tipo', 'nombre', 'importe', 'fechaInicio'] as const) {
        if (clean[key] === undefined || clean[key] === '') throw new AppError(`Falta el campo ${key}`, 400);
      }
    }
    if (clean.tipo !== undefined && !['ingreso', 'factura'].includes(clean.tipo as string)) {
      throw new AppError('El tipo debe ser ingreso o factura', 400);
    }
    if (clean.importe !== undefined && !(Number(clean.importe) > 0)) throw new AppError('El importe debe ser mayor a 0', 400);
    if (clean.frecuencia !== undefined && !FRECUENCIAS.includes(clean.frecuencia as any)) {
      throw new AppError(`La frecuencia debe ser una de: ${FRECUENCIAS.join(', ')}`, 400);
    }
    for (const key of ['fechaInicio', 'fechaFin'] as const) {
      if (clean[key] === null && key === 'fechaFin') continue; // null borra la fecha de fin
      if (clean[key] !== undefined) {
        if (Number.isNaN(new Date(clean[key] as string).getTime())) throw new AppError(`Fecha no válida en ${key}`, 400);
        clean[key] = toCalendarDate(clean[key] as string);
      }
    }
    if (clean.importe !== undefined) clean.importe = round2(Number(clean.importe));
    if (clean.categoria !== undefined && !Array.isArray(clean.categoria)) clean.categoria = [clean.categoria];
    return clean;
  }

  async listRecurringItems(groupId: string, userId: string) {
    await this.getBudgetGroup(groupId, userId);
    return RecurringItem.find({ grupo_id: groupId }).sort({ tipo: 1, nombre: 1 });
  }

  async createRecurringItem(groupId: string, userId: string, data: Record<string, unknown>) {
    await this.getBudgetGroup(groupId, userId);
    return RecurringItem.create({ ...this.validateRecurring(data, false), grupo_id: groupId });
  }

  async updateRecurringItem(itemId: string, userId: string, data: Record<string, unknown>) {
    const { item } = await this.getOwnedRecurringItem(itemId, userId);
    const clean = this.validateRecurring(data, true);
    if (clean.fechaFin === null) {
      item.set('fechaFin', undefined);
      delete clean.fechaFin;
    }
    item.set(clean);
    await item.save();
    return item;
  }

  /** Borra la partida; los gastos e ingresos ya confirmados se quedan (son dinero real). */
  async deleteRecurringItem(itemId: string, userId: string) {
    const { item } = await this.getOwnedRecurringItem(itemId, userId);
    await RecurringItem.deleteOne({ _id: item._id });
    return item;
  }

  /**
   * Confirma una partida: para una factura crea el gasto que la paga; para un ingreso,
   * el ingreso cobrado. El importe real puede diferir del estimado (la luz nunca cuesta
   * lo mismo).
   */
  async confirmRecurringItem(
    itemId: string,
    userId: string,
    data: { monto?: number; fecha?: string }
  ): Promise<{ tipo: 'gasto'; data: IExpense } | { tipo: 'ingreso'; data: IIncome }> {
    const { item, group } = await this.getOwnedRecurringItem(itemId, userId);
    const monto = data.monto !== undefined ? Number(data.monto) : item.importe;
    if (!(monto > 0)) throw new AppError('El monto debe ser mayor a 0', 400);
    if (data.fecha !== undefined && Number.isNaN(new Date(data.fecha).getTime())) throw new AppError('Fecha no válida', 400);
    const fecha = data.fecha ? toCalendarDate(data.fecha) : todayIn('Europe/Madrid', this.now());

    if (item.tipo === 'factura') {
      const expense = await Expense.create({
        grupo_id: group._id,
        descripcion: item.nombre,
        monto: round2(monto),
        pagado_por: [userId],
        participantes: [userId],
        fecha,
        asume_gasto: false,
        categoria: item.categoria,
        recurrente_id: item._id
      });
      return { tipo: 'gasto', data: expense };
    }

    const income = await Income.create({
      grupo_id: group._id,
      descripcion: item.nombre,
      monto: round2(monto),
      fecha,
      recurrente_id: item._id,
      creado_por: userId
    });
    return { tipo: 'ingreso', data: income };
  }

  // ---------- Ingresos ----------

  private validateIncome(data: Record<string, unknown>, partial: boolean) {
    const clean: Record<string, unknown> = {};
    for (const key of INCOME_FIELDS) if (data[key] !== undefined) clean[key] = data[key];
    if (!partial) {
      for (const key of INCOME_FIELDS) {
        if (clean[key] === undefined || clean[key] === '') throw new AppError(`Falta el campo ${key}`, 400);
      }
    }
    if (clean.monto !== undefined) {
      if (!(Number(clean.monto) > 0)) throw new AppError('El monto debe ser mayor a 0', 400);
      clean.monto = round2(Number(clean.monto));
    }
    if (clean.fecha !== undefined) {
      if (Number.isNaN(new Date(clean.fecha as string).getTime())) throw new AppError('Fecha no válida', 400);
      clean.fecha = toCalendarDate(clean.fecha as string);
    }
    return clean;
  }

  async listIncomes(groupId: string, userId: string) {
    await this.getBudgetGroup(groupId, userId);
    return Income.find({ grupo_id: groupId }).sort({ fecha: -1 });
  }

  async createIncome(groupId: string, userId: string, data: Record<string, unknown>) {
    await this.getBudgetGroup(groupId, userId);
    return Income.create({ ...this.validateIncome(data, false), grupo_id: groupId, creado_por: userId });
  }

  async updateIncome(incomeId: string, userId: string, data: Record<string, unknown>) {
    const income = await this.getOwnedIncome(incomeId, userId);
    income.set(this.validateIncome(data, true));
    await income.save();
    return income;
  }

  async deleteIncome(incomeId: string, userId: string) {
    const income = await this.getOwnedIncome(incomeId, userId);
    await Income.deleteOne({ _id: income._id });
    return income;
  }
}
