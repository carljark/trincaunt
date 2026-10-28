import { Request, Response, NextFunction } from 'express';
import { DebtTransactionService } from '../services/DebtTransactionService';
import PushService, { formatAmount } from '../services/PushService';
import User from '../models/User';

const debtTransactionService = new DebtTransactionService();

export const getGroupDebtTransactions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { groupId } = req.params;
    const paidStatus = req.query.paid ? req.query.paid === 'true' : undefined; // Optional filter
    const transactions = await debtTransactionService.getDebtTransactionsByGroup(groupId, paidStatus);
    res.status(200).json({ status: 'success', data: transactions });
  } catch (error) {
    next(error);
  }
};

export const createDebtTransaction = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { from, to, group, amount } = req.body;
    const transaction = await debtTransactionService.createDebtTransaction({ from, to, group, amount });
    void notifyPayment((req as any).user.id, from, to, group, amount);
    res.status(201).json({ status: 'success', data: transaction });
  } catch (error) {
    next(error);
  }
};

export const markDebtTransactionAsPaid = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { transactionId } = req.params;
    const updatedTransaction = await debtTransactionService.markDebtTransactionAsPaid(transactionId);
    res.status(200).json({ status: 'success', data: updatedTransaction });
  } catch (error) {
    next(error);
  }
};

export const deleteDebtTransaction = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { transactionId } = req.params;
    await debtTransactionService.deleteDebtTransaction(transactionId);
    res.status(204).json({ status: 'success', data: null });
  } catch (error) {
    next(error);
  }
};

// Avisa a las dos partes del pago, salvo a quien lo registró
const notifyPayment = async (actorId: string, from: string, to: string, group: string, amount: number) => {
  try {
    const users = await User.find({ _id: { $in: [from, to] } }).select('nombre');
    const nameOf = (id: string) => users.find(u => u.id === id.toString())?.nombre ?? 'Alguien';
    const recipients = [from, to].map(id => id.toString()).filter(id => id !== actorId.toString());
    await PushService.notifyUsers(recipients, {
      title: 'Pago registrado',
      body: `${nameOf(from)} pagó ${formatAmount(Number(amount))} a ${nameOf(to)}`,
      url: `/group/${group}`
    });
  } catch (error) {
    console.error('Error notificando pago por push:', error);
  }
};
