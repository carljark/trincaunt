// Mock process.env *before* any imports that might use it
const originalEnv = process.env;
process.env = { ...originalEnv, JWT_SECRET: 'test_secret' };

import { Request, Response, NextFunction } from 'express';
import { register, forgotPassword } from '../../src/controllers/UserController';
import { UserService } from '../../src/services/UserService';

vi.mock('../../src/services/UserService');

const mockRequest = (body: any, ip = '1.2.3.4') => ({
  body,
  ip,
}) as Request;

const mockResponse = () => {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response;
};

const mockNext = () => vi.fn() as NextFunction;

describe('UserController', () => {
  describe('forgotPassword', () => {
    it('answers the same whether or not the email exists, and limits by email', () => {
      const send = UserService.prototype.requestPasswordReset as vi.Mock;
      send.mockResolvedValue(undefined);
      for (let i = 0; i < 3; i++) {
        const res = mockResponse();
        forgotPassword(mockRequest({ email: 'Ana@example.com' }, `10.0.0.${i}`), res);
        expect(res.status).toHaveBeenCalledWith(200);
      }
      expect(send).toHaveBeenCalledTimes(3);
      const res = mockResponse();
      forgotPassword(mockRequest({ email: 'ana@example.com' }, '10.0.0.9'), res);
      expect(res.status).toHaveBeenCalledWith(429);
      expect(send).toHaveBeenCalledTimes(3);
    });

    it('limits requests per IP and skips invalid emails', () => {
      const send = UserService.prototype.requestPasswordReset as vi.Mock;
      send.mockClear();
      for (let i = 0; i < 5; i++) {
        const res = mockResponse();
        forgotPassword(mockRequest({ email: 'no-es-email' }, '10.1.1.1'), res);
        expect(res.status).toHaveBeenCalledWith(200);
      }
      const res = mockResponse();
      forgotPassword(mockRequest({ email: 'otra@example.com' }, '10.1.1.1'), res);
      expect(res.status).toHaveBeenCalledWith(429);
      expect(send).not.toHaveBeenCalled();
    });
  });

  describe('register', () => {
    it('should return a new user with status 201', async () => {
      const req = mockRequest({
        nombre: 'Test User',
        email: 'test@example.com',
        password: 'password123',
      });
      const res = mockResponse();
      const next = mockNext();

      const user = {
        _id: 'some-id',
        nombre: 'Test User',
        email: 'test@example.com',
      };

      (UserService.prototype.register as vi.Mock).mockResolvedValue(user);

      await register(req, res, next);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: {
          user: {
            id: user._id,
            nombre: user.nombre,
            email: user.email,
          },
        },
      });
    });
  });
});

afterAll(() => {
  process.env = originalEnv; // Restore original env after all tests are done
});
