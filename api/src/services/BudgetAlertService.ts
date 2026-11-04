import mongoose from 'mongoose';
import Group, { IGroup } from '../models/Group';
import BudgetAlert from '../models/BudgetAlert';
import { BudgetService, BudgetSummary } from './BudgetService';
import PushService, { PushPayload, formatAmount } from './PushService';

export const UMBRALES = [80, 100] as const;
type Umbral = typeof UMBRALES[number];

interface Concept {
  clave: string;
  porcentaje: number;
  payload: (umbral: Umbral) => PushPayload;
}

const idOf = (value: unknown) => String((value as any)?._id ?? value);
const dias = (n: number) => `${n} ${n === 1 ? 'día' : 'días'}`;
// fin del ciclo excluido: el último día es el anterior
const lastDay = (fin: string) => {
  const date = new Date(`${fin}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', timeZone: 'UTC' });
};

/**
 * Avisos push del presupuesto: cuando lo gastado en el ciclo llega al 80 % o al 100 %
 * del presupuesto, o de un límite de categoría. Cada umbral se avisa una sola vez por
 * ciclo (aunque luego se borre un gasto y se vuelva a cruzar).
 */
export class BudgetAlertService {
  constructor(
    private readonly budget = new BudgetService(),
    private readonly push: Pick<typeof PushService, 'notifyUsers'> = PushService
  ) {}

  /** Tras un cambio en los gastos de `groupId`. Nunca lanza: no debe romper la operación. */
  async checkAfterExpenseChange(groupIds: unknown[]): Promise<void> {
    try {
      const ids = [...new Set(groupIds.map(idOf))].filter(id => mongoose.isValidObjectId(id));
      const groups = await Group.find({ _id: { $in: ids } });
      const budgets = new Map<string, IGroup>();
      for (const group of groups) {
        if (group.tipo === 'personal') {
          budgets.set(idOf(group._id), group);
        } else {
          // Presupuestos personales de los miembros que cuentan su parte de este grupo
          const others = await Group.find({
            tipo: 'personal',
            miembros: { $in: group.miembros },
            'presupuesto.incluirOtrosGrupos': true
          });
          others.forEach(g => budgets.set(idOf(g._id), g));
        }
      }
      for (const group of budgets.values()) await this.checkBudget(group);
    } catch (error) {
      console.error('Error comprobando avisos de presupuesto:', error);
    }
  }

  private async checkBudget(group: IGroup) {
    if (group.presupuesto?.avisos === false) return;
    for (const member of group.miembros) {
      const userId = idOf(member);
      const summary = await this.budget.getSummary(idOf(group._id), userId);
      for (const concept of this.concepts(group, summary)) {
        await this.alertIfNew(group, userId, summary.ciclo.inicio, concept);
      }
    }
  }

  private concepts(group: IGroup, s: BudgetSummary): Concept[] {
    const url = `/group/${idOf(group._id)}`;
    const quedan = s.ciclo.diasRestantes;
    const concepts: Concept[] = [];

    if (s.presupuestoGastable > 0) {
      concepts.push({
        clave: 'total',
        porcentaje: s.gastado / s.presupuestoGastable * 100,
        payload: umbral => umbral === 100
          ? {
            title: `${group.nombre}: has gastado todo el presupuesto`,
            body: s.disponible < 0
              ? `Te pasas ${formatAmount(-s.disponible)} y aún quedan ${dias(quedan)} de ciclo.`
              : `Llevas ${formatAmount(s.gastado)} de ${formatAmount(s.presupuestoGastable)} y aún quedan ${dias(quedan)} de ciclo.`,
            url,
            tag: `budget-${idOf(group._id)}-total`
          }
          : {
            title: `${group.nombre}: llevas el ${Math.floor(s.gastado / s.presupuestoGastable * 100)} % del presupuesto`,
            body: `Te quedan ${formatAmount(s.disponible)} para ${dias(quedan)}` +
              (s.porDia !== null ? ` (unos ${formatAmount(s.porDia)} al día).` : '.'),
            url,
            tag: `budget-${idOf(group._id)}-total`
          }
      });
    }

    for (const limit of s.limitesCategoria) {
      const tag = `budget-${idOf(group._id)}-categoria-${limit.categoria.toLocaleLowerCase('es')}`;
      concepts.push({
        clave: `categoria:${limit.categoria.toLocaleLowerCase('es')}`,
        porcentaje: limit.gastado / limit.limite * 100,
        payload: umbral => umbral === 100
          ? {
            title: `${limit.categoria}: has llegado al límite`,
            body: `Llevas ${formatAmount(limit.gastado)} de ${formatAmount(limit.limite)} este ciclo` +
              (limit.restante < 0 ? ` (te pasas ${formatAmount(-limit.restante)}).` : '.'),
            url,
            tag
          }
          : {
            title: `${limit.categoria}: llevas el ${Math.floor(limit.gastado / limit.limite * 100)} % del límite`,
            body: `Te quedan ${formatAmount(limit.restante)} hasta el ${lastDay(s.ciclo.fin)}.`,
            url,
            tag
          }
      });
    }
    return concepts;
  }

  /** Registra los umbrales alcanzados; avisa solo del más alto que sea nuevo. */
  private async alertIfNew(group: IGroup, userId: string, ciclo: string, concept: Concept) {
    const reached = UMBRALES.filter(u => concept.porcentaje >= u);
    const fresh: Umbral[] = [];
    for (const umbral of reached) {
      try {
        const result = await BudgetAlert.updateOne(
          { grupo_id: group._id, ciclo, clave: concept.clave, umbral },
          { $setOnInsert: { fecha: new Date() } },
          { upsert: true }
        );
        if (result.upsertedCount === 1) fresh.push(umbral);
      } catch (error) {
        // Dos cambios a la vez: el índice único deja pasar solo uno, el otro ya está avisado
        if ((error as { code?: number }).code !== 11000) throw error;
      }
    }
    if (fresh.length === 0) return;
    await this.push.notifyUsers([userId], concept.payload(fresh[fresh.length - 1]));
  }
}

export default new BudgetAlertService();
