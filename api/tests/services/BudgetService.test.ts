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

  describe('getForecast', () => {
    const ivaId = oid();
    const iva = { _id: ivaId, tipo: 'factura', nombre: 'Aplazamiento IVA', importe: 86, frecuencia: 'mensual', fechaInicio: d('2026-12-20'), fechaFin: d('2027-01-31'), activo: true };
    const inRange = <T extends { fecha: Date }>(list: T[]) => async (q: any) =>
      list.filter(e => e.fecha >= q.fecha.$gte && e.fecha < q.fecha.$lt);

    beforeEach(() => {
      (RecurringItem.find as vi.Mock).mockImplementation(async (q: any) => (q.fechaFin ? [iva] : [...items, iva]));
      (Expense.find as vi.Mock).mockImplementation(inRange(personalExpenses));
      (Income.find as vi.Mock).mockImplementation(inRange(incomes));
    });

    it('projects what is left in the current and next cycles', async () => {
      const forecast = await service.getForecast(groupId, userId, 4);

      expect(forecast.ahorroObjetivo).toBe(200);
      expect(forecast.ciclos.map(c => [c.inicio, c.offset, c.enCurso])).toEqual([
        ['2026-10-28', 0, true],
        ['2026-11-28', 1, false],
        ['2026-12-28', 2, false],
        ['2027-01-28', 3, false]
      ]);
      // En curso: lo real (nómina 2050, gastado 150) y la luz pendiente
      expect(forecast.ciclos[0]).toMatchObject({ ingresos: 2050, facturas: 760, presupuestoGastable: 1090, gastado: 150, disponible: 940, temporales: [] });
      // Siguiente: nómina prevista 2000 - alquiler 700 - luz 60 - IVA 86 - ahorro 200
      expect(forecast.ciclos[1]).toMatchObject({ ingresos: 2000, facturas: 846, presupuestoGastable: 954, gastado: 0, disponible: 954 });
      expect(forecast.ciclos[1].temporales).toEqual([
        { recurrente_id: ivaId.toString(), nombre: 'Aplazamiento IVA', fecha: '2026-12-20', importe: 86, estado: 'pendiente', ultima: false, nueva: true }
      ]);
      expect(forecast.ciclos[2].temporales).toMatchObject([{ fecha: '2027-01-20', ultima: true, nueva: false }]);
      // Todas las facturas del ciclo, también las que no acaban; «nueva» solo en el ciclo en que empieza
      expect(forecast.ciclos[1].partidas.map(p => [p.nombre, p.nueva, p.ultima])).toEqual(
        expect.arrayContaining([['Aplazamiento IVA', true, false]])
      );
      expect(forecast.ciclos[1].partidas.length).toBeGreaterThan(1);
      expect(forecast.ciclos[1].partidas.filter(p => p.nombre !== 'Aplazamiento IVA').every(p => !p.nueva && !p.ultima)).toBe(true);
      expect(forecast.ciclos[2].partidas.find(p => p.nombre === 'Aplazamiento IVA')).toMatchObject({ nueva: false, ultima: true });
      expect(forecast.ciclos[0].partidas.every(p => !p.nueva)).toBe(true);
      expect(forecast.ciclos[3]).toMatchObject({ facturas: 760, temporales: [] });
    });

    it('applies special payments: another instalment or an extra on top', async () => {
      const visa = {
        _id: oid(), tipo: 'factura', nombre: 'Visa', importe: 43, frecuencia: 'mensual', fechaInicio: d('2026-11-01'), activo: true,
        pagosEspeciales: [
          { tipo: 'cuota', desde: d('2026-12-01'), hasta: d('2027-01-01'), importe: 110 },
          { tipo: 'extra', desde: d('2027-01-01'), hasta: d('2027-01-01'), importe: 200 }
        ]
      };
      (RecurringItem.find as vi.Mock).mockImplementation(async (q: any) => (q.fechaFin ? [] : [...items, visa]));

      const forecast = await service.getForecast(groupId, userId, 3);
      const of = (i: number) => forecast.ciclos[i].partidas.find(p => p.nombre === 'Visa');
      expect(of(1)).toMatchObject({ fecha: '2026-12-01', importe: 110 });
      expect(of(1)!.extra).toBeUndefined();
      expect(of(2)).toMatchObject({ fecha: '2027-01-01', importe: 310, extra: 200 });
      expect(forecast.ciclos[2].facturas).toBe(760 + 310);
    });

    describe('scenarios', () => {
      it('drops removed items from the next cycles but keeps what was already paid', async () => {
        const forecast = await service.getForecast(groupId, userId, 2, { quitar: [alquilerId.toString(), luzId.toString()] });

        // En curso: el alquiler ya está pagado y sigue contando; la luz pendiente desaparece
        expect(forecast.ciclos[0]).toMatchObject({ facturas: 700, disponible: 1000 });
        // Siguiente: solo el IVA (2000 - 86 - 200 de ahorro)
        expect(forecast.ciclos[1]).toMatchObject({ facturas: 86, disponible: 1714 });
        expect(forecast.ciclos[1].partidas.map(p => p.nombre)).toEqual(['Aplazamiento IVA']);
        expect(RecurringItem.prototype.save).not.toHaveBeenCalled();
      });

      it('adds made-up items, marked as simulated, with the same id in every cycle', async () => {
        const forecast = await service.getForecast(groupId, userId, 3, {
          nuevas: [
            { tipo: 'factura', nombre: 'Coche', importe: 300, fechaInicio: '2026-12-01' },
            { tipo: 'ingreso', nombre: 'Clases', importe: 150, fechaInicio: '2026-12-10', prorratear: true }
          ]
        });

        expect(forecast.ciclos[0]).toMatchObject({ facturas: 760, ingresos: 2050 });
        expect(forecast.ciclos[1]).toMatchObject({ facturas: 1146, ingresos: 2150, disponible: 804 });
        const coche = forecast.ciclos.slice(1).map(c => c.partidas.find(p => p.nombre === 'Coche'));
        expect(coche[0]).toMatchObject({ importe: 300, nueva: true, simulada: true });
        expect(coche[1]).toMatchObject({ nueva: false, simulada: true, recurrente_id: coche[0]!.recurrente_id });
        expect(forecast.ciclos[1].partidas.find(p => p.nombre === 'Alquiler')?.simulada).toBeUndefined();
      });

      it('rejects malformed scenarios', async () => {
        await expect(service.getForecast(groupId, userId, 2, { quitar: 'x' })).rejects.toMatchObject({ statusCode: 400 });
        await expect(service.getForecast(groupId, userId, 2, { nuevas: [{ tipo: 'factura', nombre: 'Coche' }] })).rejects.toMatchObject({ statusCode: 400 });
        await expect(service.getForecast(groupId, userId, 2, {
          nuevas: [{ tipo: 'factura', nombre: 'Coche', importe: 10, fechaInicio: '2027-01-01', fechaFin: '2026-01-01' }]
        })).rejects.toMatchObject({ statusCode: 400 });
      });
    });

    it('rejects a bad number of cycles', async () => {
      await expect(service.getForecast(groupId, userId, 0)).rejects.toMatchObject({ statusCode: 400 });
      await expect(service.getForecast(groupId, userId, 26)).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  describe('sinking funds (prorated bills)', () => {
    // IVA trimestral de 600 € (20 de ene, abr, jul, oct) prorrateado desde hoy, 4-nov (ciclo 28-oct)
    const ivaId = oid();
    const iva = {
      _id: ivaId, tipo: 'factura', nombre: 'IVA', importe: 600, frecuencia: 'trimestral', fechaInicio: d('2026-10-20'),
      activo: true, prorratear: true, prorrateoDesde: d('2026-11-04')
    };
    const payIva = (monto: number, fecha: string) => ({
      _id: oid(), grupo_id: groupId, descripcion: 'IVA', monto, fecha: d(fecha), pagado_por: me, participantes: me, asume_gasto: false, recurrente_id: ivaId
    });
    let all: any[];

    beforeEach(() => {
      all = [...personalExpenses];
      (RecurringItem.find as vi.Mock).mockResolvedValue([...items, iva]);
      (Expense.find as vi.Mock).mockImplementation(async (q: any) => all.filter(e =>
        (q.recurrente_id ? q.recurrente_id.$in.some((id: unknown) => String(id) === String(e.recurrente_id)) : true) &&
        e.fecha >= q.fecha.$gte && e.fecha < q.fecha.$lt));
      (Income.find as vi.Mock).mockResolvedValue([]);
    });

    it('sets aside a share every cycle until the bill is due', async () => {
      const now = await service.getSummary(groupId, userId);
      expect(now.reservas).toEqual({
        total: 200,
        lineas: [{ recurrente_id: ivaId.toString(), nombre: 'IVA', cuota: 200, saldo: 200, proximoPago: { fecha: '2027-01-20', importe: 600, cubierto: 200 } }]
      });
      // 2000 de nómina prevista - 760 de facturas - 200 de reserva - 200 de ahorro
      expect(now.presupuestoGastable).toBe(840);

      const next = await service.getSummary(groupId, userId, 1);
      expect(next.reservas.lineas[0]).toMatchObject({ cuota: 200, saldo: 400 });
    });

    it('pays the bill from the fund in the cycle it is due', async () => {
      const due = await service.getSummary(groupId, userId, 2); // 28-dic a 28-ene
      expect(due.facturas.lineas.find(l => l.nombre === 'IVA')).toMatchObject({ fecha: '2027-01-20', importe: 600, deHucha: 600, estado: 'pendiente' });
      expect(due.facturas).toMatchObject({ total: 760, deHucha: 600, pendientes: 760 });
      // Aún sin pagar: es el próximo pago y la hucha ya lo cubre entero
      expect(due.reservas.lineas[0]).toMatchObject({ cuota: 200, saldo: 0, proximoPago: { fecha: '2027-01-20', importe: 600, cubierto: 600 } });

      const after = await service.getSummary(groupId, userId, 3);
      expect(after.reservas.lineas[0]).toMatchObject({ cuota: 200, saldo: 200 });
    });

    it('charges the cycle only with what the fund does not cover, and carries what is left', async () => {
      all.push(payIva(650, '2027-01-20'));
      const due = await service.getSummary(groupId, userId, 2);
      expect(due.facturas.lineas.find(l => l.nombre === 'IVA')).toMatchObject({ importe: 650, deHucha: 600, estado: 'pagada' });
      expect(due.facturas.total).toBe(810); // 760 + 50 que no cubre la hucha
      expect(due.reservas.lineas[0].proximoPago).toEqual({ fecha: '2027-04-20', importe: 600, cubierto: 0 });

      all[all.length - 1] = payIva(540, '2027-01-20');
      const cheaper = await service.getSummary(groupId, userId, 3);
      expect(cheaper.reservas.lineas[0]).toMatchObject({ cuota: 180, saldo: 240 }); // (600 - 60) / 3
    });

    it('catches up when the fund starts close to the due date', async () => {
      (RecurringItem.find as vi.Mock).mockResolvedValue([...items, { ...iva, prorrateoDesde: d('2026-12-01') }]); // ciclo 28-nov
      expect((await service.getSummary(groupId, userId)).reservas.lineas).toEqual([]);
      const late = await service.getSummary(groupId, userId, 1);
      expect(late.reservas.lineas[0]).toMatchObject({ cuota: 300, saldo: 300 });
    });

    it('feeds the forecast', async () => {
      const forecast = await service.getForecast(groupId, userId, 3);
      expect(forecast.ciclos.map(c => [c.facturas, c.reservas, c.disponible])).toEqual([
        [760, 200, 840 - 150],
        [760, 200, 840],
        [760, 200, 840]
      ]);
    });

    describe('monthly instalment plans', () => {
      // Aplazamiento en 6 cuotas de 85 € (20 de dic a 20 de may), prorrateado desde hoy, 4-nov
      const planId = oid();
      const plan = {
        _id: planId, tipo: 'factura', nombre: 'Aplazamiento IVA', importe: 85, frecuencia: 'mensual',
        fechaInicio: d('2026-12-20'), fechaFin: d('2027-05-20'), activo: true, prorratear: true, prorrateoDesde: d('2026-11-04')
      };
      beforeEach(() => {
        (RecurringItem.find as vi.Mock).mockResolvedValue([...items, plan]);
      });

      it('spreads what is left of the plan over the cycles up to the last instalment', async () => {
        const now = await service.getSummary(groupId, userId);
        // 510 € entre 7 ciclos (de este al de la última cuota)
        expect(now.reservas.lineas).toEqual([{
          recurrente_id: planId.toString(), nombre: 'Aplazamiento IVA', cuota: 72.86, saldo: 72.86,
          proximoPago: { fecha: '2026-12-20', importe: 85, cubierto: 72.86 }
        }]);

        const first = await service.getSummary(groupId, userId, 1); // 28-nov a 28-dic
        expect(first.facturas.lineas.find(l => l.nombre === 'Aplazamiento IVA')).toMatchObject({ importe: 85, deHucha: 85 });
        expect(first.reservas.lineas[0]).toMatchObject({ cuota: 72.86, saldo: 60.72 }); // 145.72 - 85
      });

      it('pays every instalment from the fund and disappears when the plan is over', async () => {
        const last = await service.getSummary(groupId, userId, 6); // 28-abr a 28-may
        expect(last.facturas.lineas.find(l => l.nombre === 'Aplazamiento IVA')).toMatchObject({ fecha: '2027-05-20', deHucha: 85 });
        expect(last.reservas.lineas[0].cuota).toBeCloseTo(72.86, 1);

        const after = await service.getSummary(groupId, userId, 7);
        expect(after.reservas).toEqual({ total: 0, lineas: [] });
      });
    });

    describe('settings', () => {
      const fakeDoc = (data: object) => {
        const doc: any = { ...data, save: vi.fn() };
        doc.set = (key: any, value?: unknown) => (typeof key === 'string' ? (doc[key] = value) : Object.assign(doc, key));
        return doc;
      };

      it('starts the fund today when prorating is turned on and forgets it when turned off', async () => {
        const doc = fakeDoc({ ...iva, prorratear: false, prorrateoDesde: undefined, grupo_id: groupId });
        (RecurringItem.findById as vi.Mock).mockResolvedValue(doc);

        await service.updateRecurringItem(ivaId.toString(), userId, { prorratear: true });
        expect(doc.prorrateoDesde).toEqual(d('2026-11-04'));
        await service.updateRecurringItem(ivaId.toString(), userId, { importe: 700 });
        expect(doc.prorrateoDesde).toEqual(d('2026-11-04'));
        await service.updateRecurringItem(ivaId.toString(), userId, { prorratear: false });
        expect(doc.prorrateoDesde).toBeUndefined();
      });

      it('starts the fund on a future date when asked, never on a past one', async () => {
        (RecurringItem.create as vi.Mock).mockImplementation(async (data: any) => data);
        const seguro = { tipo: 'factura', nombre: 'Seguro', importe: 300, frecuencia: 'anual', fechaInicio: '2027-03-15', prorratear: true };
        expect(await service.createRecurringItem(groupId, userId, { ...seguro, prorrateoDesde: '2027-02-01' }))
          .toMatchObject({ prorrateoDesde: d('2027-02-01') });
        await expect(service.createRecurringItem(groupId, userId, { ...seguro, prorrateoDesde: '2026-11-01' }))
          .rejects.toMatchObject({ statusCode: 400 });
        expect(await service.createRecurringItem(groupId, userId, { ...seguro, prorratear: false, prorrateoDesde: '2027-02-01' }))
          .not.toHaveProperty('prorrateoDesde');

        // Una fecha ya pasada que no cambia (el formulario la reenvía) se respeta; null vuelve a hoy
        const doc = fakeDoc({ ...iva, prorrateoDesde: d('2026-10-30'), grupo_id: groupId });
        (RecurringItem.findById as vi.Mock).mockResolvedValue(doc);
        await service.updateRecurringItem(ivaId.toString(), userId, { importe: 650, prorrateoDesde: '2026-10-30' });
        expect(doc.prorrateoDesde).toEqual(d('2026-10-30'));
        await expect(service.updateRecurringItem(ivaId.toString(), userId, { prorrateoDesde: '2026-11-01' }))
          .rejects.toMatchObject({ statusCode: 400 });
        await service.updateRecurringItem(ivaId.toString(), userId, { prorrateoDesde: '2027-02-01' });
        expect(doc.prorrateoDesde).toEqual(d('2027-02-01'));
        await service.updateRecurringItem(ivaId.toString(), userId, { prorrateoDesde: null });
        expect(doc.prorrateoDesde).toEqual(d('2026-11-04'));
      });

      it('keeps a reminder text and its days ahead, and an empty one clears it', async () => {
        (RecurringItem.create as vi.Mock).mockImplementation(async (data: any) => data);
        const base = { tipo: 'factura', nombre: 'Extra', importe: 630, frecuencia: 'mensual', fechaInicio: '2027-09-01' };
        expect(await service.createRecurringItem(groupId, userId, { ...base, aviso: '  Pide la amortización ', avisoDiasAntes: 5 }))
          .toMatchObject({ aviso: 'Pide la amortización', avisoDiasAntes: 5 });
        expect(await service.createRecurringItem(groupId, userId, { ...base, aviso: '' })).not.toHaveProperty('aviso');
        await expect(service.createRecurringItem(groupId, userId, { ...base, aviso: 'x'.repeat(201) })).rejects.toMatchObject({ statusCode: 400 });
        await expect(service.createRecurringItem(groupId, userId, { ...base, avisoDiasAntes: 40 })).rejects.toMatchObject({ statusCode: 400 });

        const doc = fakeDoc({ ...iva, aviso: 'Algo', grupo_id: groupId });
        (RecurringItem.findById as vi.Mock).mockResolvedValue(doc);
        await service.updateRecurringItem(ivaId.toString(), userId, { aviso: null });
        expect(doc.aviso).toBeUndefined();
      });

      it('sets nothing aside before a future start and catches up from it', async () => {
        (RecurringItem.find as vi.Mock).mockResolvedValue([...items, { ...iva, prorrateoDesde: d('2026-12-01') }]); // ciclo 28-nov
        const forecast = await service.getForecast(groupId, userId, 3);
        expect(forecast.ciclos.map(c => c.reservas)).toEqual([0, 300, 300]);
      });

      it('only prorates bills that are not monthly, or monthly ones with an end date', async () => {
        (RecurringItem.create as vi.Mock).mockImplementation(async (data: any) => data);
        await expect(service.createRecurringItem(groupId, userId, {
          tipo: 'factura', nombre: 'Luz', importe: 60, frecuencia: 'mensual', fechaInicio: '2026-11-05', prorratear: true
        })).rejects.toMatchObject({ statusCode: 400 });

        const created = await service.createRecurringItem(groupId, userId, {
          tipo: 'factura', nombre: 'Seguro', importe: 300, frecuencia: 'anual', fechaInicio: '2027-03-15', prorratear: true
        });
        expect(created).toMatchObject({ prorratear: true, prorrateoDesde: d('2026-11-04') });

        const doc = fakeDoc({ ...iva, grupo_id: groupId });
        (RecurringItem.findById as vi.Mock).mockResolvedValue(doc);
        await expect(service.updateRecurringItem(ivaId.toString(), userId, { frecuencia: 'mensual' })).rejects.toMatchObject({ statusCode: 400 });

        const plan = await service.createRecurringItem(groupId, userId, {
          tipo: 'factura', nombre: 'Aplazamiento', importe: 85, frecuencia: 'mensual', fechaInicio: '2026-12-20', fechaFin: '2027-05-20', prorratear: true
        });
        expect(plan).toMatchObject({ prorratear: true, prorrateoDesde: d('2026-11-04') });

        const planDoc = fakeDoc({ ...iva, frecuencia: 'mensual', fechaFin: d('2027-05-20'), grupo_id: groupId });
        (RecurringItem.findById as vi.Mock).mockResolvedValue(planDoc);
        await expect(service.updateRecurringItem(ivaId.toString(), userId, { fechaFin: null })).rejects.toMatchObject({ statusCode: 400 });
      });
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

    it('stores special payments sorted, with calendar dates and their reminders', async () => {
      await service.createRecurringItem(groupId, userId, {
        tipo: 'factura', nombre: 'Préstamo', importe: 92.37, fechaInicio: '2026-11-01',
        pagosEspeciales: [
          { tipo: 'extra', desde: '2027-09-01', hasta: '2027-10-01', importe: '630', aviso: '  ', avisoDiasAntes: 4 },
          { tipo: 'extra', desde: '2027-08-01', importe: 466.894, aviso: ' Pide la amortización ', avisoDiasAntes: 5 }
        ]
      });

      expect((RecurringItem.create as vi.Mock).mock.calls[0][0].pagosEspeciales).toEqual([
        { tipo: 'extra', desde: d('2027-08-01'), hasta: d('2027-08-01'), importe: 466.89, aviso: 'Pide la amortización', avisoDiasAntes: 5 },
        { tipo: 'extra', desde: d('2027-09-01'), hasta: d('2027-10-01'), importe: 630 }
      ]);
    });

    it.each([
      ['a special payment of an unknown type', { tipo: 'factura', nombre: 'X', importe: 1, fechaInicio: '2026-11-10', pagosEspeciales: [{ tipo: 'otro', desde: '2027-01-01', importe: 5 }] }],
      ['a special payment that ends before it starts', { tipo: 'factura', nombre: 'X', importe: 1, fechaInicio: '2026-11-10', pagosEspeciales: [{ tipo: 'extra', desde: '2027-02-01', hasta: '2027-01-01', importe: 5 }] }],
      ['a special payment without amount', { tipo: 'factura', nombre: 'X', importe: 1, fechaInicio: '2026-11-10', pagosEspeciales: [{ tipo: 'cuota', desde: '2027-01-01' }] }],
      ['special payments that are not a list', { tipo: 'factura', nombre: 'X', importe: 1, fechaInicio: '2026-11-10', pagosEspeciales: 'x' }]
    ])('rejects %s', async (_label, data) => {
      await expect(service.createRecurringItem(groupId, userId, data)).rejects.toMatchObject({ statusCode: 400 });
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
