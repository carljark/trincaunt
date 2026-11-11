import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BudgetReminderService } from '../../src/services/BudgetReminderService';
import RecurringItem from '../../src/models/RecurringItem';
import BudgetReminder from '../../src/models/BudgetReminder';
import Group from '../../src/models/Group';

vi.mock('../../src/models/RecurringItem', () => ({ default: { find: vi.fn() } }));
vi.mock('../../src/models/BudgetReminder', () => ({ default: { find: vi.fn(), updateOne: vi.fn() } }));
vi.mock('../../src/models/Group', () => ({ default: { find: vi.fn() } }));

const groupId = 'g1';
const userId = 'u1';
const plain = (text: string) => text.replace(/\s/g, ' ');

const line = (recurrente_id: string, nombre: string, fecha: string, importe: number, extra: object = {}) =>
  ({ recurrente_id, nombre, fecha, importe, estado: 'pendiente', ...extra });

// Ciclo actual 28-oct a 28-nov y el siguiente; las facturas de cada uno
const summaries = (overrides: { current?: object[]; next?: object[]; reservas?: object } = {}) => [
  {
    ciclo: { inicio: '2026-10-28', fin: '2026-11-28' },
    facturas: { lineas: overrides.current ?? [] },
    reservas: overrides.reservas ?? { total: 0, lineas: [] }
  },
  {
    ciclo: { inicio: '2026-11-28', fin: '2026-12-28' },
    facturas: { lineas: overrides.next ?? [] },
    reservas: { total: 0, lineas: [] }
  }
];

const setup = (now: string, data = summaries()) => {
  const budget = { getSummary: vi.fn(async (_g: string, _u: string, offset: number) => data[offset]) };
  const push = { notifyUsers: vi.fn() };
  const service = new BudgetReminderService(budget as any, push as any, () => new Date(now));
  return { service, budget, push };
};

const extra = { _id: 'extra', nombre: 'Extra préstamo', aviso: 'Pide la amortización anticipada' };

describe('BudgetReminderService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (RecurringItem.find as any).mockResolvedValue([extra]);
    (BudgetReminder.find as any).mockResolvedValue([]);
  });

  it('reminds a manual payment from 3 days before until it is paid', async () => {
    const data = summaries({ next: [line('extra', 'Extra préstamo', '2026-12-01', 630)] });
    expect(await setup('2026-11-27T10:00:00Z', data).service.list(groupId, userId)).toEqual([]);

    const [reminder] = await setup('2026-11-28T10:00:00Z', data).service.list(groupId, userId);
    expect(reminder).toMatchObject({ clave: 'partida:extra:2026-12-01', tipo: 'partida', titulo: 'Pide la amortización anticipada', importe: 630 });
    expect(plain(reminder.detalle)).toBe('Extra préstamo · 630,00 € · 1 dic');

    const paid = summaries({ next: [line('extra', 'Extra préstamo', '2026-12-01', 630, { estado: 'pagada' })] });
    expect(await setup('2026-11-30T10:00:00Z', paid).service.list(groupId, userId)).toEqual([]);
  });

  it('uses the days set on the item and hides what was marked as done', async () => {
    (RecurringItem.find as any).mockResolvedValue([{ ...extra, avisoDiasAntes: 7 }]);
    const data = summaries({ next: [line('extra', 'Extra préstamo', '2026-12-01', 630)] });
    expect(await setup('2026-11-24T10:00:00Z', data).service.list(groupId, userId)).toHaveLength(1);

    (BudgetReminder.find as any).mockResolvedValue([{ clave: 'partida:extra:2026-12-01' }]);
    expect(await setup('2026-11-24T10:00:00Z', data).service.list(groupId, userId)).toEqual([]);
  });

  it('reminds what a special payment asks for, only on its dates', async () => {
    const visa = {
      _id: 'visa', nombre: 'Visa',
      pagosEspeciales: [{ tipo: 'cuota', desde: new Date('2026-12-01T00:00:00Z'), hasta: new Date('2026-12-01T00:00:00Z'), importe: 110, aviso: 'Pon la cuota a 110 €', avisoDiasAntes: 7 }]
    };
    (RecurringItem.find as any).mockResolvedValue([visa]);
    const data = summaries({
      current: [line('visa', 'Visa', '2026-11-01', 43)],
      next: [line('visa', 'Visa', '2026-12-01', 110), line('visa', 'Visa', '2026-12-15', 43)]
    });
    const reminders = await setup('2026-11-25T10:00:00Z', data).service.list(groupId, userId);
    expect(reminders.map(r => [r.clave, r.titulo])).toEqual([['partida:visa:2026-12-01', 'Pon la cuota a 110 €']]);
  });

  it('says how much of a payment is extra', async () => {
    const data = summaries({ next: [line('extra', 'Préstamo', '2026-12-01', 559.26, { extra: 466.89 })] });
    const [reminder] = await setup('2026-11-30T10:00:00Z', data).service.list(groupId, userId);
    expect(plain(reminder.detalle)).toBe('Extra préstamo · 559,26 € (466,89 € extra) · 1 dic');
  });

  it('says what to move into and out of the bank sinking fund', async () => {
    (RecurringItem.find as any).mockResolvedValue([]);
    const data = summaries({
      reservas: { total: 127.04, lineas: [{ nombre: 'IVA', cuota: 73.71 }, { nombre: 'Basura', cuota: 53.33 }, { nombre: 'Seguro', cuota: 0 }] },
      current: [line('iva', 'IVA', '2026-11-20', 86, { deHucha: 86 })]
    });
    const reminders = await setup('2026-11-17T10:00:00Z', data).service.list(groupId, userId);
    expect(reminders.map(r => [r.clave, plain(r.titulo), plain(r.detalle)])).toEqual([
      ['hucha:2026-10-28', 'Pasa 127,04 € a la hucha del banco', 'IVA 73,71 € · Basura 53,33 €'],
      ['sacar:iva:2026-11-20', 'Saca 86,00 € de la hucha del banco', 'Para pagar IVA el 20 nov']
    ]);
  });

  it('only marks as done a reminder that exists', async () => {
    const { service } = setup('2026-11-28T10:00:00Z', summaries({ next: [line('extra', 'Extra préstamo', '2026-12-01', 630)] }));
    await service.markDone(groupId, userId, 'partida:extra:2026-12-01');
    expect(BudgetReminder.updateOne).toHaveBeenCalledWith(
      { grupo_id: groupId, clave: 'partida:extra:2026-12-01' }, { $set: { hecho: expect.any(Date) } }, { upsert: true });
    await expect(service.markDone(groupId, userId, 'partida:otra:2026-12-01')).rejects.toMatchObject({ statusCode: 404 });
  });

  describe('push', () => {
    const data = summaries({ next: [line('extra', 'Extra préstamo', '2026-12-01', 630), line('extra', 'Extra préstamo', '2026-12-01', 630)] });

    beforeEach(() => {
      (Group.find as any).mockResolvedValue([{ _id: groupId, nombre: 'Gastos', miembros: [userId], presupuesto: {} }]);
    });

    it('sends each reminder once, during the day', async () => {
      (RecurringItem.find as any).mockResolvedValue([extra]);
      const one = summaries({ next: [line('extra', 'Extra préstamo', '2026-12-01', 630)] });

      const night = setup('2026-11-28T03:00:00Z', one); // 4:00 en Madrid
      await night.service.notifyDue();
      expect(night.push.notifyUsers).not.toHaveBeenCalled();

      (BudgetReminder.updateOne as any).mockResolvedValueOnce({ upsertedCount: 1, modifiedCount: 0 });
      const day = setup('2026-11-28T10:00:00Z', one);
      await day.service.notifyDue();
      expect(day.push.notifyUsers).toHaveBeenCalledWith([userId], expect.objectContaining({
        title: 'Pide la amortización anticipada', url: `/group/${groupId}`
      }));

      // Ya avisado: el índice único hace fallar el upsert
      (BudgetReminder.updateOne as any).mockRejectedValueOnce(Object.assign(new Error('dup'), { code: 11000 }));
      const again = setup('2026-11-28T11:00:00Z', one);
      await again.service.notifyDue();
      expect(again.push.notifyUsers).not.toHaveBeenCalled();
    });

    it('groups several new reminders in one push and skips budgets with alerts off', async () => {
      (BudgetReminder.updateOne as any).mockResolvedValue({ upsertedCount: 1, modifiedCount: 0 });
      const both = summaries({
        next: [line('extra', 'Extra préstamo', '2026-12-01', 630)],
        reservas: { total: 50, lineas: [{ nombre: 'Seguro', cuota: 50 }] }
      });
      const { service, push } = setup('2026-11-28T10:00:00Z', both);
      await service.notifyDue();
      expect(push.notifyUsers).toHaveBeenCalledWith([userId], expect.objectContaining({ title: 'Tienes 2 cosas por hacer en el banco' }));

      (Group.find as any).mockResolvedValue([{ _id: groupId, nombre: 'Gastos', miembros: [userId], presupuesto: { avisos: false } }]);
      const off = setup('2026-11-28T10:00:00Z', data);
      await off.service.notifyDue();
      expect(off.push.notifyUsers).not.toHaveBeenCalled();
    });
  });
});
