import Expense, { IExpense } from '../models/Expense';
import Group, { IBalance, IGroup } from '../models/Group';
import User from '../models/User';
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

  async getExpensesByGroup(groupId: string): Promise<IExpense[]> {
    return Expense.find({ grupo_id: groupId })
      .populate('pagado_por', 'nombre')
      .populate('participantes', 'nombre');
  }

  async getGroupBalance(groupId: string): Promise<{ balances: IBalance[]}> {
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

    // Calculate balances in cents to avoid floating point issues
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

    const users = await User.find({ _id: { $in: Array.from(allUserIds) } }).select('nombre email');
    const userMap = new Map(users.map(u => [u._id.toString(), u]));

    const finalBalances = Array.from(allUserIds).map(userId => {
      const user = userMap.get(userId);
      return {
        id: userId,
        nombre: user?.nombre ?? 'Usuario Desconocido',
        email: user?.email ?? '',
        balance: (balances[userId] || 0) / 100,
      };
    });

    return { balances: finalBalances };
  }

  async settleGroupDebts(
    groupId: string
  ): Promise<{ transactions: { from: { id: string; nombre: string; }; to: { id: string; nombre: string; }; amount: number; }[] }> {
    const { balances: memberDetails } = await this.getGroupBalance(groupId);

    // Convertir saldos a centavos para trabajar con enteros y evitar problemas de punto flotante.
    const membersInCents = memberDetails.map(member => ({
      id: member.id,
      nombre: member.nombre,
      balance: Math.round(member.balance * 100),
    }));

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
    if (data.descripcion) {
      expense.descripcion = data.descripcion;
    }
    if (data.monto) {
      if (data.monto <= 0) throw new AppError('El monto debe ser mayor a 0', 400);
      expense.monto = data.monto;
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
}