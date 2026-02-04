import { Router } from 'express';
import * as UserController from '../controllers/UserController';
import * as GroupController from '../controllers/GroupController';
import * as ExpenseController from '../controllers/ExpenseController';
import * as DebtTransactionController from '../controllers/DebtTransactionController';
import * as ReceiptController from '../controllers/ReceiptController';
import { protect } from '../middlewares/authMiddleware';

const router = Router();

// User Routes
router.post('/users/register', UserController.register);
router.post('/users/login', UserController.login);

// Group Routes (Protected)
router.post('/groups', protect, GroupController.createGroup);
router.get('/groups', protect, GroupController.getMyGroups);
router.get('/groups/:groupId', protect, GroupController.getGroupById);
router.post('/groups/:groupId/members', protect, GroupController.addMember);
router.delete('/groups/:groupId', protect, GroupController.deleteGroup); // New route for deleting a group

// Expense Routes (Protected)
router.post('/expenses', protect, ExpenseController.createExpense);
router.put('/expenses/:expenseId', protect, ExpenseController.updateExpense);
router.delete('/expenses/:expenseId', protect, ExpenseController.deleteExpense);
router.get('/expenses/categories', protect, ExpenseController.getExpenseCategories);
router.get('/expenses/global', protect, ExpenseController.getGlobalExpenses);
router.get('/groups/:groupId/expenses', protect, ExpenseController.getGroupExpenses);
router.get('/groups/:groupId/balance', protect, ExpenseController.getGroupBalance);
router.get('/groups/:groupId/settle', protect, ExpenseController.settleGroupDebts);

import * as ReceiptController from '../controllers/ReceiptController';

// ... (existing routes)

// Debt Transaction Routes (Protected)
router.post('/debt-transactions', protect, DebtTransactionController.createDebtTransaction);
router.get('/groups/:groupId/debt-transactions', protect, DebtTransactionController.getGroupDebtTransactions);
router.patch('/debt-transactions/:transactionId/pay', protect, DebtTransactionController.markDebtTransactionAsPaid);
router.delete('/debt-transactions/:transactionId', protect, DebtTransactionController.deleteDebtTransaction); // New route for deleting a debt transaction

// Receipt Routes (Protected)
router.post('/receipts/upload', protect, ReceiptController.uploadReceipt);

export default router;