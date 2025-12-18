import { Request, Response, NextFunction } from 'express';
import { DebtTransactionService } from '../services/DebtTransactionService';

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
