import { Router } from 'express';
import * as UserController from '../controllers/UserController';
import * as GroupController from '../controllers/GroupController';
import * as ExpenseController from '../controllers/ExpenseController';
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

// Expense Routes (Protected)
router.post('/expenses', protect, ExpenseController.createExpense);
router.put('/expenses/:expenseId', protect, ExpenseController.updateExpense);
router.delete('/expenses/:expenseId', protect, ExpenseController.deleteExpense);
router.get('/groups/:groupId/expenses', protect, ExpenseController.getGroupExpenses);
router.get('/groups/:groupId/balance', protect, ExpenseController.getGroupBalance);
router.get('/groups/:groupId/settle', protect, ExpenseController.settleGroupDebts);

export default router;