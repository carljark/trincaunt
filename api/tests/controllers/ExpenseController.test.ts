import { Request, Response, NextFunction } from 'express';
import { createExpense, getGroupExpenses } from '../../src/controllers/ExpenseController';
import { ExpenseService } from '../../src/services/ExpenseService';

jest.mock('../../src/services/ExpenseService');

const mockRequest = (body: any, params: any = {}, headers: any = {}) => ({
  body,
  params,
  headers,
}) as Request;

const mockResponse = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res as Response;
};

const mockNext = () => jest.fn() as NextFunction;

describe('ExpenseController', () => {
  let req: Request;
  let res: Response;
  let next: NextFunction;

  beforeEach(() => {
    res = mockResponse();
    next = mockNext();
    jest.clearAllMocks();
  });

  describe('createExpense', () => {
    it('should create an expense and return it with status 201', async () => {
      const expenseData = {
        description: 'Dinner',
        amount: 50,
        groupId: 'group-123',
      };
      req = mockRequest(expenseData, {}, { 'user-id': 'user-123' });
      const expense = { ...expenseData, _id: 'expense-123', paidBy: 'user-123' };
      (ExpenseService.prototype.createExpense as jest.Mock).mockResolvedValue(expense);

      await createExpense(req, res, next);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({ status: 'success', data: expense });
      expect(ExpenseService.prototype.createExpense).toHaveBeenCalledWith(expenseData, 'user-123');
    });
  });

  describe('getGroupExpenses', () => {
    it('should return a list of expenses for the group with status 200', async () => {
      req = mockRequest({}, { groupId: 'group-123' });
      const expenses = [{ description: 'Lunch', amount: 20 }];
      (ExpenseService.prototype.getExpensesByGroup as jest.Mock).mockResolvedValue(expenses);

      await getGroupExpenses(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ status: 'success', data: expenses });
      expect(ExpenseService.prototype.getExpensesByGroup).toHaveBeenCalledWith('group-123');
    });
  });
});
