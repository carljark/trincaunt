import DebtTransaction, { IDebtTransaction } from '../models/DebtTransaction';
import { AppError } from '../utils/AppError';
import mongoose from 'mongoose'; // Import mongoose

export class DebtTransactionService {

  async createDebtTransaction(data: { from: string; to: string; group: string; amount: number }): Promise<IDebtTransaction> {
    const { from, to, group, amount } = data;
    if (amount <= 0) {
      throw new AppError('El monto de la transacción debe ser mayor a 0', 400);
    }
    const debtTransaction = await DebtTransaction.create({
      from: new mongoose.Types.ObjectId(from),
      to: new mongoose.Types.ObjectId(to),
      group: new mongoose.Types.ObjectId(group),
      amount
    } as any); // Cast to any to bypass strict type checking
    return debtTransaction;
  }

  async getDebtTransactionsByGroup(groupId: string, paidStatus?: boolean): Promise<IDebtTransaction[]> {
    let query: any = { group: groupId };
    if (paidStatus !== undefined) {
      query.paid = paidStatus;
    }
    return DebtTransaction.find(query)
      .populate('from', 'nombre')
      .populate('to', 'nombre')
      .sort({ createdAt: 1 });
  }

  async markDebtTransactionAsPaid(transactionId: string): Promise<IDebtTransaction | null> {
    const debtTransaction = await DebtTransaction.findById(transactionId);
    if (!debtTransaction) {
      throw new AppError('Transacción de deuda no encontrada', 404);
    }
    if (debtTransaction.paid) {
      throw new AppError('Esta transacción ya ha sido marcada como pagada', 400);
    }
    debtTransaction.paid = true;
    await debtTransaction.save();
    return debtTransaction;
  }

  async deleteDebtTransaction(transactionId: string): Promise<void> {
    const debtTransaction = await DebtTransaction.findById(transactionId);
    if (!debtTransaction) {
      throw new AppError('Transacción de deuda no encontrada', 404);
    }
    await debtTransaction.deleteOne();
  }
}
