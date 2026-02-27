import { ExpenseService } from '../../src/services/ExpenseService';
import Expense from '../../src/models/Expense';
import CategoryAlias from '../../src/models/CategoryAlias';
import Group from '../../src/models/Group';

jest.mock('../../src/models/Expense');
jest.mock('../../src/models/CategoryAlias');
jest.mock('../../src/models/Group');

const ExpenseMock = Expense as jest.Mocked<typeof Expense>;
const CategoryAliasMock = CategoryAlias as jest.Mocked<typeof CategoryAlias>;
const GroupMock = Group as jest.Mocked<typeof Group>;

describe('ExpenseService Filtering', () => {
  let expenseService: ExpenseService;

  beforeEach(() => {
    expenseService = new ExpenseService();
    jest.clearAllMocks();
  });

  describe('getExpensesByGroup', () => {
    it('should filter by category including its aliases', async () => {
      const groupId = 'group-123';
      const categories = ['Food'];
      
      // Mock related aliases
      CategoryAliasMock.find.mockReturnValue({
        select: jest.fn().mockResolvedValue([
          { alias: 'Restaurant' },
          { alias: 'Supermarket' }
        ])
      } as any);

      // Mock Expense.find chain
      ExpenseMock.find.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
      } as any);

      await expenseService.getExpensesByGroup(groupId, categories);

      expect(CategoryAlias.find).toHaveBeenCalledWith({
        mainCategories: { $in: ['Food'] }
      });

      expect(Expense.find).toHaveBeenCalledWith({
        grupo_id: groupId,
        categoria: { $in: ['Food', 'Restaurant', 'Supermarket'] }
      });
    });

    it('should return all expenses if no categories are provided', async () => {
      const groupId = 'group-123';

      ExpenseMock.find.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
      } as any);

      await expenseService.getExpensesByGroup(groupId);

      expect(CategoryAlias.find).not.toHaveBeenCalled();
      expect(Expense.find).toHaveBeenCalledWith({ grupo_id: groupId });
    });
  });

  describe('getGlobalExpenses', () => {
    it('should filter global expenses by category including aliases', async () => {
      const userId = 'user-123';
      const categories = ['Leisure'];
      
      GroupMock.find.mockResolvedValue([{ _id: 'group-1' }] as any);
      
      CategoryAliasMock.find.mockReturnValue({
        select: jest.fn().mockResolvedValue([{ alias: 'Cinema' }])
      } as any);

      // Mock Expense.find chain with multiple populates
      const mockPopulate = jest.fn().mockReturnThis();
      ExpenseMock.find.mockReturnValue({
        populate: mockPopulate,
      } as any);
      mockPopulate.mockReturnValue({
        populate: mockPopulate,
      });
      mockPopulate.mockReturnValueOnce({
        populate: mockPopulate,
      }).mockReturnValueOnce({
        populate: mockPopulate,
      }).mockReturnValueOnce(Promise.resolve([]));

      await expenseService.getGlobalExpenses(userId, categories);

      expect(Expense.find).toHaveBeenCalledWith(expect.objectContaining({
        categoria: { $in: ['Leisure', 'Cinema'] }
      }));
    });
  });
});
