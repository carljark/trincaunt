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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const GroupService_1 = require("../../src/services/GroupService");
const Group_1 = __importDefault(require("../../src/models/Group"));
const User_1 = __importDefault(require("../../src/models/User"));
const AppError_1 = require("../../src/utils/AppError");
jest.mock('../../src/models/Group');
jest.mock('../../src/models/User');
const GroupMock = Group_1.default;
const UserMock = User_1.default;
// Mocking the save method on the document instance
const mockGroupSave = jest.fn().mockResolvedValue(undefined);
const mockGroupInstance = {
    _id: 'group-123',
    miembros: [],
    save: mockGroupSave,
    populate: jest.fn().mockReturnThis(),
};
describe('GroupService', () => {
    let groupService;
    beforeEach(() => {
        groupService = new GroupService_1.GroupService();
        jest.clearAllMocks();
        // Reset mocks on the instance
        mockGroupInstance.miembros = [];
        mockGroupSave.mockClear();
        mockGroupInstance.populate.mockClear();
        // Setup default mock implementations
        GroupMock.create.mockImplementation((data) => Promise.resolve(Object.assign(Object.assign({}, data), { _id: 'group-123' })));
        GroupMock.findById.mockResolvedValue(mockGroupInstance);
        GroupMock.find.mockReturnValue({
            populate: jest.fn().mockResolvedValue([]),
        });
        UserMock.findOne.mockResolvedValue({ _id: 'user-456', id: 'user-456' });
    });
    describe('createGroup', () => {
        it('should create a group with the creator as a member', () => __awaiter(void 0, void 0, void 0, function* () {
            const groupData = { nombre: 'Test Group' };
            const userId = 'user-123';
            const result = yield groupService.createGroup(groupData, userId);
            expect(Group_1.default.create).toHaveBeenCalledWith(Object.assign(Object.assign({}, groupData), { creado_por: userId, miembros: [userId] }));
            expect(result.nombre).toBe('Test Group');
            expect(result.miembros).toContain(userId);
        }));
    });
    describe('addMember', () => {
        it('should add a member to the group', () => __awaiter(void 0, void 0, void 0, function* () {
            const groupId = 'group-123';
            const userEmail = 'new@member.com';
            const userToAdd = { _id: 'user-456', id: 'user-456' };
            mockGroupInstance.miembros = ['user-123'];
            UserMock.findOne.mockResolvedValue(userToAdd);
            GroupMock.findById.mockResolvedValue(mockGroupInstance);
            const result = yield groupService.addMember(groupId, userEmail);
            expect(Group_1.default.findById).toHaveBeenCalledWith(groupId);
            expect(User_1.default.findOne).toHaveBeenCalledWith({ email: userEmail });
            expect(mockGroupInstance.save).toHaveBeenCalled();
            expect(result.miembros).toContain(userToAdd._id);
        }));
        it('should throw an error if group not found', () => __awaiter(void 0, void 0, void 0, function* () {
            GroupMock.findById.mockResolvedValue(null);
            yield expect(groupService.addMember('wrong-id', 'e@e.com')).rejects.toThrow(new AppError_1.AppError('Grupo no encontrado', 404));
        }));
        it('should throw an error if user not found', () => __awaiter(void 0, void 0, void 0, function* () {
            UserMock.findOne.mockResolvedValue(null);
            yield expect(groupService.addMember('group-123', 'wrong@email.com')).rejects.toThrow(new AppError_1.AppError('Usuario no encontrado', 404));
        }));
        it('should throw an error if user is already a member', () => __awaiter(void 0, void 0, void 0, function* () {
            const userEmail = 'existing@member.com';
            const existingUser = { _id: 'user-123', id: 'user-123' };
            mockGroupInstance.miembros = [existingUser._id];
            UserMock.findOne.mockResolvedValue(existingUser);
            GroupMock.findById.mockResolvedValue(mockGroupInstance);
            yield expect(groupService.addMember('group-123', userEmail)).rejects.toThrow(new AppError_1.AppError('El usuario ya es miembro del grupo', 400));
        }));
    });
    describe('getGroupsForUser', () => {
        it('should return groups for a given user', () => __awaiter(void 0, void 0, void 0, function* () {
            const userId = 'user-123';
            const groups = [{ nombre: 'Group 1' }];
            Group_1.default.find.mockReturnValue({
                populate: jest.fn().mockResolvedValue(groups),
            });
            const result = yield groupService.getGroupsForUser(userId);
            expect(Group_1.default.find).toHaveBeenCalledWith({ miembros: userId });
            expect(result).toEqual(groups);
        }));
    });
});
