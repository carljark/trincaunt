import Expense, { IExpense } from '../models/Expense';
import Group, { IBalance } from '../models/Group';
import User from '../models/User';
import DebtTransaction, { ISettleGroupDebts } from '../models/DebtTransaction';
import CategoryAlias from '../models/CategoryAlias';
import { AppError } from '../utils/AppError';

export class ExpenseService {
  async createExpense(data: Partial<IExpense> & { assumeExpense?: boolean }, userId: string): Promise<IExpense> {
    const group = await Group.findById(data.grupo_id);
    if (!group) throw new AppError('Grupo no encontrado', 404);

    const payerId = data.pagado_por ? data.pagado_por.toString() : userId;

    // Regla: Usuario que paga debe ser miembro
    const isPayerMember = group.miembros.some(m => m.toString() === payerId);
    if (!isPayerMember) throw new AppError('El usuario que paga no pertenece al grupo', 403);

    // Regla: Monto > 0
    if (data.monto !== undefined && data.monto <= 0) throw new AppError('El monto debe ser mayor a 0', 400);

    let participantes;
    if (data.assumeExpense) {
      // El que paga asume el gasto completo, es el único participante.
      participantes = [payerId];
    } else if (data.participantes && data.participantes.length > 0) {
      // Se han especificado participantes
      participantes = data.participantes;
    } else {
      // Si no se especifican participantes, son todos los del grupo
      participantes = group.miembros;
    }

    const expense = await Expense.create({
      ...data,
      pagado_por: payerId,
      participantes,
      asume_gasto: data.assumeExpense || false
    });

    return expense;
  }

  async getExpensesByGroup(groupId: string, categoryFilter?: string): Promise<IExpense[]> {
    let query: any = { grupo_id: groupId };

    if (categoryFilter && categoryFilter !== 'all') {
      const relatedAliases = await CategoryAlias.find({ mainCategories: categoryFilter }).select('alias');
      const aliasCategories = relatedAliases.map(ca => ca.alias);

      // Include the filter itself and all its aliases
      const categoriesToFilter = [categoryFilter, ...aliasCategories];
      query.categoria = { $in: categoriesToFilter };
    }
    
    return Expense.find(query)
      .populate('pagado_por', 'nombre _id')
      .populate('participantes', 'nombre');
  }

  async getGlobalExpenses(userId: string): Promise<any[]> {
    const userGroups = await Group.find({ miembros: userId });
    const groupIds = userGroups.map(g => g._id);

    const expensesInUserGroups = await Expense.find({ grupo_id: { $in: groupIds }, participantes: userId })
      .populate('grupo_id', 'nombre')
      .populate('participantes', '_id')
      .populate('pagado_por', '_id');

    const globalExpenses = expensesInUserGroups.map(expense => {
      const expenseObject = expense.toObject();
      let userShare = 0;

      const isPayer = expenseObject.pagado_por._id.toString() === userId;

      if (expenseObject.asume_gasto) {
        if (isPayer) {
          userShare = expenseObject.monto;
        } else {
          userShare = 0; // Not the payer, so their share is 0
        }
      } else {
        userShare = expenseObject.monto / expenseObject.participantes.length;
      }

      return {
        ...expenseObject,
        monto: userShare,
        original_monto: expenseObject.monto,
        grupo_nombre: (expenseObject.grupo_id as any)?.nombre || 'Grupo Desconocido',
      };
    });

    return globalExpenses.filter(e => e.monto > 0);
  }

  async getGroupBalance(groupId: string): Promise<{ balances: IBalance[]}> {
    const { balances, allUserIds, expenses } = await this._getInitialBalancesAndUsers(groupId);
    this._calculateExpenseBalances(expenses, balances);
    await this._incorporateDebtTransactions(groupId, balances, allUserIds);

    const finalBalances = await this._formatFinalBalances(allUserIds, balances);
    return { balances: finalBalances };
  }

  private async _getInitialBalancesAndUsers(groupId: string): Promise<{ balances: { [userId: string]: number }, allUserIds: Set<string>, expenses: IExpense[], group: any }> {
    const group = await Group.findById(groupId);
    if (!group) {
      throw new AppError('Grupo no encontrado', 404);
    }
    const expenses = await Expense.find({ grupo_id: groupId });

    const balances: { [userId: string]: number } = {};
    const allUserIds = new Set<string>();

    // Initialize balances for all current members
    group.miembros.forEach(memberId => {
      const id = memberId.toString();
      balances[id] = 0;
      allUserIds.add(id);
    });

    // Collect all users involved in expenses, even if they left the group
    for (const expense of expenses) {
      allUserIds.add(expense.pagado_por.toString());
      expense.participantes.forEach(p => allUserIds.add(p.toString()));
    }
    
    // Ensure all involved users are in the balance sheet
    allUserIds.forEach(id => {
      balances[id] ??= 0;
    });

    return { balances, allUserIds, expenses, group };
  }

  private _calculateExpenseBalances(expenses: IExpense[], balances: { [userId: string]: number }): void {
    for (const expense of expenses) {
      if (expense.asume_gasto) {
        continue;
      }
      const payerId = expense.pagado_por.toString();
      const amountInCents = Math.round(expense.monto * 100);
      const numParticipants = expense.participantes.length;

      if (numParticipants === 0) continue;

      // Payer gets the full amount added to their balance
      balances[payerId] += amountInCents;

      // Distribute the cost among participants
      const shareInCents = Math.floor(amountInCents / numParticipants);
      let remainder = amountInCents % numParticipants;

      for (const participantId of expense.participantes) {
        const pid = participantId.toString();
        let cost = shareInCents;
        if (remainder > 0) {
          cost += 1;
          remainder--;
        }
        balances[pid] -= cost;
      }
    }
  }

    private async _incorporateDebtTransactions(groupId: string, balances: { [userId: string]: number }, allUserIds: Set<string>): Promise<void> {
      const debtTransactions = await DebtTransaction.find({ group: groupId });
      for (const dt of debtTransactions) {
        const fromUser = dt.from.toString();
        const toUser = dt.to.toString();
        const amountInCents = Math.round(dt.amount * 100);
  
        // 'fromUser' is the payer, their balance should increase (they are settling a debt).
        if (balances[fromUser] === undefined) {
          balances[fromUser] = amountInCents;
        } else {
          balances[fromUser] += amountInCents;
        }
  
        // 'toUser' is the receiver, their balance should decrease (their credit is being paid off).
        if (balances[toUser] === undefined) {
          balances[toUser] = -amountInCents;
        } else {
          balances[toUser] -= amountInCents;
        }
        allUserIds.add(fromUser);
        allUserIds.add(toUser);
      }
    }
  private async _formatFinalBalances(allUserIds: Set<string>, balances: { [userId: string]: number }): Promise<IBalance[]> {
    const users = await User.find({ _id: { $in: Array.from(allUserIds) } }).select('nombre email');
    const userMap = new Map(users.map(u => [u._id.toString(), u]));

    return Array.from(allUserIds).map(userId => {
      const user = userMap.get(userId);
      return {
        id: userId,
        nombre: user?.nombre ?? 'Usuario Desconocido',
        email: user?.email ?? '',
        balance: (balances[userId] || 0) / 100,
      };
    });
  }

  async settleGroupDebts(
    groupId: string
  ): Promise<ISettleGroupDebts> {
    const { balances: memberDetails } = await this.getGroupBalance(groupId);

    // Filter out members who are not part of the group or have 0 balance after adjustments
    const membersInCents = memberDetails.map(member => ({
      id: member.id,
      nombre: member.nombre,
      balance: Math.round(member.balance * 100), // Convert to cents, as getGroupBalance returns in dollars
    })).filter(m => m.balance !== 0);

    const debtors = membersInCents.filter(m => m.balance < 0);
    const creditors = membersInCents.filter(m => m.balance > 0);

    // Ordenar deudores de mayor a menor deuda y acreedores de mayor a menor crédito.
    debtors.sort((a, b) => a.balance - b.balance);
    creditors.sort((a, b) => b.balance - a.balance);

    const transactions: { from: { id: string; nombre: string; }; to: { id: string; nombre: string; }; amount: number; }[] = [];
    let debtorIndex = 0;
    let creditorIndex = 0;

    // Este algoritmo liquida las deudas de forma codiciosa para minimizar el número de transacciones.
    while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
      const debtor = debtors[debtorIndex];
      const creditor = creditors[creditorIndex];

      const amountToSettle = Math.min(-debtor.balance, creditor.balance);

      transactions.push({
        from: { id: debtor.id, nombre: debtor.nombre },
        to: { id: creditor.id, nombre: creditor.nombre },
        amount: amountToSettle / 100,
      });

      // Actualizar saldos con el monto liquidado.
      debtor.balance += amountToSettle;
      creditor.balance -= amountToSettle;

      // Si el saldo de un deudor se liquida, pasar al siguiente.
      if (debtor.balance === 0) {
        debtorIndex++;
      }
      // Si el saldo de un acreedor se liquida, pasar al siguiente.
      if (creditor.balance === 0) {
        creditorIndex++;
      }
    }

    return { transactions };
  }

  async updateExpense(expenseId: string, data: Partial<IExpense>): Promise<IExpense | null> {
    const expense = await Expense.findById(expenseId);
    if (!expense) {
      throw new AppError('Gasto no encontrado', 404);
    }
    
    // Allow updating only certain fields
    if (data.descripcion !== undefined) { // Check for undefined to allow empty string
      expense.descripcion = data.descripcion;
    }
    if (data.monto !== undefined) {
      if (data.monto <= 0) throw new AppError('El monto debe ser mayor a 0', 400);
      expense.monto = data.monto;
    }
    if (data.categoria !== undefined) { // Check for undefined to allow empty array
      expense.categoria = data.categoria;
    }
    if (data.fecha !== undefined) {
      expense.fecha = data.fecha;
    }
    if (data.participantes !== undefined) {
      expense.participantes = data.participantes;
    }
    if (data.pagado_por !== undefined) {
      expense.pagado_por = data.pagado_por;
    }
    if (data.asume_gasto !== undefined) {
      expense.asume_gasto = data.asume_gasto;
    }

    await expense.save();
    return expense;
  }

  

    async deleteExpense(expenseId: string): Promise<void> {

      const expense = await Expense.findById(expenseId);

      if (!expense) {

        throw new AppError('Gasto no encontrado', 404);

      }

  

      await expense.deleteOne();

    }

  

    async getExpenseCategories(): Promise<{ category: string, count: number }[]> {
      const categories = await Expense.aggregate([
        { $unwind: "$categoria" },
        { $match: { categoria: { $nin: [null, ""] } } },
        { $group: { _id: "$categoria", count: { $sum: 1 } } },
        { $sort: { count: -1, _id: 1 } },
        { $project: { _id: 0, category: "$_id", count: 1 } }
      ]);
      return categories;
    }

  }

  