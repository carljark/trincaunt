import Expense, { IExpense } from '../models/Expense';
import Group from '../models/Group';
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
      participantes
    });

    return expense;
  }

  async getExpensesByGroup(groupId: string): Promise<IExpense[]> {
    return Expense.find({ grupo_id: groupId })
      .populate('pagado_por', 'nombre')
      .populate('participantes', 'nombre');
  }

  async getGroupBalance(groupId: string): Promise<any> {
    const group = await Group.findById(groupId).populate('miembros', 'nombre email');
    if (!group) {
      throw new AppError('Grupo no encontrado', 404);
    }
    const expenses = await Expense.find({ grupo_id: groupId });

    const balances: { [userId: string]: number } = {};
    const allUserIds = new Set<string>();

    // Initialize balances for all current members
    for (const member of group.miembros) {
      const memberId = member._id.toString();
      balances[memberId] = 0;
      allUserIds.add(memberId);
    }

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

    const memberDetails = group.miembros.map((member: any) => ({
        id: member._id,
        nombre: member.nombre,
        email: member.email,
        balance: (balances[member._id.toString()] || 0) / 100, // Convert back to dollars
    }));

    return { balances: memberDetails };
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