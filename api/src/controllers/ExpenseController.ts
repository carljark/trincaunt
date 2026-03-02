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
    const category = req.query.category as string | undefined;
    const categories = category ? category.split(',') : [];
    const expenses = await expenseService.getExpensesByGroup(groupId, categories);
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

export const bulkUpdate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { expenseIds, updateData } = req.body;
    await expenseService.bulkUpdate(expenseIds, updateData);
    res.status(200).json({ status: 'success', message: 'Expenses updated successfully.' });
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



export const getExpenseCategories = async (req: Request, res: Response, next: NextFunction) => {

  try {

    const categories = await expenseService.getExpenseCategories();

    res.status(200).json({ status: 'success', data: categories });

  } catch (error) {

    next(error);

  }

};

export const getExpenseLocations = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const locations = await expenseService.getExpenseLocations();
    res.status(200).json({ status: 'success', data: locations });
  } catch (error) {
    next(error);
  }
};

export const getGlobalExpenses = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user.id;
    const category = req.query.category as string | undefined;
    const categories = category ? category.split(',') : [];
    const expenses = await expenseService.getGlobalExpenses(userId, categories);
    res.status(200).json({ status: 'success', data: expenses });
  } catch (error) {
    next(error);
  }
};

export const getChartExpenses = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { groupId } = req.params;
    const { startDate, endDate, weekdays, categories, localization } = req.query;

    const parsedWeekdays = typeof weekdays === 'string'
      ? weekdays.split(',').map(Number)
      : undefined;

    const parsedCategories = typeof categories === 'string'
      ? categories.split(',')
      : undefined;

    const chartData = await expenseService.getChartExpenses(
      groupId,
      startDate as string | undefined,
      endDate as string | undefined,
      parsedWeekdays,
      parsedCategories,
      localization as string | undefined
    );
    res.status(200).json({ status: 'success', data: chartData });
  } catch (error) {
    next(error);
  }
};
