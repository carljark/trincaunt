import { Router } from 'express';
import * as UserController from '../controllers/UserController';
import * as GroupController from '../controllers/GroupController';
import * as ExpenseController from '../controllers/ExpenseController';
import * as DebtTransactionController from '../controllers/DebtTransactionController';
import * as CategoryAliasController from '../controllers/CategoryAliasController';
import * as UserPreferencesController from '../controllers/UserPreferencesController';
import * as NoteController from '../controllers/NoteController'; // Import NoteController
import * as DbController from '../controllers/DbController';
import * as PushController from '../controllers/PushController';
import * as BudgetController from '../controllers/BudgetController';
import { protect } from '../middlewares/authMiddleware';
import {
  requireGroupMember,
  requireMemberOfDoc,
  requireMemberOfExpenses,
  requireAliasAccess
} from '../middlewares/groupAccess';
import Expense from '../models/Expense';
import DebtTransaction from '../models/DebtTransaction';

// Miembro del grupo de la URL (/groups/:groupId/...)
const groupMember = requireGroupMember('params', 'groupId');

const router = Router();

// DB Routes
router.get('/db/export', protect, DbController.exportDB);
router.post('/db/import', protect, DbController.importDB);


// User Routes
router.post('/users/register', UserController.register);
router.post('/users/login', UserController.login);
router.get('/users/admin/all', protect, UserController.getAllUsers);
router.patch('/users/admin/:id/ai', protect, UserController.toggleUserAI);

// Category Alias Routes (Protected)
router.get('/category-aliases', protect, requireGroupMember('query', 'groupId', { optional: true }), CategoryAliasController.getAllAliases);
router.post('/category-aliases', protect, requireAliasAccess('create'), CategoryAliasController.createAlias);
router.put('/category-aliases/:aliasId', protect, requireAliasAccess('change'), CategoryAliasController.updateAlias);
router.delete('/category-aliases/:aliasId', protect, requireAliasAccess('change'), CategoryAliasController.deleteAlias);

// Group Routes (Protected)
router.post('/groups', protect, GroupController.createGroup);
router.get('/groups', protect, GroupController.getMyGroups);
router.get('/groups/:groupId', protect, groupMember, GroupController.getGroupById);
router.put('/groups/:groupId', protect, groupMember, GroupController.updateGroup); // Solo el creador (lo comprueba el servicio)
router.post('/groups/:groupId/members', protect, groupMember, GroupController.addMember);
router.delete('/groups/:groupId', protect, groupMember, GroupController.deleteGroup); // Solo el creador
router.delete('/groups/:groupId/members/:memberId', protect, groupMember, GroupController.removeMember); // Solo uno mismo

import multer from 'multer';

// Expense Routes (Protected)
const uploadMemory = multer({ storage: multer.memoryStorage() });
const expenseMember = requireMemberOfDoc(Expense, 'expenseId', 'grupo_id', 'Gasto');
// multer va antes: el grupo llega en el cuerpo multipart
router.post('/expenses/ai-parse', protect, uploadMemory.single('media'), requireGroupMember('body', 'grupo_id'), ExpenseController.parseExpenseWithAI);
router.post('/expenses', protect, requireGroupMember('body', 'grupo_id'), ExpenseController.createExpense);
router.patch('/expenses/bulk-update', protect, requireMemberOfExpenses, ExpenseController.bulkUpdate);
router.put('/expenses/:expenseId', protect, expenseMember, ExpenseController.updateExpense);
router.delete('/expenses/:expenseId', protect, expenseMember, ExpenseController.deleteExpense);
// Sin groupId: categorías y lugares de todos tus grupos (no de toda la base de datos)
router.get('/expenses/categories', protect, requireGroupMember('query', 'groupId', { optional: true }), ExpenseController.getExpenseCategories);
router.get('/expenses/locations', protect, ExpenseController.getExpenseLocations);
router.get('/expenses/global', protect, ExpenseController.getGlobalExpenses);
router.get('/groups/:groupId/expenses', protect, groupMember, ExpenseController.getGroupExpenses);
router.get('/groups/:groupId/expenses/chart', protect, groupMember, ExpenseController.getChartExpenses);
router.get('/groups/:groupId/balance', protect, groupMember, ExpenseController.getGroupBalance);
router.get('/groups/:groupId/settle', protect, groupMember, ExpenseController.settleGroupDebts);

// Debt Transaction Routes (Protected)
const debtMember = requireMemberOfDoc(DebtTransaction, 'transactionId', 'group', 'Transacción de deuda');
router.post('/debt-transactions', protect, requireGroupMember('body', 'group'), DebtTransactionController.createDebtTransaction);
router.get('/groups/:groupId/debt-transactions', protect, groupMember, DebtTransactionController.getGroupDebtTransactions);
router.patch('/debt-transactions/:transactionId/pay', protect, debtMember, DebtTransactionController.markDebtTransactionAsPaid);
router.delete('/debt-transactions/:transactionId', protect, debtMember, DebtTransactionController.deleteDebtTransaction);

// User Preferences Routes (Protected)
router.get('/user-preferences', protect, UserPreferencesController.getPreferences);
router.post('/user-preferences', protect, UserPreferencesController.savePreferences);
router.put('/user-preferences/group-order', protect, UserPreferencesController.saveGroupOrder);

// Note Routes (Protected)
router.post('/groups/:groupId/notes', protect, groupMember, NoteController.createNote);
router.get('/groups/:groupId/notes', protect, groupMember, NoteController.getGroupNotes);
router.put('/notes/:noteId', protect, NoteController.updateNote);
router.delete('/notes/:noteId', protect, NoteController.deleteNote);

// Budget Routes (Protected, solo grupos personales)
router.get('/groups/:groupId/budget', protect, BudgetController.getBudget);
router.get('/groups/:groupId/budget/history', protect, BudgetController.getBudgetHistory);
router.get('/groups/:groupId/recurring-items', protect, BudgetController.listRecurringItems);
router.post('/groups/:groupId/recurring-items', protect, BudgetController.createRecurringItem);
router.put('/recurring-items/:itemId', protect, BudgetController.updateRecurringItem);
router.delete('/recurring-items/:itemId', protect, BudgetController.deleteRecurringItem);
router.post('/recurring-items/:itemId/confirm', protect, BudgetController.confirmRecurringItem);
router.get('/groups/:groupId/incomes', protect, BudgetController.listIncomes);
router.post('/groups/:groupId/incomes', protect, BudgetController.createIncome);
router.put('/incomes/:incomeId', protect, BudgetController.updateIncome);
router.delete('/incomes/:incomeId', protect, BudgetController.deleteIncome);

// Push Notification Routes
router.get('/push/public-key', PushController.getPublicKey);
router.post('/push/subscribe', protect, PushController.subscribe);
router.post('/push/unsubscribe', protect, PushController.unsubscribe);

export default router;