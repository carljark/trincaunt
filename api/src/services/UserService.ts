import User, { IUser } from '../models/User';
import { AppError } from '../utils/AppError';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

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

    const token = jwt.sign({ id: user._id }, JWT_SECRET!, {
      expiresIn: '1d',
    });
    
    user.password = undefined as any;
    return { token, user };
  }

  async findByEmail(email: string): Promise<IUser | null> {
    return User.findOne({ email });
  }
}