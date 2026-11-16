import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import * as ExpenseController from '../../src/controllers/ExpenseController';
import AiService from '../../src/services/AiService';
import PushService from '../../src/services/PushService';
import BudgetAlertService from '../../src/services/BudgetAlertService';

vi.mock('../../src/services/AiService', () => {
  return {
    default: {
      parseExpenseFromMedia: vi.fn(),
      parseExpenseFromText: vi.fn(),
      parseReceipt: vi.fn()
    }
  };
});

vi.mock('../../src/services/PushService', () => ({
  default: { notifyGroupMembers: vi.fn() },
  formatAmount: (amount: number) => `${amount} €`
}));

vi.mock('../../src/services/BudgetAlertService', () => ({
  default: { checkAfterExpenseChange: vi.fn() }
}));

vi.mock('../../src/config/socket', () => ({
  getIO: vi.fn().mockReturnValue({
    to: vi.fn().mockReturnValue({ emit: vi.fn() })
  })
}));

describe('ExpenseController (TDD)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockRequest = (file?: any) => {
    const req: Partial<Request> = {
      file,
      user: { id: 'user123', email: 'test@test.com', role: 'admin' }
    } as any;
    return req as Request;
  };

  const mockResponse = () => {
    const res: Partial<Response> = {};
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    return res as Response;
  };

  const mockNext = () => vi.fn() as NextFunction;

  describe('draftExpensesWithAI', () => {
    const group = { _id: 'group123', miembros: ['user123', 'user456'] };
    const mockDraftResponse = () => {
      const res = mockResponse();
      (res as any).locals = { group };
      return res;
    };

    beforeEach(async () => {
      const User = (await import('../../src/models/User')).default;
      vi.spyOn(User, 'find').mockReturnValue({
        select: () => ({ lean: () => Promise.resolve([{ _id: 'user123', nombre: 'Carlos' }, { _id: 'user456', nombre: 'Ana' }]) })
      } as any);
    });

    it('debería fallar si no llega ni archivo ni texto', async () => {
      const req = mockRequest();
      req.body = { grupo_id: 'group123' };
      const next = mockNext();

      await ExpenseController.draftExpensesWithAI(req, mockDraftResponse(), next);

      const errorArg = vi.mocked(next).mock.calls[0][0];
      expect(errorArg.message).toBe('Escribe un mensaje o adjunta una foto o un audio');
      expect(errorArg.statusCode).toBe(400);
    });

    it('debería rechazar a quien no tiene la IA activada', async () => {
      const req = mockRequest();
      (req as any).user = { id: 'user123', role: 'user', aiEnabled: false };
      req.body = { grupo_id: 'group123', texto: 'Cena 20 €' };
      const next = mockNext();

      await ExpenseController.draftExpensesWithAI(req, mockDraftResponse(), next);

      expect(vi.mocked(next).mock.calls[0][0].statusCode).toBe(403);
    });

    it('debería devolver borradores de un archivo sin guardar nada', async () => {
      const fakeFile = { buffer: Buffer.from('fake data'), mimetype: 'image/jpeg' };
      const req = mockRequest(fakeFile);
      req.body = { grupo_id: 'group123', localization: 'Calle Mayor, Madrid' };
      const res = mockDraftResponse();
      const next = mockNext();

      vi.mocked(AiService.parseExpenseFromMedia).mockResolvedValue([
        { descripcion: 'Pizza', monto: 12.5, fecha: '2026-11-06T12:00:00Z', categoria: ['Pizza'] },
        { descripcion: 'Bebida', monto: 3.456 }
      ]);
      const { ExpenseService } = await import('../../src/services/ExpenseService');
      const createSpy = vi.spyOn(ExpenseService.prototype, 'createExpense');

      await ExpenseController.draftExpensesWithAI(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(AiService.parseExpenseFromMedia).toHaveBeenCalledWith(fakeFile.buffer, fakeFile.mimetype, [
        { id: 'user123', nombre: 'Carlos' },
        { id: 'user456', nombre: 'Ana' }
      ]);
      expect(createSpy).not.toHaveBeenCalled();
      expect(PushService.notifyGroupMembers).not.toHaveBeenCalled();
      const drafts = vi.mocked(res.json).mock.calls[0][0].data;
      expect(drafts[0]).toMatchObject({ descripcion: 'Pizza', monto: 12.5, fecha: '2026-11-06', categoria: ['Pizza'], pagado_por: 'user123', localization: 'Calle Mayor, Madrid' });
      expect(drafts[1]).toMatchObject({ descripcion: 'Bebida', monto: 3.46, categoria: ['IA'] });
    });

    it('debería leer un mensaje de texto y respetar quién pagó si es del grupo', async () => {
      const req = mockRequest();
      req.body = { grupo_id: 'group123', texto: '  Ana pagó la cena, 40 €  ' };
      const res = mockDraftResponse();

      vi.mocked(AiService.parseExpenseFromText).mockResolvedValue([
        { descripcion: 'Cena', monto: 40, pagado_por: 'user456' },
        { descripcion: 'Taxi', monto: 10, pagado_por: 'intruso' }
      ]);

      await ExpenseController.draftExpensesWithAI(req, res, mockNext());

      expect(AiService.parseExpenseFromText).toHaveBeenCalledWith('Ana pagó la cena, 40 €', expect.any(Array));
      const drafts = vi.mocked(res.json).mock.calls[0][0].data;
      expect(drafts[0].pagado_por).toBe('user456');
      // Un id que no es del grupo se cambia por quien lo envía
      expect(drafts[1].pagado_por).toBe('user123');
    });
  });

  describe('createExpense', () => {
    it('answers 200 without notifying when the origin was already sent', async () => {
      const { ExpenseService } = await import('../../src/services/ExpenseService');
      vi.spyOn(ExpenseService.prototype, 'createOrFindExpense').mockResolvedValue({ expense: { _id: 'e1' } as any, duplicado: true });
      const req = mockRequest();
      req.body = { grupo_id: 'group123', descripcion: 'Compra', monto: 10, origen: { app: 'cgsshoppings', ref: 'p1' } };
      const res = mockResponse();

      await ExpenseController.createExpense(req, res, mockNext());

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ status: 'success', data: { _id: 'e1' }, duplicado: true });
      expect(PushService.notifyGroupMembers).not.toHaveBeenCalled();
      expect(BudgetAlertService.checkAfterExpenseChange).not.toHaveBeenCalled();
    });

    it('answers 201 and notifies a new expense', async () => {
      const { ExpenseService } = await import('../../src/services/ExpenseService');
      vi.spyOn(ExpenseService.prototype, 'createOrFindExpense').mockResolvedValue({ expense: { _id: 'e2' } as any, duplicado: false });
      const req = mockRequest();
      req.body = { grupo_id: 'group123', descripcion: 'Compra', monto: 10 };
      const res = mockResponse();

      await ExpenseController.createExpense(req, res, mockNext());

      expect(res.status).toHaveBeenCalledWith(201);
      expect(PushService.notifyGroupMembers).toHaveBeenCalled();
      expect(BudgetAlertService.checkAfterExpenseChange).toHaveBeenCalledWith(['group123']);
    });
  });

  describe('createExpenseFromReceipt', () => {
    const ticket = { buffer: Buffer.from('foto'), mimetype: 'image/jpeg' };
    const body = {
      grupo_id: 'group123', descripcion: 'Compra en Mercadona (3 artículos)', fecha: '2026-11-16',
      categoria: ['Supermercado'], assumeExpense: true, origen: { app: 'cgsshoppings', ref: 'p1' },
    };
    const receipt = {
      tienda: 'Mercadona', total: 10.01,
      lineas: [{ texto: 'A', importe: 3.33 }, { texto: 'B', importe: 3.33 }, { texto: 'C', importe: 3.35 }],
    };

    const setup = async (extra: Record<string, unknown> = {}, user: Record<string, unknown> = {}) => {
      const { ExpenseService } = await import('../../src/services/ExpenseService');
      const findByOrigen = vi.spyOn(ExpenseService.prototype, 'findByOrigen').mockResolvedValue(null);
      const createOrFind = vi.spyOn(ExpenseService.prototype, 'createOrFindExpense')
        .mockImplementation(async (data: any, _userId, extraFields) => ({ expense: { ...data, ...extraFields } as any, duplicado: false }));
      const req = mockRequest(ticket);
      Object.assign((req as any).user, { nombre: 'Carlos' }, user);
      req.body = { ...body, ...extra };
      const res = mockResponse();
      const next = mockNext();
      return { req, res, next, findByOrigen, createOrFind };
    };

    it('parseReceiptForm moves the datos JSON into the body', () => {
      const req = { body: { datos: JSON.stringify(body) } } as Request;
      const next = mockNext();
      ExpenseController.parseReceiptForm(req, mockResponse(), next);
      expect(req.body).toEqual(body);
      expect(next).toHaveBeenCalledWith();

      const bad = { body: { datos: '[1]' } } as Request;
      ExpenseController.parseReceiptForm(bad, mockResponse(), next);
      expect(next).toHaveBeenLastCalledWith(expect.objectContaining({ statusCode: 400 }));
    });

    it('creates one expense with the lines and returns the full ticket', async () => {
      vi.mocked(AiService.parseReceipt).mockResolvedValue(receipt);
      const { req, res, createOrFind } = await setup();

      await ExpenseController.createExpenseFromReceipt(req, res, mockNext());

      expect(createOrFind).toHaveBeenCalledWith(
        expect.objectContaining({ monto: 10.01, localization: 'Mercadona', origen: { app: 'cgsshoppings', ref: 'p1' }, assumeExpense: true }),
        'user123',
        { lineas: [{ texto: 'A', importe: 3.33 }, { texto: 'B', importe: 3.33 }, { texto: 'C', importe: 3.35 }], parte: undefined }
      );
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ticket: receipt, lineasDescartadas: false }));
      expect(BudgetAlertService.checkAfterExpenseChange).toHaveBeenCalledWith(['group123']);
    });

    it('half records half of the ticket', async () => {
      vi.mocked(AiService.parseReceipt).mockResolvedValue(receipt);
      const { req, res, createOrFind } = await setup({ parte: 0.5 });

      await ExpenseController.createExpenseFromReceipt(req, res, mockNext());

      const [data, , extra] = createOrFind.mock.calls[0];
      expect(data.monto).toBe(5.01);
      expect(extra!.parte).toBe(0.5);
      expect(Math.round(extra!.lineas!.reduce((a, l) => a + l.importe * 100, 0))).toBe(501);
    });

    it('a repeated origin answers 200 without calling the AI', async () => {
      const { req, res, findByOrigen } = await setup();
      findByOrigen.mockResolvedValue({ _id: 'e1' } as any);

      await ExpenseController.createExpenseFromReceipt(req, res, mockNext());

      expect(AiService.parseReceipt).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ status: 'success', data: { _id: 'e1' }, duplicado: true });
    });

    it('without AI it is a 403 with its own code', async () => {
      const { req, res, next } = await setup({}, { role: 'user', aiEnabled: false });

      await ExpenseController.createExpenseFromReceipt(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403, codigo: 'ia_desactivada' }));
      expect(AiService.parseReceipt).not.toHaveBeenCalled();
    });

    it('a ticket without a total is a 422', async () => {
      vi.mocked(AiService.parseReceipt).mockResolvedValue({ total: 0, lineas: [] });
      const { req, res, next, createOrFind } = await setup();

      await ExpenseController.createExpenseFromReceipt(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 422, codigo: 'ticket_ilegible' }));
      expect(createOrFind).not.toHaveBeenCalled();
    });

    it('rejects a missing ticket, other file types and a wrong share', async () => {
      for (const [extra, file] of [[{}, undefined], [{}, { ...ticket, mimetype: 'audio/mpeg' }], [{ parte: 0.3 }, ticket]] as const) {
        const { req, res, next } = await setup(extra);
        (req as any).file = file;
        await ExpenseController.createExpenseFromReceipt(req, res, next);
        expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
      }
    });
  });

  describe('createExpensesBatch', () => {
    it('debería guardar todos los gastos con un único aviso push', async () => {
      const req = mockRequest();
      (req as any).user.nombre = 'Carlos';
      req.body = {
        grupo_id: 'group123',
        gastos: [
          { descripcion: 'Pizza', monto: 12.5, fecha: '2026-11-06', categoria: ['Pizza'], pagado_por: 'user456' },
          { descripcion: 'Bebida', monto: 3.5 }
        ]
      };
      const res = mockResponse();
      const next = mockNext();

      const { ExpenseService } = await import('../../src/services/ExpenseService');
      const createSpy = vi.spyOn(ExpenseService.prototype, 'createExpense').mockResolvedValue({ monto: 1 } as any);

      await ExpenseController.createExpensesBatch(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(createSpy).toHaveBeenCalledTimes(2);
      expect(createSpy.mock.calls[0][0]).toMatchObject({ descripcion: 'Pizza', pagado_por: ['user456'], grupo_id: 'group123' });
      expect(createSpy.mock.calls[1][0]).toMatchObject({ descripcion: 'Bebida', pagado_por: ['user123'] });
      expect(PushService.notifyGroupMembers).toHaveBeenCalledTimes(1);
      expect(PushService.notifyGroupMembers).toHaveBeenCalledWith('group123', 'user123', expect.any(Function));
      expect(BudgetAlertService.checkAfterExpenseChange).toHaveBeenCalledWith(['group123']);
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('debería rechazar el lote entero si un gasto no es válido', async () => {
      const req = mockRequest();
      req.body = { grupo_id: 'group123', gastos: [{ descripcion: 'Pizza', monto: 12 }, { descripcion: '', monto: 0 }] };
      const next = mockNext();
      const { ExpenseService } = await import('../../src/services/ExpenseService');
      const createSpy = vi.spyOn(ExpenseService.prototype, 'createExpense').mockResolvedValue({} as any);
      createSpy.mockClear();

      await ExpenseController.createExpensesBatch(req, mockResponse(), next);

      expect(vi.mocked(next).mock.calls[0][0].statusCode).toBe(400);
      expect(createSpy).not.toHaveBeenCalled();
    });
  });
});
