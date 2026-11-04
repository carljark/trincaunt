import Group, { IGroup, IGroupPresupuesto, PRESUPUESTO_POR_DEFECTO } from '../models/Group';
import RecurringItem from '../models/RecurringItem';
import Income from '../models/Income';
import User from '../models/User';
import Expense from '../models/Expense'; // Import Expense model
import DebtTransaction from '../models/DebtTransaction'; // Import DebtTransaction model
import { AppError } from '../utils/AppError';
import mongoose from 'mongoose'; // Import mongoose
import UserPreferences from '../models/UserPreferences';

/**
 * Ordena los grupos según el orden guardado por el usuario. Los grupos que no
 * aparecen en él (p. ej. recién creados o a los que le acaban de añadir) van al
 * final, conservando el orden en que llegaron.
 */
export const sortByUserOrder = <T extends { _id: unknown }>(groups: T[], order: string[]): T[] => {
  const position = new Map(order.map((id, index) => [id, index]));
  const rank = (group: T) => position.get(String(group._id)) ?? Number.POSITIVE_INFINITY;
  return groups
    .map((group, index) => ({ group, index }))
    .sort((a, b) => (rank(a.group) - rank(b.group)) || (a.index - b.index))
    .map(({ group }) => group);
};

/** Mezcla los cambios con la configuración actual (o la de por defecto) y los valida. */
export const validatePresupuesto = (input: unknown, current?: IGroupPresupuesto | null): IGroupPresupuesto => {
  if (typeof input !== 'object' || input === null) throw new AppError('Configuración de presupuesto no válida', 400);
  const base = current ? JSON.parse(JSON.stringify(current)) : {};
  const merged = { ...PRESUPUESTO_POR_DEFECTO, ...base, ...(input as object) } as IGroupPresupuesto;

  if (!Number.isInteger(merged.diaInicioCiclo) || merged.diaInicioCiclo < 1 || merged.diaInicioCiclo > 31) {
    throw new AppError('El día de inicio del ciclo debe estar entre 1 y 31', 400);
  }
  if (typeof merged.ahorroObjetivo !== 'number' || !(merged.ahorroObjetivo >= 0)) {
    throw new AppError('El ahorro objetivo no puede ser negativo', 400);
  }
  if (typeof merged.incluirOtrosGrupos !== 'boolean') {
    throw new AppError('incluirOtrosGrupos debe ser verdadero o falso', 400);
  }
  return {
    diaInicioCiclo: merged.diaInicioCiclo,
    ahorroObjetivo: Math.round(merged.ahorroObjetivo * 100) / 100,
    incluirOtrosGrupos: merged.incluirOtrosGrupos
  };
};

export class GroupService {
  async createGroup(data: Partial<IGroup>, userId: string): Promise<IGroup> {
    const group = await Group.create({
      ...data,
      creado_por: userId,
      miembros: [userId] // Regla: Creador se añade automáticamente
    });
    return group;
  }

  async addMember(groupId: string, email: string): Promise<IGroup> {
    const group = await Group.findById(groupId);
    if (!group) throw new AppError('Grupo no encontrado', 404);
    if (group.tipo === 'personal') {
      throw new AppError('Un grupo personal no admite más miembros. Cámbialo a compartido primero.', 400);
    }

    const userToAdd = await User.findOne({ email });
    if (!userToAdd) throw new AppError('Usuario no encontrado', 404);

    // Verificar si ya es miembro
    const isMember = group.miembros.some(m => m.toString() === userToAdd.id);
    if (isMember) throw new AppError('El usuario ya es miembro del grupo', 400);

    group.miembros.push(userToAdd._id);
    await group.save();
    return group;
  }

  async getGroupsForUser(userId: string): Promise<any[]> {
    const groups = await Group.find({ miembros: userId }).populate('miembros', 'nombre email').lean();

    const groupsWithExpenses = await Promise.all(groups.map(async (group) => {
        const expenses = await Expense.find({ grupo_id: group._id });

        const totalExpenses = expenses.reduce((sum, expense) => sum + expense.monto, 0);

        const userShare = expenses.reduce((sum, expense) => {
            const isParticipant = expense.participantes.some(p => p.toString() === userId);
            if (!isParticipant) {
                return sum;
            }

            if (expense.asume_gasto) {
                if (expense.pagado_por.toString() === userId) {
                    return sum + expense.monto;
                }
                return sum;
            }

            return sum + (expense.monto / expense.participantes.length);
        }, 0);

        return {
            ...group,
            totalExpenses,
            userShare,
        };
    }));

    const preferences = await UserPreferences.findOne({ userId }).lean();
    return sortByUserOrder(groupsWithExpenses, preferences?.groupOrder?.map(id => id.toString()) ?? []);
  }

  async getGroupById(groupId: string): Promise<IGroup | null> {
    return Group.findById(groupId).populate('miembros', 'nombre email');
  }

  async deleteGroup(groupId: string): Promise<void> {
    const group = await Group.findById(groupId);
    if (!group) {
      throw new AppError('Grupo no encontrado', 404);
    }

    // Delete all expenses related to this group
    await Expense.deleteMany({ grupo_id: groupId });

    // Delete all debt transactions related to this group
    await DebtTransaction.deleteMany({ group: new mongoose.Types.ObjectId(groupId) } as any);

    // Delete the budget data of personal groups
    await RecurringItem.deleteMany({ grupo_id: groupId });
    await Income.deleteMany({ grupo_id: groupId });

    // Finally, delete the group itself
    await Group.deleteOne({ _id: groupId });
  }

  async removeMember(groupId: string, memberId: string): Promise<void> {
    const group = await Group.findById(groupId);
    if (!group) {
      throw new AppError('Grupo no encontrado', 404);
    }

    const memberObjectId = new mongoose.Types.ObjectId(memberId);
    
    // Check if the member is in the group
    const initialMemberCount = group.miembros.length;
    group.miembros = group.miembros.filter(m => m.toString() !== memberId);

    if (group.miembros.length === initialMemberCount) {
      throw new AppError('El usuario no es miembro de este grupo', 400);
    }

    // If no members are left, delete the group
    if (group.miembros.length === 0) {
      await this.deleteGroup(groupId);
      return;
    }

    // If the creator leaves, and there are other members, reassign creator or leave it as is
    // For simplicity, we'll leave it as is for now. If this causes issues, a more complex logic
    // to reassign or mark group as 'ownerless' would be needed.
    // If the creator leaves and is the only member, the group would have been deleted above.

    await group.save();
  }

  async updateGroup(groupId: string, data: Partial<IGroup>, userId: string): Promise<IGroup> {
    const group = await Group.findById(groupId);
    if (!group) {
      throw new AppError('Grupo no encontrado', 404);
    }

    // Only the creator can update the group
    if (group.creado_por.toString() !== userId) {
      throw new AppError('Solo el creador del grupo puede actualizarlo', 403);
    }

    if (data.nombre) {
      group.nombre = data.nombre;
    }

    if (data.tipo !== undefined) {
      if (!['compartido', 'personal'].includes(data.tipo)) {
        throw new AppError('El tipo debe ser compartido o personal', 400);
      }
      if (data.tipo === 'personal' && group.miembros.length !== 1) {
        throw new AppError('Solo un grupo con un único miembro puede ser personal', 400);
      }
      group.tipo = data.tipo;
    }

    if (data.presupuesto !== undefined) {
      group.presupuesto = validatePresupuesto(data.presupuesto, group.presupuesto);
    }

    await group.save();
    return group;
  }
}