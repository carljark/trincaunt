import { Request, Response, NextFunction } from 'express';
import { getIO } from '../config/socket';
import { BudgetService } from '../services/BudgetService';

const budgetService = new BudgetService();

const userIdOf = (req: Request) => (req as any).user.id as string;

// Avisa a los clientes del grupo para que recarguen gastos y presupuesto
const notifyGroup = (groupId: unknown) => {
  getIO().to(`group_${String(groupId)}`).emit('expenses_updated', { message: 'Presupuesto actualizado' });
};

export const getBudget = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const offset = req.query.offset !== undefined ? Number(req.query.offset) : 0;
    const summary = await budgetService.getSummary(req.params.groupId, userIdOf(req), offset);
    res.status(200).json({ status: 'success', data: summary });
  } catch (error) { next(error); }
};

export const getBudgetHistory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ciclos = req.query.ciclos !== undefined ? Number(req.query.ciclos) : 6;
    const history = await budgetService.getHistory(req.params.groupId, userIdOf(req), ciclos);
    res.status(200).json({ status: 'success', data: history });
  } catch (error) { next(error); }
};

export const getBudgetForecast = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ciclos = req.query.ciclos !== undefined ? Number(req.query.ciclos) : 6;
    const forecast = await budgetService.getForecast(req.params.groupId, userIdOf(req), ciclos);
    res.status(200).json({ status: 'success', data: forecast });
  } catch (error) { next(error); }
};

export const listRecurringItems = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const items = await budgetService.listRecurringItems(req.params.groupId, userIdOf(req));
    res.status(200).json({ status: 'success', data: items });
  } catch (error) { next(error); }
};

export const createRecurringItem = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const item = await budgetService.createRecurringItem(req.params.groupId, userIdOf(req), req.body);
    notifyGroup(req.params.groupId);
    res.status(201).json({ status: 'success', data: item });
  } catch (error) { next(error); }
};

export const updateRecurringItem = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const item = await budgetService.updateRecurringItem(req.params.itemId, userIdOf(req), req.body);
    notifyGroup(item.grupo_id);
    res.status(200).json({ status: 'success', data: item });
  } catch (error) { next(error); }
};

export const deleteRecurringItem = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const item = await budgetService.deleteRecurringItem(req.params.itemId, userIdOf(req));
    notifyGroup(item.grupo_id);
    res.status(204).send();
  } catch (error) { next(error); }
};

export const confirmRecurringItem = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await budgetService.confirmRecurringItem(req.params.itemId, userIdOf(req), req.body ?? {});
    notifyGroup(result.data.grupo_id);
    res.status(201).json({ status: 'success', data: result });
  } catch (error) { next(error); }
};

export const listIncomes = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const incomes = await budgetService.listIncomes(req.params.groupId, userIdOf(req));
    res.status(200).json({ status: 'success', data: incomes });
  } catch (error) { next(error); }
};

export const createIncome = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const income = await budgetService.createIncome(req.params.groupId, userIdOf(req), req.body);
    notifyGroup(req.params.groupId);
    res.status(201).json({ status: 'success', data: income });
  } catch (error) { next(error); }
};

export const updateIncome = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const income = await budgetService.updateIncome(req.params.incomeId, userIdOf(req), req.body);
    notifyGroup(income.grupo_id);
    res.status(200).json({ status: 'success', data: income });
  } catch (error) { next(error); }
};

export const deleteIncome = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const income = await budgetService.deleteIncome(req.params.incomeId, userIdOf(req));
    notifyGroup(income.grupo_id);
    res.status(204).send();
  } catch (error) { next(error); }
};
