import { Router } from 'express';
import * as UserController from '../controllers/UserController';
import * as GroupController from '../controllers/GroupController';
import * as ExpenseController from '../controllers/ExpenseController';
import * as DebtTransactionController from '../controllers/DebtTransactionController';
import * as CategoryAliasController from '../controllers/CategoryAliasController';
import * as UserPreferencesController from '../controllers/UserPreferencesController';
import * as NoteController from '../controllers/NoteController'; // Import NoteController
import { protect } from '../middlewares/authMiddleware';

const router = Router();

// User Routes
router.post('/users/register', UserController.register);
router.post('/users/login', UserController.login);

// Category Alias Routes (Protected)
router.get('/category-aliases', protect, CategoryAliasController.getAllAliases);
router.post('/category-aliases', protect, CategoryAliasController.createAlias);
router.put('/category-aliases/:aliasId', protect, CategoryAliasController.updateAlias);
router.delete('/category-aliases/:aliasId', protect, CategoryAliasController.deleteAlias);

// Group Routes (Protected)
router.post('/groups', protect, GroupController.createGroup);
router.get('/groups', protect, GroupController.getMyGroups);
router.get('/groups/:groupId', protect, GroupController.getGroupById);
router.post('/groups/:groupId/members', protect, GroupController.addMember);
router.delete('/groups/:groupId', protect, GroupController.deleteGroup); // New route for deleting a group

// Expense Routes (Protected)
router.post('/expenses', protect, ExpenseController.createExpense);
router.patch('/expenses/bulk-update', protect, ExpenseController.bulkUpdate);
router.put('/expenses/:expenseId', protect, ExpenseController.updateExpense);
router.delete('/expenses/:expenseId', protect, ExpenseController.deleteExpense);
router.get('/expenses/categories', protect, ExpenseController.getExpenseCategories);
router.get('/expenses/global', protect, ExpenseController.getGlobalExpenses);
router.get('/groups/:groupId/expenses', protect, ExpenseController.getGroupExpenses);
router.get('/groups/:groupId/expenses/chart', protect, ExpenseController.getChartExpenses);
router.get('/groups/:groupId/balance', protect, ExpenseController.getGroupBalance);
router.get('/groups/:groupId/settle', protect, ExpenseController.settleGroupDebts);

// Debt Transaction Routes (Protected)
router.post('/debt-transactions', protect, DebtTransactionController.createDebtTransaction);
router.get('/groups/:groupId/debt-transactions', protect, DebtTransactionController.getGroupDebtTransactions);
router.patch('/debt-transactions/:transactionId/pay', protect, DebtTransactionController.markDebtTransactionAsPaid);
router.delete('/debt-transactions/:transactionId', protect, DebtTransactionController.deleteDebtTransaction); // New route for deleting a debt transaction

// User Preferences Routes (Protected)
router.get('/user-preferences', protect, UserPreferencesController.getPreferences);
router.post('/user-preferences', protect, UserPreferencesController.savePreferences);

// Note Routes (Protected)
router.post('/groups/:groupId/notes', protect, NoteController.createNote);
router.get('/groups/:groupId/notes', protect, NoteController.getGroupNotes);
router.put('/notes/:noteId', protect, NoteController.updateNote);
router.delete('/notes/:noteId', protect, NoteController.deleteNote);


export default router;