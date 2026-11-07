import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AppError } from '../utils/AppError';
import User from '../models/User';
import { IUser } from '../models/User';
import ApiTokenService, { isApiToken } from '../services/ApiTokenService';

declare global {
  namespace Express {
    interface Request {
      user?: IUser | null;
      // Si la petición llega con un token de API (no con la sesión de la app)
      apiTokenId?: string;
      // El token de API se creó con permiso de administración
      apiTokenAdmin?: boolean;
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

  if (isApiToken(token)) {
    try {
      const auth = await ApiTokenService.authenticate(token);
      if (!auth) return next(new AppError('Token de API no válido o borrado.', 401));
      req.user = auth.user;
      req.apiTokenId = auth.tokenId;
      req.apiTokenAdmin = auth.admin;
      return next();
    } catch (error) {
      return next(error);
    }
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

/**
 * Solo con la sesión de la app, no con un token de API: gestionar los propios tokens
 * (un token filtrado no puede crear otros ni borrarlos), exportar e importar la base de datos
 * y cambiar la contraseña.
 */
export const sessionOnly = (req: Request, _res: Response, next: NextFunction) => {
  if (req.apiTokenId) return next(new AppError('Esta operación no se puede hacer con un token de API.', 403));
  next();
};

/**
 * Puede administrar: el usuario es administrador y, si llega con un token de API, ese token
 * se creó con permiso de administración. Si se le quita el rol, sus tokens dejan de administrar.
 */
export const hasAdminAccess = (req: Request) =>
  req.user?.role === 'admin' && (!req.apiTokenId || req.apiTokenAdmin === true);

/** Operaciones de administración (usuarios, roles, grupos ajenos). */
export const requireAdmin = (req: Request, _res: Response, next: NextFunction) => {
  if (req.user?.role !== 'admin') return next(new AppError('Solo un administrador puede hacer esto.', 403));
  if (!hasAdminAccess(req)) {
    return next(new AppError(
      'Este token de API no permite administración. Crea otro en Preferencias marcando «Permite administración».',
      403
    ));
  }
  next();
};
