import Group from '../models/Group';
import RecurringItem from '../models/RecurringItem';
import BudgetReminder from '../models/BudgetReminder';
import { AppError } from '../utils/AppError';
import { todayIn } from '../utils/budgetCycle';
import { BudgetService, BudgetSummary } from './BudgetService';
import PushService, { formatAmount } from './PushService';

export const AVISO_DIAS_ANTES = 3;
// Los push solo salen de día (hora de España)
const PUSH_DESDE = 9;
const PUSH_HASTA = 22;

export interface BudgetReminderItem {
  clave: string;
  tipo: 'partida' | 'hucha';
  titulo: string;
  detalle: string;
  fecha: string; // YYYY-MM-DD: cuándo toca
  importe: number;
  recurrente_id?: string;
}

const idOf = (value: unknown) => String((value as any)?._id ?? value);
const ymd = (date: Date) => date.toISOString().slice(0, 10);
const addDays = (day: string, days: number) => {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return ymd(date);
};
const shortDate = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', timeZone: 'UTC' }).replace('.', '');

/**
 * Lo que hay que hacer a mano en el banco y la app no puede hacer sola:
 * - Las partidas con `aviso` (pedir una amortización anticipada, cambiar la cuota de la
 *   tarjeta) se recuerdan desde `avisoDiasAntes` días antes de cada fecha hasta que se
 *   confirma el pago o se marcan como hechas.
 * - Al empezar el ciclo, cuánto pasar a la hucha del banco (lo que apartan las huchas) y,
 *   unos días antes de cada factura que se paga con la hucha, cuánto sacar de ella.
 * Cada recordatorio se avisa una vez por push, de día.
 */
export class BudgetReminderService {
  constructor(
    private readonly budget = new BudgetService(),
    private readonly push: Pick<typeof PushService, 'notifyUsers'> = PushService,
    private readonly now: () => Date = () => new Date()
  ) {}

  /** Recordatorios pendientes (sin marcar como hechos) del grupo personal. */
  async list(groupId: string, userId: string): Promise<BudgetReminderItem[]> {
    const reminders = await this.compute(groupId, userId);
    if (!reminders.length) return [];
    const hechos = await BudgetReminder.find({ grupo_id: groupId, clave: { $in: reminders.map(r => r.clave) }, hecho: { $ne: null } });
    const done = new Set(hechos.map(h => h.clave));
    return reminders.filter(r => !done.has(r.clave));
  }

  async markDone(groupId: string, userId: string, clave: string): Promise<void> {
    const reminders = await this.compute(groupId, userId);
    if (!reminders.some(r => r.clave === clave)) throw new AppError('Recordatorio no encontrado', 404);
    await BudgetReminder.updateOne({ grupo_id: groupId, clave }, { $set: { hecho: this.now() } }, { upsert: true });
  }

  /** Manda por push los recordatorios nuevos de todos los presupuestos. Nunca lanza. */
  async notifyDue(): Promise<void> {
    try {
      const hour = Number(this.now().toLocaleString('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Europe/Madrid' }));
      if (hour < PUSH_DESDE || hour >= PUSH_HASTA) return;
      const groups = await Group.find({ tipo: 'personal' });
      for (const group of groups) {
        if (group.presupuesto?.avisos === false) continue;
        for (const member of group.miembros) {
          await this.notifyMember(idOf(group._id), idOf(member)).catch(error =>
            console.error('Error mandando recordatorios del presupuesto:', error));
        }
      }
    } catch (error) {
      console.error('Error mandando recordatorios del presupuesto:', error);
    }
  }

  private async notifyMember(groupId: string, userId: string) {
    const fresh: BudgetReminderItem[] = [];
    for (const reminder of await this.list(groupId, userId)) {
      try {
        // Solo el primero que lo marca como avisado lo manda (índice único por grupo y clave)
        const result = await BudgetReminder.updateOne(
          { grupo_id: groupId, clave: reminder.clave, avisado: null },
          { $set: { avisado: this.now() } },
          { upsert: true }
        );
        if (result.upsertedCount === 1 || result.modifiedCount === 1) fresh.push(reminder);
      } catch (error) {
        if ((error as { code?: number }).code !== 11000) throw error;
      }
    }
    if (!fresh.length) return;
    const [first] = fresh;
    await this.push.notifyUsers([userId], fresh.length === 1
      ? { title: first.titulo, body: first.detalle, url: `/group/${groupId}`, tag: `reminder-${groupId}` }
      : {
        title: `Tienes ${fresh.length} cosas por hacer en el banco`,
        body: fresh.map(r => r.titulo).join(' · '),
        url: `/group/${groupId}`,
        tag: `reminder-${groupId}`
      });
  }

  private async compute(groupId: string, userId: string): Promise<BudgetReminderItem[]> {
    // El ciclo actual y el siguiente: un aviso puede empezar días antes de que empiece su ciclo
    const current = await this.budget.getSummary(groupId, userId, 0);
    const next = await this.budget.getSummary(groupId, userId, 1);
    const today = ymd(todayIn('Europe/Madrid', this.now()));
    const items = await RecurringItem.find({ grupo_id: groupId, aviso: { $nin: [null, ''] } });

    const reminders: BudgetReminderItem[] = [...this.huchaReminders(current, today)];
    const lines = [...current.facturas.lineas, ...next.facturas.lineas];
    for (const item of items) {
      const dias = item.avisoDiasAntes ?? AVISO_DIAS_ANTES;
      for (const line of lines) {
        if (line.recurrente_id !== idOf(item._id) || line.estado !== 'pendiente') continue;
        if (today < addDays(line.fecha, -dias)) continue;
        reminders.push({
          clave: `partida:${idOf(item._id)}:${line.fecha}`,
          tipo: 'partida',
          titulo: item.aviso!,
          detalle: `${item.nombre} · ${formatAmount(line.importe)} · ${shortDate(line.fecha)}`,
          fecha: line.fecha,
          importe: line.importe,
          recurrente_id: idOf(item._id)
        });
      }
    }
    return reminders.sort((a, b) => a.fecha.localeCompare(b.fecha));
  }

  private huchaReminders(s: BudgetSummary, today: string): BudgetReminderItem[] {
    const reminders: BudgetReminderItem[] = [];
    const cuotas = s.reservas.lineas.filter(l => l.cuota > 0);
    if (s.reservas.total > 0 && cuotas.length) {
      reminders.push({
        clave: `hucha:${s.ciclo.inicio}`,
        tipo: 'hucha',
        titulo: `Pasa ${formatAmount(s.reservas.total)} a la hucha del banco`,
        detalle: cuotas.map(l => `${l.nombre} ${formatAmount(l.cuota)}`).join(' · '),
        fecha: s.ciclo.inicio,
        importe: s.reservas.total
      });
    }
    for (const line of s.facturas.lineas) {
      if (!line.deHucha || !line.recurrente_id || today < addDays(line.fecha, -AVISO_DIAS_ANTES)) continue;
      reminders.push({
        clave: `sacar:${line.recurrente_id}:${line.fecha}`,
        tipo: 'hucha',
        titulo: `Saca ${formatAmount(line.deHucha)} de la hucha del banco`,
        detalle: `Para pagar ${line.nombre} el ${shortDate(line.fecha)}`,
        fecha: line.fecha,
        importe: line.deHucha,
        recurrente_id: line.recurrente_id
      });
    }
    return reminders;
  }
}

export default new BudgetReminderService();
