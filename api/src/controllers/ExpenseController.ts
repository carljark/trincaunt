import { Request, Response, NextFunction } from 'express';
import { getIO } from '../config/socket';
import { ExpenseService } from '../services/ExpenseService';
import Group from '../models/Group';
import { CategoryAliasService } from '../services/CategoryAliasService';
import PushService, { formatAmount } from '../services/PushService';
import BudgetAlertService from '../services/BudgetAlertService';
import Expense from '../models/Expense';

const expenseService = new ExpenseService();
const aliasService = new CategoryAliasService();

export const createExpense = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user.id;
    const expense = await expenseService.createExpense(req.body, userId);
    getIO().to(`group_${req.body.grupo_id}`).emit('expenses_updated', { message: 'Gasto registrado' });
    void PushService.notifyGroupMembers(req.body.grupo_id, userId, (groupName) => ({
      title: `Nuevo gasto en ${groupName}`,
      body: `${(req as any).user.nombre} añadió «${req.body.descripcion}»: ${formatAmount(Number(req.body.monto))}`,
      url: `/group/${req.body.grupo_id}`
    }));
    void BudgetAlertService.checkAfterExpenseChange([req.body.grupo_id]);
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
    if (updatedExpense) {
      getIO().to(`group_${updatedExpense.grupo_id}`).emit('expenses_updated', { message: 'Gasto actualizado' });
      void BudgetAlertService.checkAfterExpenseChange([updatedExpense.grupo_id]);
    }
    res.status(200).json({ status: 'success', data: updatedExpense });
  } catch (error) {
    next(error);
  }
};

export const deleteExpense = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { expenseId } = req.params;
    // In Trincaunt we don't have getExpenseById exposed in service easily, so let's just rely on the client refreshing or passing the group id in the query/body
    await expenseService.deleteExpense(expenseId);
    // We broadcast to all rooms as a fallback since we don't have the group ID handy here, or we extract it before deleting
    res.status(204).json({ status: 'success', data: null });
  } catch (error) {
    next(error);
  }
};

export const bulkUpdate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { expenseIds, updateData } = req.body;
    await expenseService.bulkUpdate(expenseIds, updateData);
    // Después de actualizar: si se han movido, cuentan en su grupo nuevo
    void Expense.distinct('grupo_id', { _id: { $in: expenseIds } })
      .then(groupIds => BudgetAlertService.checkAfterExpenseChange(groupIds))
      .catch(error => console.error('Error comprobando avisos de presupuesto:', error));
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



// El grupo comprobado por el middleware o, si no se pidió uno, todos los del usuario
const scopeGroupIds = async (req: Request, res: Response): Promise<string[]> => {
  if (res.locals.group) return [res.locals.group._id.toString()];
  const ids = await Group.find({ miembros: (req as any).user.id }).distinct('_id');
  return ids.map(id => id.toString());
};

export const getExpenseCategories = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const categories = await expenseService.getExpenseCategories(await scopeGroupIds(req, res));
    res.status(200).json({ status: 'success', data: categories });
  } catch (error) {
    next(error);
  }
};

export const getExpenseLocations = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const locations = await expenseService.getExpenseLocations(await scopeGroupIds(req, res));
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

import AiService, { GroupMemberRef, ParsedExpense } from '../services/AiService';
import { AppError } from '../utils/AppError';
import User from '../models/User';

const MAX_AI_TEXT_LENGTH = 2000;
const MAX_BATCH_EXPENSES = 50;

// Fecha de hoy en España (AAAA-MM-DD)
const todayInSpain = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });

const isIsoDay = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) && !Number.isNaN(new Date(value.slice(0, 10)).getTime());

/**
 * Lee un mensaje, una foto o un audio con la IA y devuelve los gastos que detecta, SIN guardarlos:
 * el usuario los revisa y los confirma con POST /expenses/batch.
 */
export const draftExpensesWithAI = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).user;
    if (user.role !== 'admin' && !user.aiEnabled) {
      throw new AppError('Acceso denegado a las funciones de IA. Contacta con el administrador.', 403);
    }

    const texto = typeof req.body?.texto === 'string' ? req.body.texto.trim() : '';
    if (!req.file && !texto) {
      throw new AppError('Escribe un mensaje o adjunta una foto o un audio', 400);
    }
    if (texto.length > MAX_AI_TEXT_LENGTH) {
      throw new AppError(`El mensaje no puede pasar de ${MAX_AI_TEXT_LENGTH} caracteres`, 400);
    }

    const group = res.locals.group;
    const memberIds: string[] = group.miembros.map((m: unknown) => String(m));
    const memberDocs = await User.find({ _id: { $in: memberIds } }).select('nombre').lean();
    const members: GroupMemberRef[] = memberDocs.map(m => ({ id: String(m._id), nombre: m.nombre }));

    const parsed: ParsedExpense[] = req.file
      ? await AiService.parseExpenseFromMedia(req.file.buffer, req.file.mimetype, members)
      : await AiService.parseExpenseFromText(texto, members);

    const userId = String(user.id);
    const fallbackLocation = typeof req.body?.localization === 'string' ? req.body.localization : '';
    const drafts = parsed
      .filter(exp => exp.monto > 0 && exp.descripcion.trim() !== '')
      .map(exp => ({
        descripcion: exp.descripcion.trim(),
        monto: Math.round(exp.monto * 100) / 100,
        fecha: isIsoDay(exp.fecha) ? exp.fecha.slice(0, 10) : todayInSpain(),
        categoria: Array.isArray(exp.categoria) && exp.categoria.length > 0 ? exp.categoria.map(String) : ['IA'],
        localization: exp.localization || fallbackLocation,
        pagado_por: exp.pagado_por && memberIds.includes(String(exp.pagado_por)) ? String(exp.pagado_por) : userId,
      }));

    res.status(200).json({ status: 'success', data: drafts });
  } catch (error) {
    next(error);
  }
};

/** Guarda varios gastos de una vez (los borradores confirmados de la IA) con un solo aviso push. */
export const createExpensesBatch = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { grupo_id, gastos } = req.body ?? {};
    if (!Array.isArray(gastos) || gastos.length === 0) {
      throw new AppError('No hay gastos que guardar', 400);
    }
    if (gastos.length > MAX_BATCH_EXPENSES) {
      throw new AppError(`No se pueden guardar más de ${MAX_BATCH_EXPENSES} gastos a la vez`, 400);
    }

    const userId = String((req as any).user.id);
    const expensesData = gastos.map((g: any) => {
      const descripcion = typeof g?.descripcion === 'string' ? g.descripcion.trim() : '';
      const monto = Number(g?.monto);
      if (!descripcion || !Number.isFinite(monto) || monto <= 0) {
        throw new AppError('Cada gasto necesita una descripción y un importe mayor que 0', 400);
      }
      return {
        grupo_id,
        descripcion,
        monto,
        pagado_por: [typeof g.pagado_por === 'string' && g.pagado_por ? g.pagado_por : userId],
        fecha: isIsoDay(g.fecha) ? new Date(g.fecha.slice(0, 10)) : new Date(),
        asume_gasto: false,
        categoria: Array.isArray(g.categoria) ? g.categoria.filter((c: unknown) => typeof c === 'string' && c) : [],
        localization: typeof g.localization === 'string' ? g.localization : '',
      };
    });

    const createdExpenses: Awaited<ReturnType<typeof expenseService.createExpense>>[] = [];
    for (const expenseData of expensesData) {
      createdExpenses.push(await expenseService.createExpense(expenseData, userId));
    }

    getIO().to(`group_${grupo_id}`).emit('expenses_updated', { message: 'Nuevos gastos' });
    const total = createdExpenses.reduce((sum, e) => sum + Number(e.monto), 0);
    void PushService.notifyGroupMembers(grupo_id, userId, (groupName) => ({
      title: `Nuevos gastos en ${groupName}`,
      body: createdExpenses.length === 1
        ? `${(req as any).user.nombre} añadió «${createdExpenses[0].descripcion}»: ${formatAmount(total)}`
        : `${(req as any).user.nombre} añadió ${createdExpenses.length} gastos (${formatAmount(total)})`,
      url: `/group/${grupo_id}`
    }));
    void BudgetAlertService.checkAfterExpenseChange([grupo_id]);

    res.status(201).json({ status: 'success', data: createdExpenses });
  } catch (error) {
    next(error);
  }
};
