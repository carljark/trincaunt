import { ExpenseService } from '../../src/services/ExpenseService';
import Expense from '../../src/models/Expense';
import CategoryAlias from '../../src/models/CategoryAlias';
import Group from '../../src/models/Group';
import mongoose from 'mongoose';

vi.mock('../../src/models/Expense');
vi.mock('../../src/models/CategoryAlias');
vi.mock('../../src/models/Group');

const ExpenseMock = Expense as vi.Mocked<typeof Expense>;
const CategoryAliasMock = CategoryAlias as vi.Mocked<typeof CategoryAlias>;
const GroupMock = Group as vi.Mocked<typeof Group>;

describe('ExpenseService Filtering', () => {
  let expenseService: ExpenseService;

  beforeEach(() => {
    expenseService = new ExpenseService();
    vi.clearAllMocks();
  });

  describe('getExpensesByGroup', () => {
    it('should filter by category including its aliases', async () => {
      const groupId = 'group-123';
      const categories = ['Food'];
      
      // Mock related aliases
      CategoryAliasMock.find.mockReturnValue({
        select: vi.fn().mockResolvedValue([
          { alias: 'Restaurant' },
          { alias: 'Supermarket' }
        ])
      } as any);

      // Mock Expense.find chain
      ExpenseMock.find.mockReturnValue({
        populate: vi.fn().mockReturnThis(),
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
        populate: vi.fn().mockReturnThis(),
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
        select: vi.fn().mockResolvedValue([{ alias: 'Cinema' }])
      } as any);

      // Mock Expense.find chain with multiple populates
      const mockPopulate = vi.fn().mockReturnThis();
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

    it('leaves personal budget groups out of the global share', async () => {
      GroupMock.find.mockResolvedValue([{ _id: 'shared-1' }] as any);
      const populate = vi.fn();
      populate.mockReturnValueOnce({ populate }).mockReturnValueOnce({ populate }).mockReturnValueOnce(Promise.resolve([]));
      ExpenseMock.find.mockReturnValue({ populate } as any);

      await expenseService.getGlobalExpenses('user-123');

      expect(Group.find).toHaveBeenCalledWith({ miembros: 'user-123', tipo: { $ne: 'personal' } });
      expect(Expense.find).toHaveBeenCalledWith(expect.objectContaining({ grupo_id: { $in: ['shared-1'] } }));
    });
  });

  describe('Aggregation Methods', () => {
    it('getExpenseCategories should aggregate unique categories with counts', async () => {
      ExpenseMock.aggregate.mockResolvedValue([
        { category: 'Food', count: 10 },
        { category: 'Transport', count: 5 }
      ]);

      const groupId = new mongoose.Types.ObjectId();
      const result = await expenseService.getExpenseCategories([groupId.toString()]);
      expect((Expense.aggregate as any).mock.calls[0][0][0]).toEqual({ $match: { grupo_id: { $in: [groupId] } } });

      expect(result).toHaveLength(2);
      expect(result[0].category).toBe('Food');
      expect(Expense.aggregate).toHaveBeenCalledWith(expect.arrayContaining([
        { $unwind: "$categoria" },
        { $match: { categoria: { $nin: [null, ""] } } },
        { $group: { _id: "$categoria", count: { $sum: 1 } } },
      ]));
    });

    it('getExpenseLocations should aggregate unique locations with counts', async () => {
      ExpenseMock.aggregate.mockResolvedValue([
        { localization: 'Supermarket', count: 5 },
        { localization: 'Gas Station', count: 2 }
      ]);

      const groupId = new mongoose.Types.ObjectId();
      const result = await expenseService.getExpenseLocations([groupId.toString()]);

      expect(result).toHaveLength(2);
      expect(result[0].localization).toBe('Supermarket');
      // Solo los grupos del usuario, no toda la base de datos
      expect(Expense.aggregate).toHaveBeenCalledWith(expect.arrayContaining([
        { $match: { grupo_id: { $in: [groupId] }, localization: { $nin: [null, ""] } } },
        { $group: { _id: "$localization", count: { $sum: 1 } } },
      ]));
    });
  });

  describe('getChartExpenses', () => {
    it('matches the place literally, so regex characters do not fail', async () => {
      ExpenseMock.aggregate.mockResolvedValue([]);
      const groupId = new mongoose.Types.ObjectId().toString();

      await expenseService.getChartExpenses(groupId, undefined, undefined, undefined, undefined, 'Bar (centro)+');

      const [{ $match }] = (Expense.aggregate as vi.Mock).mock.calls[0][0];
      expect($match.localization).toEqual({ $regex: 'Bar \\(centro\\)\\+', $options: 'i' });
      expect(new RegExp($match.localization.$regex, 'i').test('bar (Centro)+')).toBe(true);
    });
  });

  describe('getChartExpenses with categories', () => {
    it('adds a day total that counts each expense once', async () => {
      CategoryAliasMock.find.mockReturnValue({ lean: vi.fn().mockResolvedValue([]) } as any);
      ExpenseMock.aggregate
        .mockResolvedValueOnce([
          { date: '2026-11-01', category: 'Cervezas', totalAmount: 30 },
          { date: '2026-11-01', category: 'Comida', totalAmount: 30 }
        ] as any)
        .mockResolvedValueOnce([{ date: '2026-11-01', totalAmount: 30 }] as any);
      const groupId = new mongoose.Types.ObjectId().toString();

      const result = await expenseService.getChartExpenses(groupId, undefined, undefined, undefined, ['Cervezas', 'Comida']);

      expect(result).toEqual([
        { date: '2026-11-01', category: 'Cervezas', totalAmount: 30 },
        { date: '2026-11-01', category: 'Comida', totalAmount: 30 },
        { date: '2026-11-01', totalAmount: 30 }
      ]);
      // El total del día filtra por las mismas categorías, sin desdoblar los gastos
      const [dayTotals] = (Expense.aggregate as vi.Mock).mock.calls[1];
      expect(dayTotals[0].$match.categoria).toEqual({ $in: ['Cervezas', 'Comida'] });
      expect(dayTotals.some((stage: object) => '$unwind' in stage)).toBe(false);
    });
  });

  describe('bulkUpdate', () => {
    it('should update multiple expenses with allowed fields', async () => {
      const expenseIds = ['exp-1', 'exp-2'];
      const updateData = {
        categoria: ['Food'],
        grupo_id: 'new-group-id',
        localization: 'New Place'
      };

      ExpenseMock.updateMany.mockResolvedValue({ modifiedCount: 2 } as any);

      await expenseService.bulkUpdate(expenseIds, updateData as any);

      expect(ExpenseMock.updateMany).toHaveBeenCalledWith(
        { _id: { $in: expenseIds } },
        { $set: {
          categoria: ['Food'],
          grupo_id: 'new-group-id',
          localization: 'New Place'
        }}
      );
    });

    it('should ignore not allowed fields', async () => {
      const expenseIds = ['exp-1'];
      const updateData = {
        monto: 100, // Not allowed
        descripcion: 'New Desc' // Not allowed
      };

      await expect(expenseService.bulkUpdate(expenseIds, updateData)).rejects.toThrow('No hay datos válidos para actualizar.');
    });
  });

  describe('origen (gastos de otra aplicación)', () => {
    const groupId = new mongoose.Types.ObjectId().toString();
    const userId = new mongoose.Types.ObjectId().toString();
    const data = {
      grupo_id: groupId,
      descripcion: 'Compra (3 artículos)',
      monto: 12.5,
      origen: { app: 'cgsshoppings', ref: 'compra-1' }
    } as any;
    const filter = { grupo_id: groupId, 'origen.app': 'cgsshoppings', 'origen.ref': 'compra-1' };

    beforeEach(() => {
      GroupMock.findById.mockResolvedValue({ miembros: [userId] } as any);
    });

    it('creates the expense with its origin the first time', async () => {
      ExpenseMock.findOne.mockResolvedValue(null);
      ExpenseMock.create.mockImplementation(async (doc: any) => doc);
      const { expense, duplicado } = await expenseService.createOrFindExpense(data, userId);
      expect(duplicado).toBe(false);
      expect(ExpenseMock.findOne).toHaveBeenCalledWith(filter);
      expect(ExpenseMock.create).toHaveBeenCalledWith(expect.objectContaining({ origen: { app: 'cgsshoppings', ref: 'compra-1' } }));
      expect((expense as any).monto).toBe(12.5);
    });

    it('returns the existing expense when the same origin comes again', async () => {
      const existing = { _id: 'e1', monto: 10 };
      ExpenseMock.findOne.mockResolvedValue(existing as any);
      const result = await expenseService.createOrFindExpense(data, userId);
      expect(result).toEqual({ expense: existing, duplicado: true });
      expect(ExpenseMock.create).not.toHaveBeenCalled();
    });

    it('returns the winner of a race caught by the unique index', async () => {
      const winner = { _id: 'e2' };
      ExpenseMock.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(winner as any);
      ExpenseMock.create.mockRejectedValue(Object.assign(new Error('E11000 duplicate key'), { code: 11000 }));
      const result = await expenseService.createOrFindExpense(data, userId);
      expect(result).toEqual({ expense: winner, duplicado: true });
    });

    it('without an origin it just creates the expense', async () => {
      ExpenseMock.create.mockImplementation(async (doc: any) => doc);
      const { duplicado } = await expenseService.createOrFindExpense({ ...data, origen: undefined }, userId);
      expect(duplicado).toBe(false);
      expect(ExpenseMock.findOne).not.toHaveBeenCalled();
    });

    it('rejects a malformed origin', async () => {
      for (const origen of ['cgsshoppings', { app: 'CGS Shoppings', ref: 'x' }, { app: 'cgsshoppings', ref: '' }, { app: 'cgsshoppings', ref: 'x'.repeat(101) }]) {
        await expect(expenseService.createOrFindExpense({ ...data, origen }, userId)).rejects.toMatchObject({ statusCode: 400 });
        await expect(expenseService.createExpense({ ...data, origen }, userId)).rejects.toMatchObject({ statusCode: 400 });
      }
      expect(ExpenseMock.create).not.toHaveBeenCalled();
    });

    describe('articles of a ticket', () => {
      const origen = { app: 'cgsshoppings', ref: 'compra-1' };
      const items = [
        { grupo_id: groupId, descripcion: 'Leche', monto: 1.5, assumeExpense: true, origen: { ...origen, ref: 'compra-1#1' } },
        { grupo_id: groupId, descripcion: 'Pan', monto: 0.9, assumeExpense: true, origen: { ...origen, ref: 'compra-1#2' } },
      ] as any[];
      const found = (result: unknown) => ExpenseMock.find.mockReturnValue({ sort: vi.fn().mockResolvedValue(result) } as any);

      it('findByOrigen matches the expense itself and its numbered articles only', async () => {
        found([]);
        await expenseService.findByOrigen(groupId, { app: 'cgsshoppings', ref: 'a.b' });
        const { $or } = ExpenseMock.find.mock.calls[0][0] as any;
        expect($or[0]).toEqual({ 'origen.ref': 'a.b' });
        const re: RegExp = $or[1]['origen.ref'];
        expect(['a.b#1', 'a.b#12'].every(ref => re.test(ref))).toBe(true);
        expect(['axb#1', 'a.b#', 'a.b#1x', 'a.b2#1'].some(ref => re.test(ref))).toBe(false);
      });

      it('creates them all at once, in order', async () => {
        found([]);
        ExpenseMock.insertMany.mockImplementation(async (docs: any) => docs);
        const { expenses, duplicado } = await expenseService.createOrFindExpenses(items, userId, origen);
        expect(duplicado).toBe(false);
        expect(ExpenseMock.insertMany).toHaveBeenCalledWith(
          [expect.objectContaining({ descripcion: 'Leche', participantes: [userId], asume_gasto: true }), expect.objectContaining({ descripcion: 'Pan' })],
          { ordered: true }
        );
        expect(expenses.map((e: any) => e.origen.ref)).toEqual(['compra-1#1', 'compra-1#2']);
      });

      it('returns the existing ones without creating anything when the ticket comes again', async () => {
        found([{ _id: 'e1' }]);
        const result = await expenseService.createOrFindExpenses(items, userId, origen);
        expect(result).toEqual({ expenses: [{ _id: 'e1' }], duplicado: true });
        expect(ExpenseMock.insertMany).not.toHaveBeenCalled();
      });

      it('returns the winner of a race caught by the unique index', async () => {
        ExpenseMock.find
          .mockReturnValueOnce({ sort: vi.fn().mockResolvedValue([]) } as any)
          .mockReturnValueOnce({ sort: vi.fn().mockResolvedValue([{ _id: 'w1' }, { _id: 'w2' }]) } as any);
        ExpenseMock.insertMany.mockRejectedValue(Object.assign(new Error('E11000 duplicate key'), { code: 11000 }));
        const result = await expenseService.createOrFindExpenses(items, userId, origen);
        expect(result).toEqual({ expenses: [{ _id: 'w1' }, { _id: 'w2' }], duplicado: true });
      });

      it('validates every article before saving any', async () => {
        found([]);
        await expect(expenseService.createOrFindExpenses([items[0], { ...items[1], monto: 0 }], userId, origen)).rejects.toMatchObject({ statusCode: 400 });
        expect(ExpenseMock.insertMany).not.toHaveBeenCalled();
      });
    });
  });
});
