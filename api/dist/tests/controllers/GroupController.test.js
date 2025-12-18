"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const GroupController_1 = require("../../src/controllers/GroupController");
const GroupService_1 = require("../../src/services/GroupService");
jest.mock('../../src/services/GroupService');
const mockRequest = (body, params = {}, headers = {}) => ({
    body,
    params,
    headers,
});
const mockResponse = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
};
const mockNext = () => jest.fn();
describe('GroupController', () => {
    let req;
    let res;
    let next;
    beforeEach(() => {
        res = mockResponse();
        next = mockNext();
        jest.clearAllMocks();
    });
    describe('createGroup', () => {
        it('should create a group and return it with status 201', () => __awaiter(void 0, void 0, void 0, function* () {
            req = mockRequest({ nombre: 'Test Group' }, {}, { 'user-id': 'user-123' });
            const group = { _id: 'group-123', nombre: 'Test Group', members: ['user-123'] };
            GroupService_1.GroupService.prototype.createGroup.mockResolvedValue(group);
            yield (0, GroupController_1.createGroup)(req, res, next);
            expect(res.status).toHaveBeenCalledWith(201);
            expect(res.json).toHaveBeenCalledWith({ status: 'success', data: group });
        }));
        it('should call next with an error if user is not authenticated', () => __awaiter(void 0, void 0, void 0, function* () {
            req = mockRequest({ nombre: 'Test Group' }); // No user-id header
            yield (0, GroupController_1.createGroup)(req, res, next);
            expect(next).toHaveBeenCalledWith(new Error('Usuario no autenticado (Falta header user-id)'));
        }));
    });
    describe('addMember', () => {
        it('should add a member to a group and return the updated group with status 200', () => __awaiter(void 0, void 0, void 0, function* () {
            req = mockRequest({ email: 'member@example.com' }, { groupId: 'group-123' });
            const group = { _id: 'group-123', nombre: 'Test Group', members: ['user-123', 'user-456'] };
            GroupService_1.GroupService.prototype.addMember.mockResolvedValue(group);
            yield (0, GroupController_1.addMember)(req, res, next);
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({ status: 'success', data: group });
            expect(GroupService_1.GroupService.prototype.addMember).toHaveBeenCalledWith('group-123', 'member@example.com');
        }));
    });
    describe('getMyGroups', () => {
        it('should return a list of groups for the user with status 200', () => __awaiter(void 0, void 0, void 0, function* () {
            req = mockRequest({}, {}, { 'user-id': 'user-123' });
            const groups = [{ _id: 'group-123', nombre: 'Test Group' }];
            GroupService_1.GroupService.prototype.getGroupsForUser.mockResolvedValue(groups);
            yield (0, GroupController_1.getMyGroups)(req, res, next);
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({ status: 'success', data: groups });
            expect(GroupService_1.GroupService.prototype.getGroupsForUser).toHaveBeenCalledWith('user-123');
        }));
    });
});
