import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AppError } from '../utils/AppError';
import User from '../models/User';
import { IUser } from '../models/User';
import ApiTokenService, { isApiToken } from '../services/ApiTokenService';
import { Scope } from '../services/scopes';

declare global {
  namespace Express {
    interface Request {
      user?: IUser | null;
      // Si la petición llega con un token de API (no con la sesión de la app)
      apiTokenId?: string;
      // El token de API se creó con permiso de administración
      apiTokenAdmin?: boolean;
      // Permisos del token de API; vacío es todo lo que puede hacer el usuario
      apiTokenScopes?: string[];
    }
  }
}

export const SCOPE_INSUFICIENTE = 'scope_insuficiente';

// Marca de los middlewares que crea `requireScope`, para que `protect` los encuentre en la ruta
const DECLARED_SCOPE = Symbol('scope');

// `protect` va en cada ruta (no en un router.use), así que `req.route` es la ruta que se va a ejecutar
const routeDeclaresScope = (req: Request) =>
  (req.route?.stack ?? []).some((layer: { handle?: Record<symbol, unknown> }) => layer.handle?.[DECLARED_SCOPE] !== undefined);

/**
 * Permiso que pide la ruta a los tokens de API con permisos (documentation/02-conectar-con-oauth.md).
 * Va después de `protect`. La sesión de la app y los tokens sin permisos pasan siempre.
 */
export const requireScope = (scope: Scope) => {
  const middleware = (req: Request, _res: Response, next: NextFunction) => {
    const scopes = req.apiTokenScopes ?? [];
    if (scopes.length && !scopes.includes(scope)) {
      return next(new AppError('Este token no permite esta operación.', 403, SCOPE_INSUFICIENTE));
    }
    next();
  };
  return Object.assign(middleware, { [DECLARED_SCOPE]: scope });
};

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
      req.apiTokenScopes = auth.scopes;
      // Cerrado por defecto: un token con permisos solo entra en las rutas que declaran uno
      if (auth.scopes.length && !routeDeclaresScope(req)) {
        return next(new AppError('Este token no permite esta operación.', 403, SCOPE_INSUFICIENTE));
      }
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
