import { Request, Response, NextFunction } from 'express';
import { UserService } from '../services/UserService';
import User from '../models/User';
import { AppError } from '../utils/AppError';

const userService = new UserService();

export const register = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { nombre, email, password } = req.body;
    const user = await userService.register({ nombre, email, password });
    
    res.status(201).json({
      status: 'success',
      data: { user: { id: user._id, nombre: user.nombre, email: user.email } }
    });
  } catch (error) {
    next(error);
  }
};

export const login = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body;
    const { token, user } = await userService.login(email, password);

    res.status(200).json({
      status: 'success',
      token,
      data: { user }
    });
  } catch (error) {
    next(error);
  }
};
export const getAllUsers = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).user;
    if (user.role !== 'admin') throw new AppError('Acceso denegado', 403);
    
    // Devolvemos la info necesaria
    const users = await User.find({}).select('-password');
    res.status(200).json({ status: 'success', data: users });
  } catch (error) {
    next(error);
  }
};

export const toggleUserAI = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).user;
    if (user.role !== 'admin') throw new AppError('Acceso denegado', 403);
    
    const { id } = req.params;
    const { aiEnabled } = req.body;
    
    const updatedUser = await User.findByIdAndUpdate(id, { aiEnabled }, { new: true }).select('-password');
    if (!updatedUser) throw new AppError('Usuario no encontrado', 404);
    
    res.status(200).json({ status: 'success', data: updatedUser });
  } catch (error) {
    next(error);
  }
};
