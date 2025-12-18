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
const ExpenseController_1 = require("../../src/controllers/ExpenseController");
const ExpenseService_1 = require("../../src/services/ExpenseService");
jest.mock('../../src/services/ExpenseService');
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
describe('ExpenseController', () => {
    let req;
    let res;
    let next;
    beforeEach(() => {
        res = mockResponse();
        next = mockNext();
        jest.clearAllMocks();
    });
    describe('createExpense', () => {
        it('should create an expense and return it with status 201', () => __awaiter(void 0, void 0, void 0, function* () {
            const expenseData = {
                description: 'Dinner',
                amount: 50,
                groupId: 'group-123',
            };
            req = mockRequest(expenseData, {}, { 'user-id': 'user-123' });
            const expense = Object.assign(Object.assign({}, expenseData), { _id: 'expense-123', paidBy: 'user-123' });
            ExpenseService_1.ExpenseService.prototype.createExpense.mockResolvedValue(expense);
            yield (0, ExpenseController_1.createExpense)(req, res, next);
            expect(res.status).toHaveBeenCalledWith(201);
            expect(res.json).toHaveBeenCalledWith({ status: 'success', data: expense });
            expect(ExpenseService_1.ExpenseService.prototype.createExpense).toHaveBeenCalledWith(expenseData, 'user-123');
        }));
    });
    describe('getGroupExpenses', () => {
        it('should return a list of expenses for the group with status 200', () => __awaiter(void 0, void 0, void 0, function* () {
            req = mockRequest({}, { groupId: 'group-123' });
            const expenses = [{ description: 'Lunch', amount: 20 }];
            ExpenseService_1.ExpenseService.prototype.getExpensesByGroup.mockResolvedValue(expenses);
            yield (0, ExpenseController_1.getGroupExpenses)(req, res, next);
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({ status: 'success', data: expenses });
            expect(ExpenseService_1.ExpenseService.prototype.getExpensesByGroup).toHaveBeenCalledWith('group-123');
        }));
    });
});
