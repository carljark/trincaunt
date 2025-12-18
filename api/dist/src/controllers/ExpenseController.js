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
exports.deleteExpense = exports.updateExpense = exports.getGroupBalance = exports.getGroupExpenses = exports.createExpense = void 0;
const ExpenseService_1 = require("../services/ExpenseService");
const expenseService = new ExpenseService_1.ExpenseService();
const createExpense = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userId = req.user.id;
        const expense = yield expenseService.createExpense(req.body, userId);
        res.status(201).json({ status: 'success', data: expense });
    }
    catch (error) {
        next(error);
    }
});
exports.createExpense = createExpense;
const getGroupExpenses = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { groupId } = req.params;
        const expenses = yield expenseService.getExpensesByGroup(groupId);
        res.status(200).json({ status: 'success', data: expenses });
    }
    catch (error) {
        next(error);
    }
});
exports.getGroupExpenses = getGroupExpenses;
const getGroupBalance = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { groupId } = req.params;
        const balance = yield expenseService.getGroupBalance(groupId);
        res.status(200).json({ status: 'success', data: balance });
    }
    catch (error) {
        next(error);
    }
});
exports.getGroupBalance = getGroupBalance;
const updateExpense = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { expenseId } = req.params;
        const updatedExpense = yield expenseService.updateExpense(expenseId, req.body);
        res.status(200).json({ status: 'success', data: updatedExpense });
    }
    catch (error) {
        next(error);
    }
});
exports.updateExpense = updateExpense;
const deleteExpense = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { expenseId } = req.params;
        yield expenseService.deleteExpense(expenseId);
        res.status(204).json({ status: 'success', data: null });
    }
    catch (error) {
        next(error);
    }
});
exports.deleteExpense = deleteExpense;
