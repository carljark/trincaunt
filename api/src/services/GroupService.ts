import Group, { IGroup } from '../models/Group';
import User from '../models/User';
import Expense from '../models/Expense'; // Import Expense model
import DebtTransaction from '../models/DebtTransaction'; // Import DebtTransaction model
import { AppError } from '../utils/AppError';

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

  async getGroupsForUser(userId: string): Promise<IGroup[]> {
    return Group.find({ miembros: userId }).populate('miembros', 'nombre email');
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
    await DebtTransaction.deleteMany({ group: groupId });

    // Finally, delete the group itself
    await Group.deleteOne({ _id: groupId });
  }
}