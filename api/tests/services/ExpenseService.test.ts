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
});
