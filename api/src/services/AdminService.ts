import crypto from 'crypto';
import mongoose from 'mongoose';
import User, { IUser } from '../models/User';
import Group from '../models/Group';
import { AppError } from '../utils/AppError';
import { UserService } from './UserService';

// Operaciones de administración: usuarios, roles y vista de todos los grupos.
// El acceso (rol + token con permiso de administración) lo comprueba requireAdmin.

const EMAIL = /^\S+@\S+\.\S+$/;

export interface AdminUserView {
  _id: string;
  nombre: string;
  email: string;
  role: 'user' | 'admin';
  aiEnabled: boolean;
  fecha_registro: Date;
}

const view = (u: IUser): AdminUserView => ({
  _id: String(u._id),
  nombre: u.nombre,
  email: u.email,
  role: u.role,
  aiEnabled: u.aiEnabled,
  fecha_registro: u.fecha_registro
});

const findUser = async (id: string) => {
  if (!mongoose.isValidObjectId(id)) throw new AppError('Usuario no válido', 400);
  const user = await User.findById(id);
  if (!user) throw new AppError('Usuario no encontrado', 404);
  return user;
};

/** Contraseña aleatoria de 16 caracteres (base64url), para pasársela al usuario nuevo. */
export const generatePassword = () => crypto.randomBytes(12).toString('base64url');

export class AdminService {
  constructor(private readonly users = new UserService()) {}

  async listUsers(): Promise<AdminUserView[]> {
    const users = await User.find({}).select('-password').sort({ fecha_registro: 1 });
    return users.map(view);
  }

  /** Crea un usuario con una contraseña generada, que solo se devuelve aquí. */
  async createUser(nombre: unknown, email: unknown): Promise<{ user: AdminUserView; password: string }> {
    if (typeof nombre !== 'string' || nombre.trim().length < 2) {
      throw new AppError('El nombre debe tener al menos 2 caracteres', 400);
    }
    if (typeof email !== 'string' || !EMAIL.test(email.trim())) throw new AppError('Email no válido', 400);
    const password = generatePassword();
    const user = await this.users.register({ nombre: nombre.trim(), email: email.trim(), password });
    return { user: view(user), password };
  }

  /** Hace o deja de hacer administrador a otro usuario (a uno mismo no, para no quedarse sin ninguno). */
  async setRole(actorId: string, userId: string, role: unknown): Promise<AdminUserView> {
    if (role !== 'user' && role !== 'admin') throw new AppError('El rol debe ser user o admin', 400);
    if (actorId === userId) throw new AppError('No puedes cambiar tu propio rol', 400);
    const user = await findUser(userId);
    user.role = role;
    await user.save();
    return view(user);
  }

  async setAI(userId: string, aiEnabled: unknown): Promise<AdminUserView> {
    if (typeof aiEnabled !== 'boolean') throw new AppError('aiEnabled debe ser verdadero o falso', 400);
    const user = await findUser(userId);
    user.aiEnabled = aiEnabled;
    await user.save();
    return view(user);
  }

  /** Todos los grupos, con sus miembros y creador. */
  async listGroups() {
    const groups = await Group.find({})
      .select('nombre tipo miembros creado_por fecha_creacion')
      .populate('miembros', 'nombre email')
      .populate('creado_por', 'nombre email')
      .sort({ fecha_creacion: 1 })
      .lean();
    return groups;
  }
}

export default new AdminService();
