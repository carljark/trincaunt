import Group, { IGroup } from '../models/Group';
import User from '../models/User';
import Expense from '../models/Expense'; // Import Expense model
import DebtTransaction from '../models/DebtTransaction'; // Import DebtTransaction model
import { AppError } from '../utils/AppError';
import mongoose from 'mongoose'; // Import mongoose

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

    return groupsWithExpenses;
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
    // Add other updatable fields here as needed in the future

    await group.save();
    return group;
  }
}