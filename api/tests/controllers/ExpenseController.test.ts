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
      parseExpenseFromText: vi.fn()
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
