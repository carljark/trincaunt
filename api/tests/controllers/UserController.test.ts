// Mock process.env *before* any imports that might use it
const originalEnv = process.env;
process.env = { ...originalEnv, JWT_SECRET: 'test_secret' };

import { Request, Response, NextFunction } from 'express';
import { register, login, forgotPassword } from '../../src/controllers/UserController';
import { UserService } from '../../src/services/UserService';
import { AppError } from '../../src/utils/AppError';

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
  describe('login', () => {
    const loginMock = () => UserService.prototype.login as vi.Mock;
    const wrong = () => loginMock().mockRejectedValue(new AppError('Credenciales incorrectas', 401));

    it('blocks an email after 10 failed logins, from any IP', async () => {
      wrong();
      for (let i = 0; i < 10; i++) {
        const next = mockNext();
        await login(mockRequest({ email: 'Bob@example.com', password: 'mal' }, `10.2.0.${i}`), mockResponse(), next);
        expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
      }
      loginMock().mockClear();
      const res = mockResponse();
      await login(mockRequest({ email: 'bob@example.com', password: 'buena' }, '10.2.0.99'), res, mockNext());
      expect(res.status).toHaveBeenCalledWith(429);
      expect(loginMock()).not.toHaveBeenCalled();
    });

    it('blocks an IP after 20 failed logins', async () => {
      wrong();
      for (let i = 0; i < 20; i++) {
        await login(mockRequest({ email: `user${i}@example.com`, password: 'mal' }, '10.3.0.1'), mockResponse(), mockNext());
      }
      const res = mockResponse();
      await login(mockRequest({ email: 'otro@example.com', password: 'mal' }, '10.3.0.1'), res, mockNext());
      expect(res.status).toHaveBeenCalledWith(429);
    });

    it('a successful login clears the email counter', async () => {
      wrong();
      for (let i = 0; i < 9; i++) {
        await login(mockRequest({ email: 'cris@example.com', password: 'mal' }, `10.4.0.${i}`), mockResponse(), mockNext());
      }
      loginMock().mockResolvedValue({ token: 't', user: {} });
      const ok = mockResponse();
      await login(mockRequest({ email: 'cris@example.com', password: 'buena' }, '10.4.1.1'), ok, mockNext());
      expect(ok.status).toHaveBeenCalledWith(200);
      wrong();
      for (let i = 0; i < 9; i++) {
        const res = mockResponse();
        await login(mockRequest({ email: 'cris@example.com', password: 'mal' }, `10.4.2.${i}`), res, mockNext());
        expect(res.status).not.toHaveBeenCalledWith(429);
      }
    });

    it('other errors do not count', async () => {
      loginMock().mockRejectedValue(new AppError('JWT_SECRET no está definido', 500));
      for (let i = 0; i < 12; i++) {
        const res = mockResponse();
        await login(mockRequest({ email: 'dani@example.com', password: 'x' }, '10.5.0.1'), res, mockNext());
        expect(res.status).not.toHaveBeenCalledWith(429);
      }
    });
  });

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
