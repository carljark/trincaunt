import { GroupService } from '../../src/services/GroupService';
import Group from '../../src/models/Group';
import User from '../../src/models/User';
import { AppError } from '../../src/utils/AppError';
import mongoose from 'mongoose';

jest.mock('../../src/models/Group');
jest.mock('../../src/models/User');

const GroupMock = Group as jest.Mocked<typeof Group>;
const UserMock = User as jest.Mocked<typeof User>;

// Mocking the save method on the document instance
const mockGroupSave = jest.fn().mockResolvedValue(undefined);
const mockGroupInstance = {
  _id: 'group-123',
  miembros: [] as any[],
  save: mockGroupSave,
  populate: jest.fn().mockReturnThis(),
};

describe('GroupService', () => {
  let groupService: GroupService;

  beforeEach(() => {
    groupService = new GroupService();
    jest.clearAllMocks();

    // Reset mocks on the instance
    mockGroupInstance.miembros = [];
    mockGroupSave.mockClear();
    (mockGroupInstance.populate as jest.Mock).mockClear();
    
    // Setup default mock implementations
    GroupMock.create.mockImplementation((data: any) => Promise.resolve({ ...data, _id: 'group-123' } as any));
    GroupMock.findById.mockResolvedValue(mockGroupInstance as any);
    GroupMock.find.mockReturnValue({
      populate: jest.fn().mockResolvedValue([]),
    } as any);
    UserMock.findOne.mockResolvedValue({ _id: 'user-456', id: 'user-456' } as any);
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
    it('should return groups for a given user', async () => {
      const userId = 'user-123';
      const groups = [{ nombre: 'Group 1' }];
      (Group.find as jest.Mock).mockReturnValue({
        populate: jest.fn().mockResolvedValue(groups),
      } as any);

      const result = await groupService.getGroupsForUser(userId);

      expect(Group.find).toHaveBeenCalledWith({ miembros: userId });
      expect(result).toEqual(groups);
    });
  });
});
