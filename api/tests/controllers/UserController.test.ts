import { Request, Response, NextFunction } from 'express';
import { register } from '../../src/controllers/UserController';
import { UserService } from '../../src/services/UserService';

jest.mock('../../src/services/UserService');

const mockRequest = (body: any) => ({
  body,
}) as Request;

const mockResponse = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res as Response;
};

const mockNext = () => jest.fn() as NextFunction;

describe('UserController', () => {
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

      (UserService.prototype.register as jest.Mock).mockResolvedValue(user);

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
