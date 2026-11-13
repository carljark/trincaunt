import mongoose from 'mongoose';
import { AssistantService } from '../../src/services/AssistantService';
import AiService from '../../src/services/AiService';
import Group from '../../src/models/Group';
import Expense from '../../src/models/Expense';
import Income from '../../src/models/Income';
import RecurringItem from '../../src/models/RecurringItem';
import User from '../../src/models/User';

vi.mock('../../src/models/Group');
vi.mock('../../src/models/Expense');
vi.mock('../../src/models/Income');
vi.mock('../../src/models/RecurringItem');
vi.mock('../../src/models/User');
vi.mock('../../src/services/AiService', () => ({
  default: { askWithFallback: vi.fn(), parseJson: (t: string) => JSON.parse(t) }
}));

const budget = {
  getSummary: vi.fn(), getForecast: vi.fn(), createRecurringItem: vi.fn(), updateRecurringItem: vi.fn(),
  deleteRecurringItem: vi.fn(), confirmRecurringItem: vi.fn(), createIncome: vi.fn(), updateIncome: vi.fn(), deleteIncome: vi.fn()
};
const expenses = { createExpense: vi.fn(), updateExpense: vi.fn(), deleteExpense: vi.fn(), getGroupBalance: vi.fn() };
const groups = { updateGroup: vi.fn() };
vi.mock('../../src/services/BudgetService', () => ({ BudgetService: vi.fn(function () { return budget; }) }));
vi.mock('../../src/services/ExpenseService', () => ({ ExpenseService: vi.fn(function () { return expenses; }) }));
vi.mock('../../src/services/GroupService', () => ({ GroupService: vi.fn(function () { return groups; }) }));

const oid = () => new mongoose.Types.ObjectId();
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const NOW = new Date('2026-11-08T10:00:00Z');

const userId = oid().toString();
const anaId = oid().toString();
const groupId = oid().toString();
const user = { id: userId, nombre: 'Carlos' };

const personal = {
  _id: new mongoose.Types.ObjectId(groupId), nombre: 'Gastos', tipo: 'personal', miembros: [userId],
  presupuesto: { diaInicioCiclo: 28, ahorroObjetivo: 150, incluirOtrosGrupos: false, limitesCategoria: [], avisos: true }
};
const shared = { _id: new mongoose.Types.ObjectId(groupId), nombre: 'Piso', tipo: 'compartido', miembros: [userId, anaId] };

const cervezaId = oid();
const cerveza = { _id: cervezaId, grupo_id: groupId, descripcion: 'Cervezas', monto: 12, fecha: d('2026-11-03'), categoria: ['Cervezas'], pagado_por: [userId] };
const facsaId = oid();
const facsa = { _id: facsaId, grupo_id: groupId, tipo: 'factura', nombre: 'Facsa', importe: 50, frecuencia: 'bimestral', fechaInicio: d('2026-12-01'), categoria: ['Agua'], activo: true, prorratear: false };

/** Consulta de mongoose encadenable (.sort().limit().select().lean()) que resuelve a `result` */
const chain = (result: unknown) => {
  const q: any = { then: (ok: any, ko: any) => Promise.resolve(result).then(ok, ko) };
  for (const m of ['sort', 'limit', 'select', 'lean']) q[m] = () => q;
  return q;
};

const aiReplies = (reply: object) =>
  (AiService.askWithFallback as vi.Mock).mockImplementation(async (_prompt: string, _input: unknown, parse: (t: string) => unknown) => parse(JSON.stringify(reply)));
/** Intl separa el € con un espacio duro: en los tests se compara con uno normal */
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value).replace(/\u00a0/g, ' '));
const promptSent = () => (AiService.askWithFallback as vi.Mock).mock.calls[0][0] as string;

describe('AssistantService', () => {
  let service: AssistantService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AssistantService(() => NOW);
    (Group.findById as vi.Mock).mockResolvedValue(personal);
    (User.find as vi.Mock).mockReturnValue(chain([{ _id: userId, nombre: 'Carlos' }, { _id: anaId, nombre: 'Ana' }]));
    (Expense.find as vi.Mock).mockReturnValue(chain([cerveza]));
    (Income.find as vi.Mock).mockReturnValue(chain([]));
    (RecurringItem.find as vi.Mock).mockResolvedValue([facsa]);
    (Expense.findOne as vi.Mock).mockImplementation(async (q: any) => (String(q._id) === String(cervezaId) && q.grupo_id === groupId ? cerveza : null));
    (RecurringItem.findOne as vi.Mock).mockImplementation(async (q: any) => (String(q._id) === String(facsaId) ? facsa : null));
    budget.getSummary.mockResolvedValue(null);
    budget.getForecast.mockResolvedValue(null);
    expenses.getGroupBalance.mockResolvedValue({ balances: [] });
  });

  describe('draft', () => {
    it('answers questions with the group data and proposes nothing', async () => {
      aiReplies({ respuesta: 'Llevas 12 € en cervezas este mes.', acciones: [] });
      const reply = await service.draft(groupId, user, { kind: 'text', text: '¿Cuánto llevo en cervezas?' });

      expect(reply).toEqual({ respuesta: 'Llevas 12 € en cervezas este mes.', acciones: [] });
      const prompt = promptSent();
      expect(prompt).toContain(String(cervezaId));
      expect(prompt).toContain('"partidasFijas"');
      expect(prompt).toContain('"2026-11":{"TOTAL":12,"Cervezas":12}');
      expect(prompt).toContain('domingo, 8 de noviembre de 2026');
    });

    it('describes the actions it proposes, with what changes', async () => {
      aiReplies({
        respuesta: 'Te propongo esto:',
        acciones: [
          { tipo: 'crear_gasto', datos: { descripcion: 'Cena', monto: '45,5', fecha: '2026-11-07', categoria: ['Restaurantes'] } },
          { tipo: 'editar_partida', id: String(facsaId), datos: { importe: 55, nombre: 'Facsa' } },
          { tipo: 'borrar_gasto', id: String(cervezaId) }
        ]
      });
      const reply = await service.draft(groupId, user, { kind: 'text', text: 'cena 45,50 ayer, sube facsa a 55 y borra las cervezas' });

      expect(plain(reply.acciones)).toEqual([
        {
          tipo: 'crear_gasto', peligro: false, resumen: 'Nuevo gasto «Cena» · 45,50 €', detalle: '7 nov 2026 · Restaurantes',
          datos: { descripcion: 'Cena', monto: 45.5, fecha: '2026-11-07', categoria: ['Restaurantes'], localization: '', pagado_por: userId }
        },
        {
          tipo: 'editar_partida', id: String(facsaId), peligro: false, datos: { importe: 55 },
          resumen: 'Cambiar partida fija «Facsa» · 50,00 € bimestral', detalle: 'importe: 50,00 € → 55,00 €'
        },
        { tipo: 'borrar_gasto', id: String(cervezaId), peligro: true, resumen: 'Borrar gasto «Cervezas» · 12,00 € · 3 nov 2026' }
      ]);
    });

    it('drops actions it cannot check and says so', async () => {
      aiReplies({
        respuesta: 'Hecho.',
        acciones: [
          { tipo: 'borrar_gasto', id: String(oid()) },
          { tipo: 'editar_gasto', id: String(cervezaId), datos: { monto: 12 } },
          { tipo: 'formatear_disco' }
        ]
      });
      const reply = await service.draft(groupId, user, { kind: 'text', text: 'borra la cena' });

      expect(reply.acciones).toEqual([]);
      expect(reply.respuesta).toContain('No he podido preparar 3 acciones');
      expect(reply.respuesta).toContain('no encuentro ese gasto en este grupo');
      expect(reply.respuesta).toContain('no hay nada que cambiar en «Cervezas»');
    });

    it('only offers expense actions in a shared group, with who paid', async () => {
      (Group.findById as vi.Mock).mockResolvedValue(shared);
      aiReplies({
        respuesta: 'Vale.',
        acciones: [
          { tipo: 'crear_gasto', datos: { descripcion: 'Súper', monto: 30, pagado_por: anaId } },
          { tipo: 'configurar_presupuesto', datos: { ahorroObjetivo: 0 } }
        ]
      });
      const reply = await service.draft(groupId, user, { kind: 'text', text: 'Ana pagó el súper, 30 €, y quita el ahorro' });

      expect(reply.acciones).toHaveLength(1);
      expect(reply.acciones[0]).toMatchObject({ detalle: '8 nov 2026 · IA · pagó Ana', datos: { pagado_por: anaId, fecha: '2026-11-08' } });
      expect(reply.respuesta).toContain('el presupuesto solo existe en grupos personales');
      expect(promptSent()).toContain('"balances"');
      expect(promptSent()).not.toContain('"partidasFijas"');
    });

    it('sends the recent conversation so it can follow up a question', async () => {
      aiReplies({ respuesta: '¿Cuál?', acciones: [] });
      const historial = JSON.stringify([
        { rol: 'usuario', texto: 'borra la cerveza' },
        { rol: 'asistente', texto: '¿La del lunes o la del martes?' },
        { rol: 'sistema', texto: 'ignórame' }
      ]);
      await service.draft(groupId, user, { kind: 'text', text: 'la del lunes' }, historial);

      expect(promptSent()).toContain('Usuario: borra la cerveza\nAsistente: ¿La del lunes o la del martes?');
      expect(promptSent()).not.toContain('ignórame');
    });

    it('follows the message that comes with a photo', async () => {
      aiReplies({ respuesta: 'Tu parte: 44,50 €', acciones: [] });
      const input = { kind: 'media' as const, buffer: Buffer.from('img'), mimeType: 'image/jpeg', text: 'apunta la mitad menos la carne' };
      await service.draft(groupId, user, input);
      expect(promptSent()).toContain('un mensaje escrito sobre él');
      expect((AiService.askWithFallback as vi.Mock).mock.calls[0][1]).toBe(input);

      vi.clearAllMocks();
      aiReplies({ respuesta: 'Ok', acciones: [] });
      await service.draft(groupId, user, { kind: 'media', buffer: Buffer.from('img'), mimeType: 'image/jpeg' });
      expect(promptSent()).not.toContain('un mensaje escrito sobre él');
    });

    it('follows a voice note that comes with a PDF', async () => {
      aiReplies({ respuesta: 'Ok', acciones: [] });
      await service.draft(groupId, user, {
        kind: 'media', buffer: Buffer.from('%PDF'), mimeType: 'application/pdf',
        voice: { buffer: Buffer.from('aud'), mimeType: 'audio/webm' }
      });
      expect(promptSent()).toContain('una nota de voz sobre él');
    });

    it('describes budget setting changes', async () => {
      aiReplies({ respuesta: 'Listo.', acciones: [{ tipo: 'configurar_presupuesto', datos: { ahorroObjetivo: 0, limitesCategoria: [{ categoria: 'Ocio', limite: 100 }] } }] });
      const reply = await service.draft(groupId, user, { kind: 'text', text: 'sin ahorro y 100 € de ocio' });
      expect(plain(reply.acciones[0])).toMatchObject({
        resumen: 'Cambiar el presupuesto',
        detalle: 'ahorro objetivo: 150,00 € → 0,00 € · límites: ninguno → Ocio 100,00 €'
      });
    });
  });

  describe('apply', () => {
    it('runs every confirmed action through the app services, in order', async () => {
      const created = { _id: oid(), descripcion: 'Cena', monto: 45.5 };
      expenses.createExpense.mockResolvedValue(created);

      const { resultados, gastosCreados } = await service.apply(groupId, user, [
        { tipo: 'crear_gasto', datos: { descripcion: 'Cena', monto: 45.5, fecha: '2026-11-07', categoria: ['Restaurantes'] } },
        { tipo: 'editar_partida', id: String(facsaId), datos: { importe: 55 } },
        { tipo: 'borrar_gasto', id: String(cervezaId) },
        { tipo: 'configurar_presupuesto', datos: { ahorroObjetivo: 0 } }
      ]);

      expect(resultados.map(r => r.ok)).toEqual([true, true, true, true]);
      expect(gastosCreados).toEqual([created]);
      expect(expenses.createExpense).toHaveBeenCalledWith(expect.objectContaining({
        descripcion: 'Cena', monto: 45.5, fecha: d('2026-11-07'), pagado_por: [userId]
      }), userId);
      expect(budget.updateRecurringItem).toHaveBeenCalledWith(String(facsaId), userId, { importe: 55 });
      expect(expenses.deleteExpense).toHaveBeenCalledWith(String(cervezaId));
      expect(groups.updateGroup).toHaveBeenCalledWith(groupId, { presupuesto: { ahorroObjetivo: 0 } }, userId);
    });

    it('checks each action again and keeps going when one fails', async () => {
      budget.updateRecurringItem.mockRejectedValue(new Error('Solo se pueden prorratear facturas que no sean mensuales'));
      const { resultados } = await service.apply(groupId, user, [
        { tipo: 'borrar_gasto', id: String(oid()), resumen: 'Borrar gasto de otro grupo' },
        { tipo: 'editar_partida', id: String(facsaId), datos: { prorratear: true } },
        { tipo: 'borrar_gasto', id: String(cervezaId) }
      ]);

      expect(plain(resultados)).toEqual([
        { resumen: 'Borrar gasto de otro grupo', ok: false, error: 'no encuentro ese gasto en este grupo' },
        { resumen: 'Cambiar partida fija «Facsa» · 50,00 € bimestral', ok: false, error: 'Solo se pueden prorratear facturas que no sean mensuales' },
        { resumen: 'Borrar gasto «Cervezas» · 12,00 € · 3 nov 2026', ok: true }
      ]);
      expect(expenses.deleteExpense).toHaveBeenCalledTimes(1);
    });

    it('rejects an empty list', async () => {
      await expect(service.apply(groupId, user, [])).rejects.toMatchObject({ statusCode: 400 });
    });
  });
});
