import { GroupService, sortByUserOrder, validatePresupuesto } from '../../src/services/GroupService';
import Group from '../../src/models/Group';
import User from '../../src/models/User';
import Expense from '../../src/models/Expense';
import UserPreferences from '../../src/models/UserPreferences';
import RecurringItem from '../../src/models/RecurringItem';
import Income from '../../src/models/Income';
import BudgetAlert from '../../src/models/BudgetAlert';
import { AppError } from '../../src/utils/AppError';
import mongoose from 'mongoose';

vi.mock('../../src/models/Group');
vi.mock('../../src/models/User');
vi.mock('../../src/models/Expense');
vi.mock('../../src/models/UserPreferences');
vi.mock('../../src/models/RecurringItem');
vi.mock('../../src/models/Income');
vi.mock('../../src/models/BudgetAlert');
vi.mock('../../src/models/DebtTransaction');

const GroupMock = Group as vi.Mocked<typeof Group>;
const UserMock = User as vi.Mocked<typeof User>;
const ExpenseMock = Expense as vi.Mocked<typeof Expense>;

// Mocking the save method on the document instance
const mockGroupSave = vi.fn().mockResolvedValue(undefined);
const mockGroupInstance = {
  _id: 'group-123',
  miembros: [] as any[],
  save: mockGroupSave,
  populate: vi.fn().mockReturnThis(),
};

describe('GroupService', () => {
  let groupService: GroupService;

  beforeEach(() => {
    groupService = new GroupService();
    vi.clearAllMocks();

    // Reset mocks on the instance
    mockGroupInstance.miembros = [];
    mockGroupSave.mockClear();
    (mockGroupInstance.populate as vi.Mock).mockClear();
    
    // Setup default mock implementations
    GroupMock.create.mockImplementation((data: any) => Promise.resolve({ ...data, _id: 'group-123' } as any));
    GroupMock.findById.mockResolvedValue(mockGroupInstance as any);
    GroupMock.find.mockReturnValue({
      populate: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([]),
      }),
    } as any);
    UserMock.findOne.mockResolvedValue({ _id: 'user-456', id: 'user-456' } as any);
    ExpenseMock.find.mockResolvedValue([]);
    (UserPreferences.findOne as vi.Mock).mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
  });

  describe('createGroup', () => {
    it('should create a group with the creator as a member', async () => {
      const groupData = { nombre: 'Test Group' };
      const userId = 'user-123';
      const result = await groupService.createGroup(groupData, userId);

      expect(Group.create).toHaveBeenCalledWith({
        ...groupData,
        creado_por: userId,
        miembros: [userId],
      });
      expect(result.nombre).toBe('Test Group');
      expect(result.miembros).toContain(userId);
    });
  });

  describe('addMember', () => {
    it('should add a member to the group', async () => {
      const groupId = 'group-123';
      const userEmail = 'new@member.com';
      const userToAdd = { _id: 'user-456', id: 'user-456' };
      
      mockGroupInstance.miembros = ['user-123' as any];
      UserMock.findOne.mockResolvedValue(userToAdd as any);
      GroupMock.findById.mockResolvedValue(mockGroupInstance as any);

      const result = await groupService.addMember(groupId, userEmail);

      expect(Group.findById).toHaveBeenCalledWith(groupId);
      expect(User.findOne).toHaveBeenCalledWith({ email: userEmail });
      expect(mockGroupInstance.save).toHaveBeenCalled();
      expect(result.miembros).toContain(userToAdd._id);
    });

    it('should throw an error if group not found', async () => {
      GroupMock.findById.mockResolvedValue(null);
      await expect(groupService.addMember('wrong-id', 'e@e.com')).rejects.toThrow(
        new AppError('Grupo no encontrado', 404)
      );
    });

    it('should throw an error if user not found', async () => {
      UserMock.findOne.mockResolvedValue(null);
      await expect(groupService.addMember('group-123', 'wrong@email.com')).rejects.toThrow(
        new AppError('Usuario no encontrado', 404)
      );
    });

    it('should throw an error if user is already a member', async () => {
      const userEmail = 'existing@member.com';
      const existingUser = { _id: 'user-123', id: 'user-123' };
      
      mockGroupInstance.miembros = [existingUser._id as any];
      UserMock.findOne.mockResolvedValue(existingUser as any);
      GroupMock.findById.mockResolvedValue(mockGroupInstance as any);

      await expect(groupService.addMember('group-123', userEmail)).rejects.toThrow(
        new AppError('El usuario ya es miembro del grupo', 400)
      );
    });
  });

  describe('getGroupsForUser', () => {
    it('should return groups with expense data for a given user', async () => {
      const userId = 'user-123';
      const group1 = { _id: 'group-1', nombre: 'Group 1', miembros: [userId] };
      const groups = [group1];
  
      (Group.find as vi.Mock).mockReturnValue({
          populate: vi.fn().mockReturnValue({
              lean: vi.fn().mockResolvedValue(groups),
          }),
      });
  
      const expense1 = {
          _id: 'exp-1',
          grupo_id: 'group-1',
          monto: 100,
          participantes: [userId],
          asume_gasto: false,
          pagado_por: userId
      };
      (Expense.find as vi.Mock).mockResolvedValue([expense1] as any);
  
      const result = await groupService.getGroupsForUser(userId);
  
      expect(Group.find).toHaveBeenCalledWith({ miembros: userId });
      expect(Expense.find).toHaveBeenCalledWith({ grupo_id: 'group-1' });
      expect(result[0].totalExpenses).toBe(100);
      expect(result[0].userShare).toBe(100);
    });

    it('should return groups in the order saved by the user', async () => {
      const userId = 'user-123';
      const groups = ['g1', 'g2', 'g3'].map(id => ({ _id: id, nombre: id, miembros: [userId] }));
      (Group.find as vi.Mock).mockReturnValue({
        populate: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(groups) }),
      });
      (UserPreferences.findOne as vi.Mock).mockReturnValue({
        lean: vi.fn().mockResolvedValue({ groupOrder: ['g3', 'g1'] }),
      });

      const result = await groupService.getGroupsForUser(userId);

      expect(UserPreferences.findOne).toHaveBeenCalledWith({ userId });
      expect(result.map(g => g._id)).toEqual(['g3', 'g1', 'g2']);
    });
  });

  describe('sortByUserOrder', () => {
    const groups = ['a', 'b', 'c', 'd'].map(_id => ({ _id }));

    it('keeps the original order without a saved order', () => {
      expect(sortByUserOrder(groups, []).map(g => g._id)).toEqual(['a', 'b', 'c', 'd']);
    });

    it('puts unknown groups at the end and ignores ids that no longer exist', () => {
      expect(sortByUserOrder(groups, ['c', 'gone', 'a']).map(g => g._id)).toEqual(['c', 'a', 'b', 'd']);
    });

    it('compares ObjectIds by their string value', () => {
      const id = new mongoose.Types.ObjectId();
      const other = new mongoose.Types.ObjectId();
      const result = sortByUserOrder([{ _id: other }, { _id: id }], [id.toString()]);
      expect(result[0]._id).toBe(id);
    });
  });

  describe('personal groups and budget', () => {
    const groupDoc = (extra: object = {}) => ({
      _id: 'group-1',
      creado_por: { toString: () => 'user-123' },
      miembros: [{ toString: () => 'user-123' }],
      tipo: 'compartido',
      save: vi.fn().mockResolvedValue(undefined),
      ...extra
    });

    it('turns a single-member group into a personal one with its budget config', async () => {
      const group = groupDoc();
      GroupMock.findById.mockResolvedValue(group as any);

      await groupService.updateGroup('group-1', { tipo: 'personal', presupuesto: { diaInicioCiclo: 28 } } as any, 'user-123');

      expect(group.tipo).toBe('personal');
      expect((group as any).presupuesto).toEqual({ diaInicioCiclo: 28, ahorroObjetivo: 0, incluirOtrosGrupos: false, limitesCategoria: [], avisos: true });
      expect(group.save).toHaveBeenCalled();
    });

    it('refuses to make a group with several members personal', async () => {
      GroupMock.findById.mockResolvedValue(groupDoc({ miembros: [{ toString: () => 'user-123' }, { toString: () => 'user-9' }] }) as any);

      await expect(groupService.updateGroup('group-1', { tipo: 'personal' } as any, 'user-123')).rejects.toMatchObject({ statusCode: 400 });
    });

    it('refuses new members in a personal group', async () => {
      GroupMock.findById.mockResolvedValue(groupDoc({ tipo: 'personal' }) as any);

      await expect(groupService.addMember('group-1', 'new@member.com')).rejects.toMatchObject({ statusCode: 400 });
    });

    it('deletes the budget data together with the group', async () => {
      GroupMock.findById.mockResolvedValue(groupDoc({ tipo: 'personal' }) as any);

      const groupId = new mongoose.Types.ObjectId().toString();
      await groupService.deleteGroup(groupId);

      expect(RecurringItem.deleteMany).toHaveBeenCalledWith({ grupo_id: groupId });
      expect(Income.deleteMany).toHaveBeenCalledWith({ grupo_id: groupId });
      expect(BudgetAlert.deleteMany).toHaveBeenCalledWith({ grupo_id: groupId });
    });
  });

  describe('validatePresupuesto', () => {
    it('merges partial changes into the current config', () => {
      expect(validatePresupuesto({ ahorroObjetivo: 150.555 }, { diaInicioCiclo: 25, ahorroObjetivo: 0, incluirOtrosGrupos: true } as any))
        .toEqual({ diaInicioCiclo: 25, ahorroObjetivo: 150.56, incluirOtrosGrupos: true, limitesCategoria: [], avisos: true });
    });

    it('cleans the category limits and keeps them when not sent', () => {
      const result = validatePresupuesto({ limitesCategoria: [{ categoria: ' Ocio ', limite: 99.999 }] });
      expect(result.limitesCategoria).toEqual([{ categoria: 'Ocio', limite: 100 }]);
      expect(validatePresupuesto({ ahorroObjetivo: 10 }, result).limitesCategoria).toEqual([{ categoria: 'Ocio', limite: 100 }]);
      expect(validatePresupuesto({ limitesCategoria: [] }, result).limitesCategoria).toEqual([]);
    });

    it.each([
      ['day 0', { diaInicioCiclo: 0 }],
      ['day 32', { diaInicioCiclo: 32 }],
      ['non-integer day', { diaInicioCiclo: 2.5 }],
      ['negative savings', { ahorroObjetivo: -1 }],
      ['non-boolean flag', { incluirOtrosGrupos: 'yes' }],
      ['limits not a list', { limitesCategoria: 'Ocio' }],
      ['limit without category', { limitesCategoria: [{ categoria: ' ', limite: 10 }] }],
      ['zero limit', { limitesCategoria: [{ categoria: 'Ocio', limite: 0 }] }],
      ['limit as text', { limitesCategoria: [{ categoria: 'Ocio', limite: '10' }] }],
      ['duplicated category', { limitesCategoria: [{ categoria: 'Ocio', limite: 10 }, { categoria: 'ocio', limite: 20 }] }],
      ['too many limits', { limitesCategoria: Array.from({ length: 31 }, (_, i) => ({ categoria: `C${i}`, limite: 1 })) }],
      ['not an object', 'x']
    ])('rejects %s', (_label, input) => {
      expect(() => validatePresupuesto(input)).toThrow();
    });
  });
});
