import mongoose from 'mongoose';
import { BudgetService, userShareOf } from '../../src/services/BudgetService';
import Group from '../../src/models/Group';
import Expense from '../../src/models/Expense';
import Income from '../../src/models/Income';
import RecurringItem from '../../src/models/RecurringItem';
import CategoryAlias from '../../src/models/CategoryAlias';

vi.mock('../../src/models/Group');
vi.mock('../../src/models/CategoryAlias');
vi.mock('../../src/models/Expense');
vi.mock('../../src/models/Income');
vi.mock('../../src/models/RecurringItem');

const oid = () => new mongoose.Types.ObjectId();
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

const userId = oid().toString();
const otherUser = oid().toString();
const groupId = oid().toString();

const nominaId = oid();
const alquilerId = oid();
const luzId = oid();

const personalGroup = (presupuesto: object = { diaInicioCiclo: 28, ahorroObjetivo: 200, incluirOtrosGrupos: false }) => ({
  _id: new mongoose.Types.ObjectId(groupId),
  nombre: 'Mis gastos',
  tipo: 'personal',
  miembros: [new mongoose.Types.ObjectId(userId)],
  presupuesto
});

const items = [
  { _id: nominaId, tipo: 'ingreso', nombre: 'Nómina', importe: 2000, frecuencia: 'mensual', fechaInicio: d('2026-01-28'), activo: true },
  { _id: alquilerId, tipo: 'factura', nombre: 'Alquiler', importe: 700, frecuencia: 'mensual', fechaInicio: d('2026-01-01'), activo: true },
  { _id: luzId, tipo: 'factura', nombre: 'Luz', importe: 60, frecuencia: 'mensual', fechaInicio: d('2026-01-05'), activo: true },
  { _id: oid(), tipo: 'factura', nombre: 'Seguro', importe: 300, frecuencia: 'anual', fechaInicio: d('2025-03-15'), activo: true },
  { _id: oid(), tipo: 'factura', nombre: 'Netflix', importe: 13, frecuencia: 'mensual', fechaInicio: d('2026-01-10'), activo: false }
];

const me = [new mongoose.Types.ObjectId(userId)];
const personalExpenses = [
  { _id: oid(), grupo_id: groupId, descripcion: 'Alquiler', monto: 700, fecha: d('2026-11-01'), pagado_por: me, participantes: me, asume_gasto: false, recurrente_id: alquilerId },
  { _id: oid(), grupo_id: groupId, descripcion: 'Súper', monto: 120, fecha: d('2026-10-30'), pagado_por: me, participantes: me, asume_gasto: false },
  { _id: oid(), grupo_id: groupId, descripcion: 'Cena', monto: 30, fecha: d('2026-11-03'), pagado_por: me, participantes: me, asume_gasto: false }
];
const incomes = [
  { _id: oid(), grupo_id: groupId, descripcion: 'Nómina', monto: 2050, fecha: d('2026-10-28'), recurrente_id: nominaId }
];

// "Ahora": 4 de noviembre de 2026 por la mañana -> ciclo del 28-oct al 28-nov (31 días)
const NOW = new Date('2026-11-04T09:00:00Z');

describe('BudgetService', () => {
  let service: BudgetService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new BudgetService(() => NOW);
    (Group.findById as vi.Mock).mockResolvedValue(personalGroup());
    (RecurringItem.find as vi.Mock).mockResolvedValue(items);
    (Expense.find as vi.Mock).mockResolvedValue(personalExpenses);
    (Income.find as vi.Mock).mockResolvedValue(incomes);
  });

  describe('getSummary', () => {
    it('computes what is left for the current payday cycle', async () => {
      const summary = await service.getSummary(groupId, userId);

      expect(summary.ciclo).toEqual({
        inicio: '2026-10-28', fin: '2026-11-28', offset: 0, diasTotales: 31, diasTranscurridos: 8, diasRestantes: 24
      });
      expect(Expense.find).toHaveBeenCalledWith({ grupo_id: groupId, fecha: { $gte: d('2026-10-28'), $lt: d('2026-11-28') } });

      expect(summary.ingresos).toMatchObject({ recibidos: 2050, previstos: 0, total: 2050 });
      expect(summary.facturas).toMatchObject({ pagadas: 700, pendientes: 60, total: 760 });
      expect(summary.facturas.lineas.map(l => [l.nombre, l.fecha, l.estado])).toEqual([
        ['Alquiler', '2026-11-01', 'pagada'],
        ['Luz', '2026-11-05', 'pendiente']
      ]);
      expect(summary.gastosVariables).toBe(150);
      expect(summary.otrosGrupos).toBeNull();
      expect(summary.presupuestoGastable).toBe(1090); // 2050 - 760 - 200
      expect(summary.gastado).toBe(150);
      expect(summary.disponible).toBe(940);
      expect(summary.porDia).toBe(39.17);   // 940 / 24
      expect(summary.porSemana).toBe(274.17); // 940 * 7 / 24
      expect(summary.ritmo).toEqual({ gastoIdeal: 281.29, desviacion: -131.29 }); // 1090 * 8 / 31
    });

    it('uses the expected income until the real one is confirmed', async () => {
      (Income.find as vi.Mock).mockResolvedValue([]);
      const summary = await service.getSummary(groupId, userId);

      expect(summary.ingresos).toMatchObject({ recibidos: 0, previstos: 2000, total: 2000 });
      expect(summary.ingresos.lineas[0]).toMatchObject({ nombre: 'Nómina', fecha: '2026-10-28', estado: 'previsto' });
    });

    it('counts extra incomes without a recurring item', async () => {
      (Income.find as vi.Mock).mockResolvedValue([
        ...incomes,
        { _id: oid(), grupo_id: groupId, descripcion: 'Bizum', monto: 25, fecha: d('2026-11-02') }
      ]);
      const summary = await service.getSummary(groupId, userId);

      expect(summary.ingresos.total).toBe(2075);
    });

    it('keeps a paid bill whose recurring item was deleted', async () => {
      (RecurringItem.find as vi.Mock).mockResolvedValue(items.filter(i => i._id !== alquilerId));
      const summary = await service.getSummary(groupId, userId);

      expect(summary.facturas.lineas.find(l => l.nombre === 'Alquiler')).toMatchObject({ estado: 'pagada', importe: 700 });
    });

    it('works with defaults when the group has no budget config yet', async () => {
      (Group.findById as vi.Mock).mockResolvedValue({ ...personalGroup(), presupuesto: undefined });
      const summary = await service.getSummary(groupId, userId);

      expect(summary.configuracion).toEqual({ diaInicioCiclo: 1, ahorroObjetivo: 0, incluirOtrosGrupos: false, limitesCategoria: [], avisos: true });
      expect(summary.ciclo).toMatchObject({ inicio: '2026-11-01', fin: '2026-12-01' });
    });

    it('has no per-day amounts nor pace for a past cycle', async () => {
      const summary = await service.getSummary(groupId, userId, -1);

      expect(summary.ciclo).toMatchObject({ inicio: '2026-09-28', fin: '2026-10-28', diasRestantes: 0, diasTranscurridos: 30 });
      expect(summary.porDia).toBeNull();
      expect(summary.porSemana).toBeNull();
      expect(summary.ritmo).toBeNull();
    });

    it('caps the weekly amount to what is left in the last days', async () => {
      service = new BudgetService(() => new Date('2026-11-25T09:00:00Z')); // quedan 3 días (25, 26, 27)
      const summary = await service.getSummary(groupId, userId);

      expect(summary.ciclo.diasRestantes).toBe(3);
      expect(summary.porSemana).toBe(summary.disponible);
    });

    it('adds my share of shared groups only when enabled', async () => {
      (Group.findById as vi.Mock).mockResolvedValue(personalGroup({ diaInicioCiclo: 28, ahorroObjetivo: 200, incluirOtrosGrupos: true }));
      const pisoId = oid();
      (Group.find as vi.Mock).mockResolvedValue([{ _id: pisoId, nombre: 'Piso' }]);
      const others = [oid(), oid()];
      (Expense.find as vi.Mock).mockImplementation(async (query: any) => {
        if (query.grupo_id?.$in) {
          return [
            // 90 € entre 3: 30 € para mí
            { grupo_id: pisoId, monto: 90, pagado_por: [others[0]], participantes: [new mongoose.Types.ObjectId(userId), ...others], asume_gasto: false },
            // Lo asume otro: 0 € para mí
            { grupo_id: pisoId, monto: 50, pagado_por: [others[0]], participantes: [others[0]], asume_gasto: true }
          ];
        }
        return personalExpenses;
      });

      const summary = await service.getSummary(groupId, userId);

      expect(Group.find).toHaveBeenCalledWith({ miembros: userId, _id: { $ne: groupId }, tipo: { $ne: 'personal' } });
      expect(summary.otrosGrupos).toEqual({ total: 30, grupos: [{ _id: pisoId.toString(), nombre: 'Piso', total: 30 }] });
      expect(summary.gastado).toBe(180);
      expect(summary.disponible).toBe(910);
    });

    it('has no category limits by default', async () => {
      const summary = await service.getSummary(groupId, userId);
      expect(summary.limitesCategoria).toEqual([]);
      expect(CategoryAlias.find).not.toHaveBeenCalled();
    });

    it('tracks each category limit with its aliases, leaving bills out', async () => {
      (Group.findById as vi.Mock).mockResolvedValue(personalGroup({
        diaInicioCiclo: 28, ahorroObjetivo: 0, incluirOtrosGrupos: false,
        limitesCategoria: [{ categoria: 'Ocio', limite: 100 }, { categoria: 'Hogar', limite: 50 }, { categoria: 'Ropa', limite: 80 }]
      }));
      (Expense.find as vi.Mock).mockResolvedValue([
        // Factura: no cuenta aunque sea de Hogar
        { _id: oid(), grupo_id: groupId, monto: 700, fecha: d('2026-11-01'), pagado_por: me, participantes: me, asume_gasto: false, recurrente_id: alquilerId, categoria: ['Hogar'] },
        { _id: oid(), grupo_id: groupId, monto: 60, fecha: d('2026-11-02'), pagado_por: me, participantes: me, asume_gasto: false, categoria: ['ocio'] },
        // "Cervezas" es un alias de Ocio y Hogar a la vez
        { _id: oid(), grupo_id: groupId, monto: 55.5, fecha: d('2026-11-03'), pagado_por: me, participantes: me, asume_gasto: false, categoria: ['Cervezas'] },
        // Alias de otro grupo: no se aplica aquí
        { _id: oid(), grupo_id: groupId, monto: 10, fecha: d('2026-11-03'), pagado_por: me, participantes: me, asume_gasto: false, categoria: ['Zapatos'] }
      ]);
      (CategoryAlias.find as vi.Mock).mockReturnValue({
        lean: async () => [
          { alias: 'cervezas', mainCategories: ['Ocio', 'Hogar'], grupo_id: new mongoose.Types.ObjectId(groupId) },
          { alias: 'Zapatos', mainCategories: ['Ropa'], grupo_id: oid() }
        ]
      });

      const summary = await service.getSummary(groupId, userId);

      expect(summary.limitesCategoria).toEqual([
        { categoria: 'Ocio', limite: 100, gastado: 115.5, restante: -15.5, porcentaje: 116 },
        { categoria: 'Hogar', limite: 50, gastado: 55.5, restante: -5.5, porcentaje: 111 },
        { categoria: 'Ropa', limite: 80, gastado: 0, restante: 80, porcentaje: 0 }
      ]);
    });

    it('counts my share of other groups in the limits when enabled', async () => {
      (Group.findById as vi.Mock).mockResolvedValue(personalGroup({
        diaInicioCiclo: 28, ahorroObjetivo: 0, incluirOtrosGrupos: true, limitesCategoria: [{ categoria: 'Restaurantes', limite: 100 }]
      }));
      const pisoId = oid();
      (Group.find as vi.Mock).mockResolvedValue([{ _id: pisoId, nombre: 'Piso' }]);
      (Expense.find as vi.Mock).mockImplementation(async (query: any) => query.grupo_id?.$in
        ? [{ grupo_id: pisoId, monto: 90, pagado_por: [oid()], participantes: [new mongoose.Types.ObjectId(userId), oid(), oid()], asume_gasto: false, categoria: ['Restaurantes'] }]
        : [{ _id: oid(), grupo_id: groupId, monto: 20, fecha: d('2026-11-02'), pagado_por: me, participantes: me, asume_gasto: false, categoria: ['Restaurantes'] }]);
      (CategoryAlias.find as vi.Mock).mockReturnValue({ lean: async () => [] });

      const summary = await service.getSummary(groupId, userId);

      expect(summary.limitesCategoria[0]).toMatchObject({ gastado: 50, restante: 50, porcentaje: 50 });
      expect(summary.otrosGrupos).toEqual({ total: 30, grupos: [{ _id: pisoId.toString(), nombre: 'Piso', total: 30 }] });
    });

    it('rejects users that are not members', async () => {
      await expect(service.getSummary(groupId, otherUser)).rejects.toMatchObject({ statusCode: 403 });
    });

    it('rejects shared groups', async () => {
      (Group.findById as vi.Mock).mockResolvedValue({ ...personalGroup(), tipo: 'compartido' });
      await expect(service.getSummary(groupId, userId)).rejects.toMatchObject({ statusCode: 400 });
    });

    it('rejects invalid ids and offsets', async () => {
      await expect(service.getSummary('nope', userId)).rejects.toMatchObject({ statusCode: 400 });
      await expect(service.getSummary(groupId, userId, 1.5)).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  describe('getHistory', () => {
    const past = [
      { _id: oid(), grupo_id: groupId, descripcion: 'Alquiler', monto: 700, fecha: d('2026-10-01'), pagado_por: me, participantes: me, asume_gasto: false, recurrente_id: alquilerId },
      { _id: oid(), grupo_id: groupId, descripcion: 'Súper', monto: 900, fecha: d('2026-10-15'), pagado_por: me, participantes: me, asume_gasto: false },
      { _id: oid(), grupo_id: groupId, descripcion: 'Cena', monto: 80, fecha: d('2026-09-30'), pagado_por: me, participantes: [...me, oid()], asume_gasto: false }
    ];
    const pastIncomes = [
      { _id: oid(), grupo_id: groupId, descripcion: 'Nómina', monto: 2000, fecha: d('2026-09-28'), recurrente_id: nominaId },
      // Ingreso con hora: sigue contando en su ciclo
      { _id: oid(), grupo_id: groupId, descripcion: 'Bizum', monto: 50, fecha: new Date('2026-10-27T18:00:00Z') }
    ];

    beforeEach(() => {
      (Expense.find as vi.Mock).mockResolvedValue([...past, ...personalExpenses]);
      (Income.find as vi.Mock).mockResolvedValue([...pastIncomes, ...incomes]);
    });

    it('sums what really happened in each cycle and drops the empty ones before', async () => {
      const history = await service.getHistory(groupId, userId, 4);

      expect(Expense.find).toHaveBeenCalledWith({ grupo_id: groupId, fecha: { $gte: d('2026-07-28'), $lt: d('2026-11-28') } });
      // Julio-agosto y agosto-septiembre no tienen nada: se quitan
      expect(history.ciclos.map(c => [c.inicio, c.fin, c.offset, c.enCurso])).toEqual([
        ['2026-09-28', '2026-10-28', -1, false],
        ['2026-10-28', '2026-11-28', 0, true]
      ]);
      expect(history.ciclos[0]).toMatchObject({ ingresos: 2050, facturas: 700, gastosVariables: 940, otrosGrupos: 0, gastado: 1640, sobrante: 410 });
      // En curso: solo lo confirmado (la luz pendiente no cuenta)
      expect(history.ciclos[1]).toMatchObject({ ingresos: 2050, facturas: 700, gastosVariables: 150, gastado: 850, sobrante: 1200 });
      expect(history.mediaSobrante).toBe(410);
      expect(history.ahorroObjetivo).toBe(200);
    });

    it('counts your share in other groups when enabled', async () => {
      (Group.findById as vi.Mock).mockResolvedValue(personalGroup({ diaInicioCiclo: 28, ahorroObjetivo: 0, incluirOtrosGrupos: true }));
      const sharedId = oid();
      (Group.find as vi.Mock).mockResolvedValue([{ _id: sharedId, nombre: 'Piso', tipo: 'compartido' }]);
      const shared = [{ _id: oid(), grupo_id: sharedId, descripcion: 'Compra', monto: 90, fecha: d('2026-10-10'), pagado_por: me, participantes: [...me, oid(), oid()], asume_gasto: false }];
      (Expense.find as vi.Mock).mockImplementation(async (q: any) => (q.grupo_id.$in ? shared : past));
      (Income.find as vi.Mock).mockResolvedValue([]);

      const history = await service.getHistory(groupId, userId, 2);

      expect(history.ciclos[0]).toMatchObject({ otrosGrupos: 30, gastado: 1670, sobrante: -1670 });
      expect(history.ciclos[1]).toMatchObject({ gastado: 0, sobrante: 0, enCurso: true });
    });

    it('rejects a bad number of cycles', async () => {
      await expect(service.getHistory(groupId, userId, 0)).rejects.toMatchObject({ statusCode: 400 });
      await expect(service.getHistory(groupId, userId, 13)).rejects.toMatchObject({ statusCode: 400 });
      await expect(service.getHistory(groupId, userId, 2.5)).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  describe('confirmRecurringItem', () => {
    const save = vi.fn();
    beforeEach(() => {
      (RecurringItem.findById as vi.Mock).mockImplementation(async (id: string) => {
        const item = items.find(i => i._id.toString() === id);
        return item ? { ...item, grupo_id: new mongoose.Types.ObjectId(groupId), categoria: ['Hogar'], save } : null;
      });
      (Expense.create as vi.Mock).mockImplementation(async (data: any) => data);
      (Income.create as vi.Mock).mockImplementation(async (data: any) => data);
    });

    it('creates the expense that pays a bill, with the real amount', async () => {
      const result = await service.confirmRecurringItem(luzId.toString(), userId, { monto: 72.456, fecha: '2026-11-06' });

      expect(result.tipo).toBe('gasto');
      expect(Expense.create).toHaveBeenCalledWith(expect.objectContaining({
        descripcion: 'Luz',
        monto: 72.46,
        pagado_por: [userId],
        participantes: [userId],
        fecha: d('2026-11-06'),
        categoria: ['Hogar'],
        recurrente_id: luzId
      }));
    });

    it('defaults to the estimated amount and today (Madrid)', async () => {
      await service.confirmRecurringItem(luzId.toString(), userId, {});

      expect(Expense.create).toHaveBeenCalledWith(expect.objectContaining({ monto: 60, fecha: d('2026-11-04') }));
    });

    it('creates the income for an income item', async () => {
      const result = await service.confirmRecurringItem(nominaId.toString(), userId, { monto: 2050 });

      expect(result.tipo).toBe('ingreso');
      expect(Income.create).toHaveBeenCalledWith(expect.objectContaining({ descripcion: 'Nómina', monto: 2050, recurrente_id: nominaId, creado_por: userId }));
      expect(Expense.create).not.toHaveBeenCalled();
    });

    it('rejects a non-positive amount', async () => {
      await expect(service.confirmRecurringItem(luzId.toString(), userId, { monto: 0 })).rejects.toMatchObject({ statusCode: 400 });
    });

    it('returns 404 for an unknown item', async () => {
      await expect(service.confirmRecurringItem(oid().toString(), userId, {})).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('createRecurringItem', () => {
    beforeEach(() => {
      (RecurringItem.create as vi.Mock).mockImplementation(async (data: any) => data);
    });

    it('stores a clean item with calendar dates', async () => {
      await service.createRecurringItem(groupId, userId, {
        tipo: 'factura', nombre: 'Gimnasio', importe: '35.5', frecuencia: 'mensual', fechaInicio: '2026-11-10', extra: 'ignored'
      });

      expect(RecurringItem.create).toHaveBeenCalledWith({
        tipo: 'factura', nombre: 'Gimnasio', importe: 35.5, frecuencia: 'mensual', fechaInicio: d('2026-11-10'), grupo_id: groupId
      });
    });

    it.each([
      ['missing fields', { tipo: 'factura', nombre: 'X' }],
      ['bad type', { tipo: 'otro', nombre: 'X', importe: 1, fechaInicio: '2026-11-10' }],
      ['bad frequency', { tipo: 'factura', nombre: 'X', importe: 1, fechaInicio: '2026-11-10', frecuencia: 'semanal' }],
      ['non-positive amount', { tipo: 'factura', nombre: 'X', importe: -3, fechaInicio: '2026-11-10' }],
      ['bad date', { tipo: 'factura', nombre: 'X', importe: 1, fechaInicio: 'mañana' }]
    ])('rejects %s', async (_label, data) => {
      await expect(service.createRecurringItem(groupId, userId, data)).rejects.toMatchObject({ statusCode: 400 });
      expect(RecurringItem.create).not.toHaveBeenCalled();
    });
  });

  describe('createIncome', () => {
    it('stores the income for the user', async () => {
      (Income.create as vi.Mock).mockImplementation(async (data: any) => data);
      await service.createIncome(groupId, userId, { descripcion: 'Extra', monto: 100, fecha: '2026-11-02' });

      expect(Income.create).toHaveBeenCalledWith({ descripcion: 'Extra', monto: 100, fecha: d('2026-11-02'), grupo_id: groupId, creado_por: userId });
    });
  });

  describe('userShareOf', () => {
    const u = new mongoose.Types.ObjectId(userId);
    const o = oid();

    it('splits between participants', () => {
      expect(userShareOf({ monto: 90, pagado_por: [o], participantes: [u, o, oid()], asume_gasto: false } as any, userId)).toBe(30);
    });

    it('is zero when not a participant', () => {
      expect(userShareOf({ monto: 90, pagado_por: [o], participantes: [o], asume_gasto: false } as any, userId)).toBe(0);
    });

    it('goes to the payers when someone assumes the expense', () => {
      expect(userShareOf({ monto: 90, pagado_por: [u], participantes: [u], asume_gasto: true } as any, userId)).toBe(90);
      expect(userShareOf({ monto: 90, pagado_por: [o], participantes: [u, o], asume_gasto: true } as any, userId)).toBe(0);
    });
  });
});
