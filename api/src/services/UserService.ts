import User, { IUser } from '../models/User';
import { AppError } from '../utils/AppError';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

export const MIN_PASSWORD = 8;

export class UserService {
  async register(data: Partial<IUser>): Promise<IUser> {
    const existingUser = await User.findOne({ email: data.email });
    if (existingUser) {
      throw new AppError('El email ya está registrado', 400);
    }
    
    if (data.password) {
      data.password = await bcrypt.hash(data.password, 10);
    }
    
    const user = await User.create(data);
    return user;
  }
  
  async login(email: string, password: string):Promise<{ token: string; user: IUser }> {
    const user = await User.findOne({ email }).select('+password');
    if (!user || !user.password) {
      throw new AppError('Credenciales incorrectas', 401);
    }
    
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      throw new AppError('Credenciales incorrectas', 401);
    }
    
    const JWT_SECRET = process.env.JWT_SECRET;
    if (!JWT_SECRET) {
      throw new AppError('JWT_SECRET no está definido en las variables de entorno', 500);
    }

    const token = jwt.sign({ id: user._id }, JWT_SECRET!);
    
    user.password = undefined as any;
    return { token, user };
  }

  /** Cambia la contraseña comprobando la actual. */
  async changePassword(userId: string, actual: unknown, nueva: unknown): Promise<void> {
    if (typeof actual !== 'string' || !actual) throw new AppError('Escribe tu contraseña actual', 400);
    if (typeof nueva !== 'string' || nueva.length < MIN_PASSWORD) {
      throw new AppError(`La contraseña nueva debe tener al menos ${MIN_PASSWORD} caracteres`, 400);
    }
    const user = await User.findById(userId).select('+password');
    if (!user || !user.password) throw new AppError('Usuario no encontrado', 404);
    if (!(await bcrypt.compare(actual, user.password))) throw new AppError('La contraseña actual no es correcta', 400);
    user.password = await bcrypt.hash(nueva, 10);
    await user.save();
  }

  async findByEmail(email: string): Promise<IUser | null> {
    return User.findOne({ email });
  }
}