"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const UserController = __importStar(require("../controllers/UserController"));
const GroupController = __importStar(require("../controllers/GroupController"));
const ExpenseController = __importStar(require("../controllers/ExpenseController"));
const authMiddleware_1 = require("../middlewares/authMiddleware");
const router = (0, express_1.Router)();
// User Routes
router.post('/users/register', UserController.register);
router.post('/users/login', UserController.login);
// Group Routes (Protected)
router.post('/groups', authMiddleware_1.protect, GroupController.createGroup);
router.get('/groups', authMiddleware_1.protect, GroupController.getMyGroups);
router.get('/groups/:groupId', authMiddleware_1.protect, GroupController.getGroupById);
router.post('/groups/:groupId/members', authMiddleware_1.protect, GroupController.addMember);
// Expense Routes (Protected)
router.post('/expenses', authMiddleware_1.protect, ExpenseController.createExpense);
router.put('/expenses/:expenseId', authMiddleware_1.protect, ExpenseController.updateExpense);
router.delete('/expenses/:expenseId', authMiddleware_1.protect, ExpenseController.deleteExpense);
router.get('/groups/:groupId/expenses', authMiddleware_1.protect, ExpenseController.getGroupExpenses);
router.get('/groups/:groupId/balance', authMiddleware_1.protect, ExpenseController.getGroupBalance);
exports.default = router;
