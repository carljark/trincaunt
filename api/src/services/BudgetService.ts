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
  cycleAt,
  cycleContaining,
  cycleIndex,
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
  deHucha?: number;       // Parte de la factura que se paga con lo apartado (factura prorrateada)
}

/** Hucha de una factura prorrateada en un ciclo. */
export interface ReserveLine {
  recurrente_id: string;
  nombre: string;
  cuota: number;  // lo que se aparta en este ciclo
  saldo: number;  // lo que hay en la hucha al acabar el ciclo, ya descontados sus pagos
  // Siguiente pago aún sin hacer (puede ser de este ciclo) y cuánto de él cubre ya la hucha
  proximoPago: { fecha: string; importe: number; cubierto: number } | null;
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
  // Importes netos: sin la parte que se paga con las huchas (deHucha)
  facturas: { pagadas: number; pendientes: number; total: number; deHucha: number; lineas: BudgetLine<BillEstado>[] };
  reservas: { total: number; lineas: ReserveLine[] };
  ahorroObjetivo: number;
  gastosVariables: number;
  otrosGrupos: { total: number; grupos: { _id: string; nombre: string; total: number }[] } | null;
  presupuestoGastable: number; // ingresos - facturas - reservas - ahorro
  gastado: number;             // gastos variables + otros grupos
  disponible: number;          // presupuestoGastable - gastado
  porDia: number | null;
  porSemana: number | null;
  ritmo: { gastoIdeal: number; desviacion: number } | null; // desviacion > 0: vas por encima
  limitesCategoria: CategoryLimitStatus[];
}

export interface CycleHistoryEntry {
  inicio: string;
  fin: string; // excluido
  offset: number;
  enCurso: boolean;
  ingresos: number;        // cobrados
  facturas: number;        // pagadas (tu parte)
  gastosVariables: number;
  otrosGrupos: number;     // 0 si no se cuentan
  gastado: number;         // facturas + variables + otros grupos
  sobrante: number;        // ingresos - gastado (negativo: te pasaste)
}

export interface BudgetHistory {
  ahorroObjetivo: number;
  ciclos: CycleHistoryEntry[];      // del más antiguo al actual
  mediaSobrante: number | null;     // de los ciclos terminados
}

export const MAX_CICLOS_HISTORICO = 12;

export interface ForecastBill {
  recurrente_id: string;
  nombre: string;
  fecha: string;
  importe: number;
  estado: BillEstado;
  ultima: boolean; // no vuelve a tocar después de este ciclo
}

export interface CycleForecastEntry {
  inicio: string;
  fin: string; // excluido
  offset: number;
  enCurso: boolean;
  ingresos: number;            // cobrados + previstos
  facturas: number;            // pagadas + pendientes, sin lo que sale de las huchas
  reservas: number;            // lo que se aparta en las huchas
  presupuestoGastable: number; // ingresos - facturas - reservas - ahorro
  gastado: number;             // lo que ya llevas (casi siempre 0 en ciclos futuros)
  disponible: number;          // presupuestoGastable - gastado
  temporales: ForecastBill[];  // facturas con fecha de fin (préstamos, aplazamientos...)
}

export interface BudgetForecast {
  ahorroObjetivo: number;
  ciclos: CycleForecastEntry[]; // del actual en adelante
}

// El actual y los 12 siguientes: un año vista
export const MAX_CICLOS_PREVISION = 25;

const normalize = (value: string) => value.trim().toLocaleLowerCase('es');

const RECURRING_FIELDS = ['tipo', 'nombre', 'importe', 'frecuencia', 'fechaInicio', 'fechaFin', 'categoria', 'activo', 'prorratear', 'prorrateoDesde', 'aviso', 'avisoDiasAntes'] as const;
const INCOME_FIELDS = ['descripcion', 'monto', 'fecha'] as const;

const ymd = (date: Date) => date.toISOString().slice(0, 10);

/** Lo que pesa una factura en el ciclo: su importe menos lo que sale de la hucha. */
const netOf = (line: BudgetLine<BillEstado>) => round2(line.importe - (line.deHucha ?? 0));

/**
 * Se puede prorratear una factura no mensual (se reparte cada pago entre los ciclos hasta él)
 * o una mensual con fecha de fin, como un aplazamiento en cuotas (se reparte lo que queda del
 * plan entre los ciclos hasta la última cuota). Una mensual sin fin ya cae igual cada ciclo.
 */
export const canProrate = (item: { tipo?: unknown; frecuencia?: unknown; fechaFin?: unknown }) =>
  item.tipo === 'factura' && ((item.frecuencia ?? 'mensual') !== 'mensual' || !!item.fechaFin);

const PRORRATEO_ERROR = 'Solo se pueden prorratear facturas que no sean mensuales o mensuales con fecha de fin';

/** Una factura se prorratea si lo pide, está activa y se puede prorratear. */
export const isProrated = (item: Pick<IRecurringItem, 'tipo' | 'frecuencia' | 'fechaFin' | 'activo' | 'prorratear' | 'prorrateoDesde'>) =>
  item.activo && !!item.prorratear && !!item.prorrateoDesde && canProrate(item);

type Movement = { _id: string; recurrente_id?: string; nombre: string; fecha: Date; importe: number };

/** Gastos que pagan una factura fija, con tu parte como importe. */
const billMovements = (expenses: IExpense[], userId: string): Movement[] =>
  expenses.filter(e => e.recurrente_id).map(e => ({
    _id: idOf(e._id), recurrente_id: idOf(e.recurrente_id), nombre: e.descripcion, fecha: e.fecha, importe: userShareOf(e, userId)
  }));
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

    const facturas = this.buildLines(items.filter(i => i.tipo === 'factura'), billMovements(expenses, userId), cycle, 'pagada', 'pendiente');
    const reservas = await this.applySinkingFunds(items, facturas, userId, config.diaInicioCiclo, cycle);

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
    const facturasTotal = sum(facturas.map(netOf));
    const reservasTotal = sum(reservas.map(r => r.cuota));
    const presupuestoGastable = round2(ingresosTotal - facturasTotal - reservasTotal - config.ahorroObjetivo);
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
        pagadas: sum(facturas.filter(l => l.estado === 'pagada').map(netOf)),
        pendientes: sum(facturas.filter(l => l.estado === 'pendiente').map(netOf)),
        total: facturasTotal,
        deHucha: sum(facturas.map(l => l.deHucha ?? 0)),
        lineas: facturas
      },
      reservas: { total: reservasTotal, lineas: reservas },
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
   * Los últimos `ciclos` ciclos (el actual incluido) con lo que pasó de verdad: lo cobrado,
   * las facturas pagadas y lo gastado. Lo previsto sin confirmar no cuenta. Se quitan los
   * ciclos iniciales sin ningún movimiento (antes de empezar a usar el presupuesto).
   */
  async getHistory(groupId: string, userId: string, ciclos = 6): Promise<BudgetHistory> {
    if (!Number.isInteger(ciclos) || ciclos < 1 || ciclos > MAX_CICLOS_HISTORICO) {
      throw new AppError(`El histórico admite de 1 a ${MAX_CICLOS_HISTORICO} ciclos`, 400);
    }
    const group = await this.getBudgetGroup(groupId, userId);
    const config: IGroupPresupuesto = { ...PRESUPUESTO_POR_DEFECTO, ...(group.presupuesto ? JSON.parse(JSON.stringify(group.presupuesto)) : {}) };

    const today = todayIn('Europe/Madrid', this.now());
    const cycles = Array.from({ length: ciclos }, (_, i) => cycleContaining(today, config.diaInicioCiclo, i - ciclos + 1));
    const range = { $gte: cycles[0].inicio, $lt: cycles[cycles.length - 1].fin };

    const otherGroups = config.incluirOtrosGrupos
      ? await Group.find({ miembros: userId, _id: { $ne: groupId }, tipo: { $ne: 'personal' } })
      : [];
    const [expenses, incomes, otherExpenses] = await Promise.all([
      Expense.find({ grupo_id: groupId, fecha: range }),
      Income.find({ grupo_id: groupId, fecha: range }),
      otherGroups.length ? Expense.find({ grupo_id: { $in: otherGroups.map(g => g._id) }, fecha: range }) : Promise.resolve([] as IExpense[])
    ]);

    const entries = cycles.map((cycle, i): CycleHistoryEntry & { vacio: boolean } => {
      const mine = expenses.filter(e => inCycle(e.fecha, cycle));
      const others = otherExpenses.filter(e => inCycle(e.fecha, cycle));
      const cobrado = incomes.filter(e => inCycle(e.fecha, cycle));
      const facturas = sum(mine.filter(e => e.recurrente_id).map(e => userShareOf(e, userId)));
      const gastosVariables = sum(mine.filter(e => !e.recurrente_id).map(e => userShareOf(e, userId)));
      const otrosGrupos = sum(others.map(e => userShareOf(e, userId)));
      const ingresos = sum(cobrado.map(e => e.monto));
      const gastado = round2(facturas + gastosVariables + otrosGrupos);
      return {
        inicio: ymd(cycle.inicio),
        fin: ymd(cycle.fin),
        offset: i - ciclos + 1,
        enCurso: inCycle(today, cycle),
        ingresos,
        facturas,
        gastosVariables,
        otrosGrupos,
        gastado,
        sobrante: round2(ingresos - gastado),
        vacio: mine.length === 0 && cobrado.length === 0 && others.length === 0
      };
    });

    const first = entries.findIndex(e => !e.vacio || e.enCurso);
    const visible = entries.slice(first).map(({ vacio, ...entry }) => entry);
    const terminados = visible.filter(e => !e.enCurso);
    return {
      ahorroObjetivo: config.ahorroObjetivo,
      ciclos: visible,
      mediaSobrante: terminados.length ? round2(sum(terminados.map(e => e.sobrante)) / terminados.length) : null
    };
  }

  /**
   * El ciclo actual y los `ciclos - 1` siguientes con lo que toca según las partidas fijas:
   * cuánto te quedará para gastar en cada uno. Es el mismo cálculo que el resumen de cada
   * ciclo. Las facturas con fecha de fin se listan aparte para ver cuándo se acaban.
   */
  async getForecast(groupId: string, userId: string, ciclos = 6): Promise<BudgetForecast> {
    if (!Number.isInteger(ciclos) || ciclos < 1 || ciclos > MAX_CICLOS_PREVISION) {
      throw new AppError(`La previsión admite de 1 a ${MAX_CICLOS_PREVISION} ciclos`, 400);
    }
    await this.getBudgetGroup(groupId, userId);
    const [items, summaries] = await Promise.all([
      RecurringItem.find({ grupo_id: groupId, tipo: 'factura', fechaFin: { $ne: null } }),
      Promise.all(Array.from({ length: ciclos }, (_, offset) => this.getSummary(groupId, userId, offset)))
    ]);
    const temporales = new Map(items.filter(i => i.fechaFin).map(i => [idOf(i._id), i]));

    return {
      ahorroObjetivo: summaries[0].ahorroObjetivo,
      ciclos: summaries.map(s => {
        const cycleEnd = toCalendarDate(s.ciclo.fin);
        return {
          inicio: s.ciclo.inicio,
          fin: s.ciclo.fin,
          offset: s.ciclo.offset,
          enCurso: s.ciclo.offset === 0,
          ingresos: s.ingresos.total,
          facturas: s.facturas.total,
          reservas: s.reservas.total,
          presupuestoGastable: s.presupuestoGastable,
          gastado: s.gastado,
          disponible: s.disponible,
          temporales: s.facturas.lineas.flatMap(l => {
            const item = l.recurrente_id ? temporales.get(l.recurrente_id) : undefined;
            if (!item) return [];
            const afterEnd = new Date(toCalendarDate(item.fechaFin!).getTime() + 24 * 60 * 60 * 1000);
            const ultima = afterEnd <= cycleEnd || occurrencesInRange(item, { inicio: cycleEnd, fin: afterEnd }).length === 0;
            return [{ recurrente_id: idOf(item._id), nombre: l.nombre, fecha: l.fecha, importe: l.importe, estado: l.estado, ultima }];
          })
        };
      })
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
   * Huchas de las facturas prorrateadas en `cycle`: marca en cada línea de factura cuánto se
   * paga con lo apartado (deHucha) y devuelve lo que se aparta este ciclo en cada hucha.
   */
  private async applySinkingFunds(
    items: IRecurringItem[],
    facturas: BudgetLine<BillEstado>[],
    userId: string,
    diaInicio: number,
    cycle: Cycle
  ): Promise<ReserveLine[]> {
    const prorated = items.filter(isProrated);
    if (!prorated.length) return [];

    const desde = new Date(Math.min(...prorated.map(i => cycleContaining(i.prorrateoDesde!, diaInicio).inicio.getTime())));
    if (desde >= cycle.fin) return [];
    const expenses = await Expense.find({
      recurrente_id: { $in: prorated.map(i => i._id) },
      fecha: { $gte: desde, $lt: cycle.fin }
    });
    const movements = billMovements(expenses, userId);

    return prorated.flatMap(item => {
      const fund = this.sinkingFund(item, movements, diaInicio, cycle);
      if (!fund) return [];
      facturas
        .filter(l => l.recurrente_id === idOf(item._id))
        .forEach((line, i) => { if (fund.cubiertos[i]) line.deHucha = fund.cubiertos[i]; });
      // Plan terminado y hucha vacía: ya no hay nada que enseñar
      if (!fund.proximoPago && !fund.cuota && !fund.saldo) return [];
      return [{ recurrente_id: idOf(item._id), nombre: item.nombre, cuota: fund.cuota, saldo: fund.saldo, proximoPago: fund.proximoPago }];
    });
  }

  /**
   * Recorre la hucha de una factura desde el ciclo en que se activó el prorrateo hasta
   * `target`. En cada ciclo aparta lo que falta para el próximo pago (importe estimado
   * menos lo que ya hay) repartido entre los ciclos que quedan hasta él, incluido el del
   * pago; así, si se activa tarde, se pone al día, y si un pago real sale más barato, lo
   * que sobra rebaja las cuotas siguientes. Los pagos (reales o, si no, el estimado) salen
   * de la hucha hasta donde llegue; el resto pesa en su ciclo como una factura normal.
   *
   * Una mensual con fecha de fin (cuotas de un aplazamiento) no mira solo el próximo pago:
   * reparte lo que queda del plan entre los ciclos hasta la última cuota, así que desde que
   * se activa aparta lo mismo cada ciclo y cada cuota sale entera de la hucha.
   */
  private sinkingFund(item: IRecurringItem, movements: Movement[], diaInicio: number, target: Cycle) {
    const first = cycleIndex(item.prorrateoDesde!, diaInicio);
    const last = cycleIndex(target.inicio, diaInicio);
    if (last < first) return null;

    const own = movements.filter(m => m.recurrente_id === idOf(item._id));
    const plan = item.frecuencia === 'mensual';
    // Hasta un año después del objetivo (el paso más largo es anual) o, en un plan, hasta su fin
    const horizon = plan && item.fechaFin ? Math.max(last + 13, cycleIndex(item.fechaFin, diaInicio) + 1) : last + 13;
    const dates = occurrencesInRange(item, { inicio: cycleAt(first, diaInicio).inicio, fin: cycleAt(horizon, diaInicio).inicio });
    const dateCycles = dates.map(d => cycleIndex(d, diaInicio));

    let saldo = 0;
    let cuota = 0;
    let lines: BudgetLine<BillEstado>[] = [];
    let cubiertos: number[] = [];
    for (let k = first; k <= last; k++) {
      const cycle = cycleAt(k, diaInicio);
      const next = dateCycles.findIndex(c => c >= k);
      if (next === -1) cuota = 0;
      else if (plan) {
        const pendientes = dateCycles.length - next;
        cuota = Math.max(0, round2((item.importe * pendientes - saldo) / (dateCycles[dateCycles.length - 1] - k + 1)));
      } else cuota = Math.max(0, round2((item.importe - saldo) / (dateCycles[next] - k + 1)));
      saldo = round2(saldo + cuota);
      lines = this.buildLines([item], own.filter(m => inCycle(m.fecha, cycle)), cycle, 'pagada', 'pendiente');
      cubiertos = lines.map(line => {
        const covered = round2(Math.min(saldo, line.importe));
        saldo = round2(saldo - covered);
        return covered;
      });
    }

    const pending = lines.findIndex(l => l.estado === 'pendiente');
    const after = dates.find((_, i) => dateCycles[i] > last);
    const proximoPago = pending !== -1
      ? { fecha: lines[pending].fecha, importe: lines[pending].importe, cubierto: cubiertos[pending] }
      : after ? { fecha: ymd(after), importe: round2(item.importe), cubierto: Math.min(saldo, round2(item.importe)) } : null;
    return { cuota, saldo, cubiertos, proximoPago };
  }

  /**
   * Mezcla lo que toca en el ciclo según las partidas activas con los movimientos
   * reales enlazados. Cada movimiento real "cubre" una fecha prevista de su partida;
   * las fechas que quedan sin cubrir salen como pendientes con el importe estimado.
   * Los movimientos reales cuentan aunque la partida ya no exista o esté inactiva.
   */
  private buildLines<E extends string>(
    items: IRecurringItem[],
    movements: Movement[],
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
    for (const key of ['fechaInicio', 'fechaFin', 'prorrateoDesde'] as const) {
      if (clean[key] === null && key !== 'fechaInicio') continue; // null borra la fecha de fin, o la de la hucha (empieza hoy)
      if (clean[key] !== undefined) {
        if (Number.isNaN(new Date(clean[key] as string).getTime())) throw new AppError(`Fecha no válida en ${key}`, 400);
        clean[key] = toCalendarDate(clean[key] as string);
      }
    }
    if (clean.importe !== undefined) clean.importe = round2(Number(clean.importe));
    if (clean.categoria !== undefined && !Array.isArray(clean.categoria)) clean.categoria = [clean.categoria];
    if (clean.prorratear !== undefined) clean.prorratear = clean.prorratear === true || clean.prorratear === 'true';
    if (clean.aviso !== undefined) {
      clean.aviso = typeof clean.aviso === 'string' ? clean.aviso.trim() : ''; // vacío o null lo quita
      if ((clean.aviso as string).length > 200) throw new AppError('El recordatorio no puede pasar de 200 caracteres', 400);
    }
    if (clean.avisoDiasAntes !== undefined) {
      const dias = Number(clean.avisoDiasAntes);
      if (!Number.isInteger(dias) || dias < 0 || dias > 31) throw new AppError('Los días de antelación deben estar entre 0 y 31', 400);
      clean.avisoDiasAntes = dias;
    }
    return clean;
  }

  /**
   * Prorratear solo vale para facturas no mensuales o mensuales con fecha de fin (ver
   * canProrate). Al activarlo, la hucha empieza en el ciclo de hoy o en la fecha que se
   * pida (prorrateoDesde), que no puede ser pasada: no se puede haber apartado antes de
   * hoy. Sin cambios, se queda la fecha que tenía; al quitarlo se olvida.
   */
  private prorrateoStart(
    item: { tipo?: unknown; frecuencia?: unknown; fechaFin?: unknown; prorratear?: unknown; prorrateoDesde?: Date },
    wasProrated: boolean,
    requested?: Date | null
  ): Date | undefined {
    if (item.prorratear && !canProrate(item)) throw new AppError(PRORRATEO_ERROR, 400);
    if (!item.prorratear) return undefined;
    const today = todayIn('Europe/Madrid', this.now());
    const current = wasProrated ? item.prorrateoDesde : undefined;
    if (requested && requested.getTime() !== current?.getTime()) {
      if (requested < today) throw new AppError('La hucha no puede empezar antes de hoy', 400);
      return requested;
    }
    return requested === null || !current ? today : current;
  }

  async listRecurringItems(groupId: string, userId: string) {
    await this.getBudgetGroup(groupId, userId);
    return RecurringItem.find({ grupo_id: groupId }).sort({ tipo: 1, nombre: 1 });
  }

  async createRecurringItem(groupId: string, userId: string, data: Record<string, unknown>) {
    await this.getBudgetGroup(groupId, userId);
    const { prorrateoDesde, ...clean } = this.validateRecurring(data, false);
    if (clean.aviso === '') delete clean.aviso;
    const desde = this.prorrateoStart(clean, false, prorrateoDesde as Date | null | undefined);
    return RecurringItem.create({ ...clean, ...(desde && { prorrateoDesde: desde }), grupo_id: groupId });
  }

  async updateRecurringItem(itemId: string, userId: string, data: Record<string, unknown>) {
    const { item } = await this.getOwnedRecurringItem(itemId, userId);
    const clean = this.validateRecurring(data, true);
    if (clean.fechaFin === null) {
      item.set('fechaFin', undefined);
      delete clean.fechaFin;
    }
    if (clean.aviso === '') {
      item.set('aviso', undefined);
      delete clean.aviso;
    }
    const wasProrated = !!item.prorratear;
    const { prorrateoDesde, ...rest } = clean;
    item.set(rest);
    item.set('prorrateoDesde', this.prorrateoStart(item, wasProrated, prorrateoDesde as Date | null | undefined));
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
