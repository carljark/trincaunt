import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AppError } from '../utils/AppError';
import User from '../models/User';

const JWT_SECRET = 'your-super-secret-key';

export const protect = async (req: Request, res: Response, next: NextFunction) => {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return next(new AppError('No estás autenticado.', 401));
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { id: string };
    
    // Attach user to the request object
    (req as any).user = await User.findById(decoded.id);
    if (!(req as any).user) {
        return next(new AppError('El usuario ya no existe.', 401));
    }

    next();
  } catch (error) {
    return next(new AppError('Token inválido o expirado.', 401));
  }
};
