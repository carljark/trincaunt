import { Request, Response, NextFunction } from 'express';
import { ExpenseService } from '../services/ExpenseService';

const expenseService = new ExpenseService();

export const createExpense = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user.id;
    const expense = await expenseService.createExpense(req.body, userId);
    res.status(201).json({ status: 'success', data: expense });
  } catch (error) {
    next(error);
  }
};

export const getGroupExpenses = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { groupId } = req.params;
    const expenses = await expenseService.getExpensesByGroup(groupId);
    res.status(200).json({ status: 'success', data: expenses });
  } catch (error) {
    next(error);
  }
};

export const getGroupBalance = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { groupId } = req.params;
    const balance = await expenseService.getGroupBalance(groupId);
    res.status(200).json({ status: 'success', data: balance });
  } catch (error) {
    next(error);
  }
};

export const updateExpense = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { expenseId } = req.params;
    const updatedExpense = await expenseService.updateExpense(expenseId, req.body);
    res.status(200).json({ status: 'success', data: updatedExpense });
  } catch (error) {
    next(error);
  }
};

export const deleteExpense = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { expenseId } = req.params;
    await expenseService.deleteExpense(expenseId);
    res.status(204).json({ status: 'success', data: null });
  } catch (error) {
    next(error);
  }
};

export const settleGroupDebts = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { groupId } = req.params;
    const transactions = await expenseService.settleGroupDebts(groupId);
    res.status(200).json({ status: 'success', data: transactions });
  } catch (error) {
    next(error);
  }
};