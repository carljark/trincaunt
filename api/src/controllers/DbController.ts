import { Request, Response } from 'express';
import User from '../models/User';
import Group from '../models/Group';
import Expense from '../models/Expense';
import DebtTransaction from '../models/DebtTransaction';
import CategoryAlias from '../models/CategoryAlias';
import UserPreferences from '../models/UserPreferences';
import Note from '../models/Note';
import { AppError } from '../utils/AppError';

const isAdmin = (email?: string) => email === 'elcal.lico@gmail.com';

export const exportDB = async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    if (!isAdmin(user?.email)) {
      throw new AppError('Acceso denegado', 403);
    }

    const data = {
      users: await User.find({}),
      groups: await Group.find({}),
      expenses: await Expense.find({}),
      debtTransactions: await DebtTransaction.find({}),
      categoryAliases: await CategoryAlias.find({}),
      userPreferences: await UserPreferences.find({}),
      notes: await Note.find({})
    };

    res.status(200).json(data);
  } catch (error) {
    res.status(400).json({ status: 'error', message: (error as Error).message });
  }
};

export const importDB = async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    if (!isAdmin(user?.email)) {
      throw new AppError('Acceso denegado', 403);
    }

    const data = req.body;
    if (!data) throw new AppError('No data provided', 400);

    // Borrar todo
    await User.deleteMany({});
    await Group.deleteMany({});
    await Expense.deleteMany({});
    await DebtTransaction.deleteMany({});
    await CategoryAlias.deleteMany({});
    await UserPreferences.deleteMany({});
    await Note.deleteMany({});

    // Restaurar
    if (data.users && data.users.length) await User.insertMany(data.users);
    if (data.groups && data.groups.length) await Group.insertMany(data.groups);
    if (data.expenses && data.expenses.length) await Expense.insertMany(data.expenses);
    if (data.debtTransactions && data.debtTransactions.length) await DebtTransaction.insertMany(data.debtTransactions);
    if (data.categoryAliases && data.categoryAliases.length) await CategoryAlias.insertMany(data.categoryAliases);
    if (data.userPreferences && data.userPreferences.length) await UserPreferences.insertMany(data.userPreferences);
    if (data.notes && data.notes.length) await Note.insertMany(data.notes);

    res.status(200).json({ status: 'success', message: 'DDBB restaurada con éxito' });
  } catch (error) {
    res.status(400).json({ status: 'error', message: (error as Error).message });
  }
};
