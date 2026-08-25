import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import * as ExpenseController from '../../src/controllers/ExpenseController';
import AiService from '../../src/services/AiService';

vi.mock('../../src/services/AiService', () => {
  return {
    default: {
      parseExpenseFromMedia: vi.fn()
    }
  };
});

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

  describe('parseExpenseWithAI', () => {
    it('debería fallar si no se proporciona ningún archivo', async () => {
      const req = mockRequest(); // Sin archivo
      const res = mockResponse();
      const next = mockNext();

      await ExpenseController.parseExpenseWithAI(req, res, next);
      
      expect(next).toHaveBeenCalled();
      const errorArg = vi.mocked(next).mock.calls[0][0];
      expect(errorArg.message).toBe('No se proporcionó ningún archivo de audio o imagen');
      expect(errorArg.statusCode).toBe(400);
    });

    it('debería procesar el archivo, devolver un array e insertarlos en la base de datos', async () => {
      const fakeFile = {
        buffer: Buffer.from('fake data'),
        mimetype: 'image/jpeg'
      };
      
      const req = mockRequest(fakeFile);
      req.body = {
        grupo_id: 'group123',
        participantes: ['user123', 'user456']
      };
      
      const res = mockResponse();
      const next = mockNext();

      const fakeParsedExpenses = [
        { descripcion: 'Pizza', monto: 12.5 },
        { descripcion: 'Bebida', monto: 3.5 }
      ];
      vi.mocked(AiService.parseExpenseFromMedia).mockResolvedValue(fakeParsedExpenses);
      
      const { ExpenseService } = await import('../../src/services/ExpenseService');
      const createSpy = vi.spyOn(ExpenseService.prototype, 'createExpense').mockResolvedValue({} as any);

      await ExpenseController.parseExpenseWithAI(req, res, next);

      expect(AiService.parseExpenseFromMedia).toHaveBeenCalledWith(fakeFile.buffer, fakeFile.mimetype, []);
      expect(createSpy).toHaveBeenCalledTimes(2);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ status: 'success' }));
    });
  });
});
