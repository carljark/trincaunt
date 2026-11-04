import mongoose from 'mongoose';
import { BudgetAlertService } from '../../src/services/BudgetAlertService';
import Group from '../../src/models/Group';
import BudgetAlert from '../../src/models/BudgetAlert';

vi.mock('../../src/models/Group');
vi.mock('../../src/models/BudgetAlert');
vi.mock('../../src/services/PushService', () => ({
  default: { notifyUsers: vi.fn() },
  formatAmount: (n: number) => `${n.toFixed(2).replace('.', ',')} €`
}));

const oid = () => new mongoose.Types.ObjectId();
const me = oid();
const personalId = oid();
const sharedId = oid();

const personal = (presupuesto: object = {}) => ({
  _id: personalId, nombre: 'Mis gastos', tipo: 'personal', miembros: [me], presupuesto: { avisos: true, ...presupuesto }
});

const summary = (overrides: object = {}) => ({
  ciclo: { inicio: '2026-10-28', fin: '2026-11-28', diasRestantes: 10 },
  presupuestoGastable: 1000,
  gastado: 500,
  disponible: 500,
  porDia: 50,
  limitesCategoria: [],
  ...overrides
});

// Guarda en memoria los avisos ya registrados, como el índice único de Mongo
let stored: Set<string>;
const key = (q: any) => `${q.grupo_id}|${q.ciclo}|${q.clave}|${q.umbral}`;

describe('BudgetAlertService', () => {
  let getSummary: vi.Mock;
  let notifyUsers: vi.Mock;
  let service: BudgetAlertService;

  beforeEach(() => {
    vi.clearAllMocks();
    stored = new Set();
    (BudgetAlert.updateOne as vi.Mock).mockImplementation(async (q: any) => {
      if (stored.has(key(q))) return { upsertedCount: 0 };
      stored.add(key(q));
      return { upsertedCount: 1 };
    });
    (Group.find as vi.Mock).mockResolvedValue([personal()]);
    getSummary = vi.fn().mockResolvedValue(summary());
    notifyUsers = vi.fn();
    service = new BudgetAlertService({ getSummary } as any, { notifyUsers });
  });

  const check = () => service.checkAfterExpenseChange([personalId]);

  it('stays quiet below 80 %', async () => {
    await check();
    expect(getSummary).toHaveBeenCalledWith(personalId.toString(), me.toString());
    expect(notifyUsers).not.toHaveBeenCalled();
  });

  it('warns once at 80 % of the budget', async () => {
    getSummary.mockResolvedValue(summary({ gastado: 850, disponible: 150, porDia: 15 }));
    await check();
    expect(notifyUsers).toHaveBeenCalledWith([me.toString()], {
      title: 'Mis gastos: llevas el 85 % del presupuesto',
      body: 'Te quedan 150,00 € para 10 días (unos 15,00 € al día).',
      url: `/group/${personalId}`,
      tag: `budget-${personalId}-total`
    });

    await check();
    expect(notifyUsers).toHaveBeenCalledTimes(1);
    expect(BudgetAlert.updateOne).toHaveBeenCalledWith(
      { grupo_id: personalId, ciclo: '2026-10-28', clave: 'total', umbral: 80 },
      expect.anything(),
      { upsert: true }
    );
  });

  it('then warns at 100 %, and only that when both are crossed at once', async () => {
    getSummary.mockResolvedValue(summary({ gastado: 1100, disponible: -100 }));
    await check();
    expect(notifyUsers).toHaveBeenCalledTimes(1);
    expect(notifyUsers.mock.calls[0][1]).toMatchObject({
      title: 'Mis gastos: has gastado todo el presupuesto',
      body: 'Te pasas 100,00 € y aún quedan 10 días de ciclo.'
    });
    // Los dos umbrales quedan registrados: no se avisará del 80 % después
    expect(stored.size).toBe(2);
  });

  it('warns again in a new cycle', async () => {
    getSummary.mockResolvedValue(summary({ gastado: 900 }));
    await check();
    getSummary.mockResolvedValue(summary({ gastado: 900, ciclo: { inicio: '2026-11-28', fin: '2026-12-28', diasRestantes: 30 } }));
    await check();
    expect(notifyUsers).toHaveBeenCalledTimes(2);
  });

  it('warns per category limit', async () => {
    getSummary.mockResolvedValue(summary({
      limitesCategoria: [
        { categoria: 'Ocio', limite: 150, gastado: 127.5, restante: 22.5, porcentaje: 85 },
        { categoria: 'Ropa', limite: 50, gastado: 60, restante: -10, porcentaje: 120 },
        { categoria: 'Libros', limite: 50, gastado: 10, restante: 40, porcentaje: 20 }
      ]
    }));
    await check();
    expect(notifyUsers.mock.calls.map(c => c[1])).toEqual([
      {
        title: 'Ocio: llevas el 85 % del límite',
        body: 'Te quedan 22,50 € hasta el 27 de noviembre.',
        url: `/group/${personalId}`,
        tag: `budget-${personalId}-categoria-ocio`
      },
      {
        title: 'Ropa: has llegado al límite',
        body: 'Llevas 60,00 € de 50,00 € este ciclo (te pasas 10,00 €).',
        url: `/group/${personalId}`,
        tag: `budget-${personalId}-categoria-ropa`
      }
    ]);
  });

  it('does nothing when alerts are off or there is no budget to spend', async () => {
    (Group.find as vi.Mock).mockResolvedValue([personal({ avisos: false })]);
    getSummary.mockResolvedValue(summary({ gastado: 2000 }));
    await check();
    expect(getSummary).not.toHaveBeenCalled();

    (Group.find as vi.Mock).mockResolvedValue([personal()]);
    getSummary.mockResolvedValue(summary({ presupuestoGastable: 0, gastado: 30 }));
    await check();
    expect(notifyUsers).not.toHaveBeenCalled();
  });

  it('checks the personal budgets that count a shared group', async () => {
    const shared = { _id: sharedId, nombre: 'Piso', tipo: 'compartido', miembros: [me, oid()] };
    (Group.find as vi.Mock)
      .mockResolvedValueOnce([shared])
      .mockResolvedValueOnce([personal({ incluirOtrosGrupos: true })]);
    getSummary.mockResolvedValue(summary({ gastado: 800 }));

    await service.checkAfterExpenseChange([sharedId, sharedId.toString()]);

    expect(Group.find).toHaveBeenNthCalledWith(1, { _id: { $in: [sharedId.toString()] } });
    expect(Group.find).toHaveBeenNthCalledWith(2, {
      tipo: 'personal', miembros: { $in: shared.miembros }, 'presupuesto.incluirOtrosGrupos': true
    });
    expect(notifyUsers).toHaveBeenCalledTimes(1);
  });

  it('treats a concurrent duplicate as already sent and never throws', async () => {
    getSummary.mockResolvedValue(summary({ gastado: 900 }));
    (BudgetAlert.updateOne as vi.Mock).mockRejectedValueOnce(Object.assign(new Error('dup'), { code: 11000 }));
    await check();
    expect(notifyUsers).not.toHaveBeenCalled();

    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    getSummary.mockRejectedValue(new Error('boom'));
    await expect(check()).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
