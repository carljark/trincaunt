import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AppError } from '../utils/AppError';
import User from '../models/User';
import { IUser } from '../models/User';

declare global {
  namespace Express {
    interface Request {
      user?: IUser | null;
    }
  }
}

export const protect = async (req: Request, res: Response, next: NextFunction) => {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return next(new AppError('No estás autenticado.', 401));
  }

  try {
    const JWT_SECRET = process.env.JWT_SECRET;
    if (!JWT_SECRET) {
      throw new AppError('JWT_SECRET no está definido en las variables de entorno', 500);
    }
    const decoded = jwt.verify(token, JWT_SECRET) as { id: string };
    
    // Attach user to the request object
    req.user = await User.findById(decoded.id);
    if (!req.user) {
        return next(new AppError('El usuario ya no existe.', 401));
    }

    next();
  } catch (error) {
    return next(new AppError('Token inválido o expirado.', 401));
  }
};
