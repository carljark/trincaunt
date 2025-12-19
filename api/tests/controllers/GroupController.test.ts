import { Request, Response, NextFunction } from 'express';
import { createGroup, addMember, getMyGroups } from '../../src/controllers/GroupController';
import { GroupService } from '../../src/services/GroupService';
import { AppError } from '../../src/utils/AppError';

jest.mock('../../src/services/GroupService');

const mockRequest = (body: any, params: any = {}, headers: any = {}, user: any = undefined) => ({
  body,
  params,
  headers,
  user,
}) as unknown as Request; // Cast to unknown first to satisfy TypeScript

const mockResponse = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res as Response;
};

const mockNext = () => jest.fn() as NextFunction;

describe('GroupController', () => {
  let req: Request;
  let res: Response;
  let next: NextFunction;

  beforeEach(() => {
    res = mockResponse();
    next = mockNext();
    jest.clearAllMocks();
  });

  describe('createGroup', () => {
    it('should create a group and return it with status 201', async () => {
      const userId = 'user-123';
      req = mockRequest({ nombre: 'Test Group' }, {}, { 'user-id': userId }, { id: userId });
      const group = { _id: 'group-123', nombre: 'Test Group', miembros: [userId] }; // Changed 'members' to 'miembros' to match IGroup
      (GroupService.prototype.createGroup as jest.Mock).mockResolvedValue(group);

      await createGroup(req, res, next);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({ status: 'success', data: group });
    });

    it('should call next with an error if user is not authenticated', async () => {
      req = mockRequest({ nombre: 'Test Group' }); // No user-id header, and no user object in mockRequest
      
      await createGroup(req, res, next);
      
      expect(next).toHaveBeenCalledWith(new AppError('Usuario no autenticado', 401));
    });
  });

  describe('addMember', () => {
    it('should add a member to a group and return the updated group with status 200', async () => {
      req = mockRequest({ email: 'member@example.com' }, { groupId: 'group-123' });
      const group = { _id: 'group-123', nombre: 'Test Group', members: ['user-123', 'user-456'] };
      (GroupService.prototype.addMember as jest.Mock).mockResolvedValue(group);

      await addMember(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ status: 'success', data: group });
      expect(GroupService.prototype.addMember).toHaveBeenCalledWith('group-123', 'member@example.com');
    });
  });

  describe('getMyGroups', () => {
    it('should return a list of groups for the user with status 200', async () => {
      const userId = 'user-123';
      req = mockRequest({}, {}, { 'user-id': userId }, { id: userId });
      const groups = [{ _id: 'group-123', nombre: 'Test Group' }];
      (GroupService.prototype.getGroupsForUser as jest.Mock).mockResolvedValue(groups);

      await getMyGroups(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ status: 'success', data: groups });
      expect(GroupService.prototype.getGroupsForUser).toHaveBeenCalledWith(userId);
    });
  });
});
