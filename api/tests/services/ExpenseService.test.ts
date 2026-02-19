import { ExpenseService } from '../../src/services/ExpenseService';
import Expense from '../../src/models/Expense';
import Group from '../../src/models/Group';
import { AppError } from '../../src/utils/AppError';

jest.mock('../../src/models/Expense');
jest.mock('../../src/models/Group');


const ExpenseMock = Expense as jest.Mocked<typeof Expense>;
const GroupMock = Group as jest.Mocked<typeof Group>;

describe('ExpenseService', () => {
  let expenseService: ExpenseService;

  beforeEach(() => {
    expenseService = new ExpenseService();
    jest.clearAllMocks();
  });

  describe('createExpense', () => {
    const userId = 'user-123';
    const groupMembers = [userId, 'user-456'];
    const mockGroup = { _id: 'group-123', miembros: groupMembers };
    const expenseData = {
      descripcion: 'Test Expense',
      monto: 100,
      grupo_id: 'group-123',
      categoria: 'comida',
    };

    it('should create an expense with all group members as participants if not specified', async () => {
      GroupMock.findById.mockResolvedValue(mockGroup as any);
      ExpenseMock.create.mockImplementation((data) => Promise.resolve(data as any));

      const result = await expenseService.createExpense(expenseData as any, userId);

      expect(Group.findById).toHaveBeenCalledWith(expenseData.grupo_id);
      expect(Expense.create).toHaveBeenCalledWith({
        ...expenseData,
        pagado_por: userId,
        participantes: groupMembers,
        asume_gasto: false,
      });
      expect(result.participantes).toEqual(groupMembers);
    });

    it('should create an expense with specified participants', async () => {
        const specificParticipants = ['user-456'];
        const expenseDataWithParticipants = { ...expenseData, participantes: specificParticipants };
        GroupMock.findById.mockResolvedValue(mockGroup as any);
        ExpenseMock.create.mockImplementation((data) => Promise.resolve(data as any));

        const result = await expenseService.createExpense(expenseDataWithParticipants as any, userId);

        expect(Expense.create).toHaveBeenCalledWith({
            ...expenseData,
            pagado_por: userId,
            participantes: specificParticipants,
            asume_gasto: false,
        });
        expect(result.participantes).toEqual(specificParticipants);
    });

    it('should throw error if group not found', async () => {
      GroupMock.findById.mockResolvedValue(null);

      await expect(expenseService.createExpense(expenseData as any, userId)).rejects.toThrow(
        new AppError('Grupo no encontrado', 404)
      );
    });

    it('should throw error if payer is not a group member', async () => {
      const nonMemberUserId = 'user-789';
      GroupMock.findById.mockResolvedValue(mockGroup as any);

      await expect(expenseService.createExpense(expenseData as any, nonMemberUserId)).rejects.toThrow(
        new AppError('El usuario que paga no pertenece al grupo', 403)
      );
    });
    
    it('should throw error if amount is zero or less', async () => {
        GroupMock.findById.mockResolvedValue(mockGroup as any);
  
        await expect(expenseService.createExpense({ ...expenseData, monto: 0 } as any, userId)).rejects.toThrow(
          new AppError('El monto debe ser mayor a 0', 400)
        );
      });
  });

  describe('getExpensesByGroup', () => {
    it('should return populated expenses for a group', async () => {
      const groupId = 'group-123';
      const expenses = [{ description: 'Expense 1' }, { description: 'Expense 2' }];
      
      ExpenseMock.find.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          populate: jest.fn().mockResolvedValue(expenses),
        }),
      } as any);

      const result = await expenseService.getExpensesByGroup(groupId);

      expect(Expense.find).toHaveBeenCalledWith({ grupo_id: groupId });
      expect(result).toEqual(expenses);
    });
  });

  describe('updateExpense', () => {
    const expenseId = 'expense-123';
    const existingExpense = {
        _id: expenseId,
        descripcion: 'Old Description',
        monto: 50,
        categoria: 'comida',
        save: jest.fn().mockResolvedValue(this),
    };

    it('should update an expense with new data', async () => {
        const updateData = {
            descripcion: 'New Description',
            monto: 150,
            categoria: 'ocio',
        };

        (ExpenseMock.findById as jest.Mock).mockResolvedValue({
            ...existingExpense,
            ...updateData,
            save: jest.fn().mockResolvedValue(true),
        });

        const result = await expenseService.updateExpense(expenseId, updateData as any);
        
        expect(Expense.findById).toHaveBeenCalledWith(expenseId);
        if (result) {
            expect(result.descripcion).toBe(updateData.descripcion);
            expect(result.monto).toBe(updateData.monto);
            expect(result.categoria).toBe(updateData.categoria);
        }
    });

    it('should throw an error if expense not found', async () => {
        ExpenseMock.findById.mockResolvedValue(null);
        await expect(expenseService.updateExpense(expenseId, {})).rejects.toThrow(
            new AppError('Gasto no encontrado', 404)
        );
    });

    it('should throw an error if amount is zero or less', async () => {
        ExpenseMock.findById.mockResolvedValue(existingExpense as any);
        await expect(expenseService.updateExpense(expenseId, { monto: 0 } as any)).rejects.toThrow(
            new AppError('El monto debe ser mayor a 0', 400)
        );
    });
  });

  describe('getChartExpenses', () => {
    const groupId = '60e0f3e2e3e2e3e2e3e2e3e2'; // Valid ObjectId string

    it('should return aggregated expense data without filters', async () => {
      const mockChartData = [
        { date: '2023-01-01', totalAmount: 100 },
        { date: '2023-01-02', totalAmount: 200 },
      ];
      ExpenseMock.aggregate.mockResolvedValue(mockChartData);

      const result = await expenseService.getChartExpenses(groupId);

      expect(ExpenseMock.aggregate).toHaveBeenCalledWith(expect.arrayContaining([
        { $match: { grupo_id: new (require('mongoose')).Types.ObjectId(groupId) } },
        { $group: expect.any(Object) },
        { $sort: { _id: 1 } },
        { $project: expect.any(Object) },
      ]));
      expect(result).toEqual(mockChartData);
    });

    it('should return aggregated expense data with start and end date filters', async () => {
      const startDate = '2023-01-01';
      const endDate = '2023-01-01';
      const mockChartData = [{ date: '2023-01-01', totalAmount: 150 }];
      ExpenseMock.aggregate.mockResolvedValue(mockChartData);

      const result = await expenseService.getChartExpenses(groupId, startDate, endDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);

      expect(ExpenseMock.aggregate).toHaveBeenCalledWith(expect.arrayContaining([
        { $match: {
            grupo_id: new (require('mongoose')).Types.ObjectId(groupId),
            fecha: { '$gte': new Date(startDate), '$lte': end }
        }},
        { $group: expect.any(Object) },
        { $sort: { _id: 1 } },
        { $project: expect.any(Object) },
      ]));
      expect(result).toEqual(mockChartData);
    });

    it('should return aggregated expense data with weekday filter', async () => {
      const weekdays = [1, 2]; // Monday, Tuesday
      const mockChartData = [{ date: '2023-01-02', totalAmount: 75 }];
      ExpenseMock.aggregate.mockResolvedValue(mockChartData);

      const result = await expenseService.getChartExpenses(groupId, undefined, undefined, weekdays);
      
      expect(ExpenseMock.aggregate).toHaveBeenCalledWith(expect.arrayContaining([
        { $match: {
            grupo_id: new (require('mongoose')).Types.ObjectId(groupId),
            $expr: { '$in': [{ '$dayOfWeek': '$fecha' }, [2, 3]] } // MongoDB's dayOfWeek for Mon, Tue
        }},
        { $group: expect.any(Object) },
        { $sort: { _id: 1 } },
        { $project: expect.any(Object) },
      ]));
      expect(result).toEqual(mockChartData);
    });

    it('should return aggregated expense data with all filters combined', async () => {
      const startDate = '2023-01-01';
      const endDate = '2023-01-07';
      const weekdays = [0, 6]; // Sunday, Saturday
      const mockChartData = [{ date: '2023-01-01', totalAmount: 50 }, { date: '2023-01-07', totalAmount: 120 }];
      ExpenseMock.aggregate.mockResolvedValue(mockChartData);

      const result = await expenseService.getChartExpenses(groupId, startDate, endDate, weekdays);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);

      expect(ExpenseMock.aggregate).toHaveBeenCalledWith(expect.arrayContaining([
        { $match: {
            grupo_id: new (require('mongoose')).Types.ObjectId(groupId),
            fecha: { '$gte': new Date(startDate), '$lte': end },
            $expr: { '$in': [{ '$dayOfWeek': '$fecha' }, [1, 7]] } // MongoDB's dayOfWeek for Sun, Sat
        }},
        { $group: expect.any(Object) },
        { $sort: { _id: 1 } },
        { $project: expect.any(Object) },
      ]));
      expect(result).toEqual(mockChartData);
    });

    it('should return an empty array if no expenses match the criteria', async () => {
      ExpenseMock.aggregate.mockResolvedValue([]);

      const result = await expenseService.getChartExpenses(groupId, '2024-01-01', '2024-01-01', [0]);

      expect(result).toEqual([]);
    });
  });
});

