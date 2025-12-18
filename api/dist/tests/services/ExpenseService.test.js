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
const ExpenseService_1 = require("../../src/services/ExpenseService");
const Expense_1 = __importDefault(require("../../src/models/Expense"));
const Group_1 = __importDefault(require("../../src/models/Group"));
const AppError_1 = require("../../src/utils/AppError");
jest.mock('../../src/models/Expense');
jest.mock('../../src/models/Group');
const ExpenseMock = Expense_1.default;
const GroupMock = Group_1.default;
describe('ExpenseService', () => {
    let expenseService;
    beforeEach(() => {
        expenseService = new ExpenseService_1.ExpenseService();
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
        it('should create an expense with all group members as participants if not specified', () => __awaiter(void 0, void 0, void 0, function* () {
            GroupMock.findById.mockResolvedValue(mockGroup);
            ExpenseMock.create.mockImplementation((data) => Promise.resolve(data));
            const result = yield expenseService.createExpense(expenseData, userId);
            expect(Group_1.default.findById).toHaveBeenCalledWith(expenseData.grupo_id);
            expect(Expense_1.default.create).toHaveBeenCalledWith(Object.assign(Object.assign({}, expenseData), { pagado_por: userId, participantes: groupMembers }));
            expect(result.participantes).toEqual(groupMembers);
        }));
        it('should create an expense with specified participants', () => __awaiter(void 0, void 0, void 0, function* () {
            const specificParticipants = ['user-456'];
            const expenseDataWithParticipants = Object.assign(Object.assign({}, expenseData), { participantes: specificParticipants });
            GroupMock.findById.mockResolvedValue(mockGroup);
            ExpenseMock.create.mockImplementation((data) => Promise.resolve(data));
            const result = yield expenseService.createExpense(expenseDataWithParticipants, userId);
            expect(Expense_1.default.create).toHaveBeenCalledWith(Object.assign(Object.assign({}, expenseData), { pagado_por: userId, participantes: specificParticipants }));
            expect(result.participantes).toEqual(specificParticipants);
        }));
        it('should throw error if group not found', () => __awaiter(void 0, void 0, void 0, function* () {
            GroupMock.findById.mockResolvedValue(null);
            yield expect(expenseService.createExpense(expenseData, userId)).rejects.toThrow(new AppError_1.AppError('Grupo no encontrado', 404));
        }));
        it('should throw error if payer is not a group member', () => __awaiter(void 0, void 0, void 0, function* () {
            const nonMemberUserId = 'user-789';
            GroupMock.findById.mockResolvedValue(mockGroup);
            yield expect(expenseService.createExpense(expenseData, nonMemberUserId)).rejects.toThrow(new AppError_1.AppError('El usuario que paga no pertenece al grupo', 403));
        }));
        it('should throw error if amount is zero or less', () => __awaiter(void 0, void 0, void 0, function* () {
            GroupMock.findById.mockResolvedValue(mockGroup);
            yield expect(expenseService.createExpense(Object.assign(Object.assign({}, expenseData), { monto: 0 }), userId)).rejects.toThrow(new AppError_1.AppError('El monto debe ser mayor a 0', 400));
        }));
    });
    describe('getExpensesByGroup', () => {
        it('should return populated expenses for a group', () => __awaiter(void 0, void 0, void 0, function* () {
            const groupId = 'group-123';
            const expenses = [{ description: 'Expense 1' }, { description: 'Expense 2' }];
            ExpenseMock.find.mockReturnValue({
                populate: jest.fn().mockReturnValue({
                    populate: jest.fn().mockResolvedValue(expenses),
                }),
            });
            const result = yield expenseService.getExpensesByGroup(groupId);
            expect(Expense_1.default.find).toHaveBeenCalledWith({ grupo_id: groupId });
            expect(result).toEqual(expenses);
        }));
    });
});
