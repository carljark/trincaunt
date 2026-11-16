import { Request, Response, NextFunction } from 'express';
import { UserService } from '../services/UserService';
import { AppError } from '../utils/AppError';
import { AttemptLimiter, tooManyAttempts } from '../utils/rateLimit';

const userService = new UserService();

const MINUTE = 60 * 1000;
const EMAIL_RE = /^\S+@\S+\.\S+$/;
// Logins fallidos por IP y por email
const loginIpLimiter = new AttemptLimiter(20, 15 * MINUTE);
const loginEmailLimiter = new AttemptLimiter(10, 15 * MINUTE);
// Peticiones del correo de recuperación por IP y por email
const forgotIpLimiter = new AttemptLimiter(5, 60 * MINUTE);
const forgotEmailLimiter = new AttemptLimiter(3, 60 * MINUTE);
// Intentos de cambiar la contraseña con un enlace, por IP
const resetIpLimiter = new AttemptLimiter(20, 15 * MINUTE);

const clientIp = (req: Request) => req.ip ?? req.socket.remoteAddress ?? '';
const emailKey = (email: unknown) => (typeof email === 'string' ? email.trim().toLowerCase() : '');

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
  const { email, password } = req.body ?? {};
  const ip = clientIp(req);
  const key = emailKey(email);
  const wait = Math.max(loginIpLimiter.retryAfter(ip), loginEmailLimiter.retryAfter(key));
  if (wait) {
    res.status(429).json({ status: 'fail', message: tooManyAttempts(wait) });
    return;
  }
  try {
    let result;
    try {
      result = await userService.login(email, password);
    } catch (error) {
      if ((error as AppError).statusCode === 401) {
        loginIpLimiter.hit(ip);
        loginEmailLimiter.hit(key);
      }
      throw error;
    }
    // El contador de la IP se mantiene, o entrar en la cuenta propia lo reiniciaría
    loginEmailLimiter.reset(key);
    const { token, user } = result;

    res.status(200).json({
      status: 'success',
      token,
      data: { user }
    });
  } catch (error) {
    next(error);
  }
};
// Quién eres (útil con un token de API, que no trae los datos del usuario)
export const getMe = (req: Request, res: Response) => {
  const user = (req as any).user;
  res.status(200).json({
    status: 'success',
    data: {
      _id: String(user._id),
      nombre: user.nombre,
      email: user.email,
      role: user.role,
      // Solo con un token de API: si se creó con permiso de administración
      ...(req.apiTokenId ? { tokenAdmin: req.apiTokenAdmin === true } : {})
    }
  });
};

export const changePassword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await userService.changePassword(String((req as any).user.id), req.body?.actual, req.body?.nueva);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

export const forgotPassword = (req: Request, res: Response) => {
  const { email } = req.body ?? {};
  const ip = clientIp(req);
  const validEmail = typeof email === 'string' && EMAIL_RE.test(email.trim());
  const key = emailKey(email);
  const wait = Math.max(forgotIpLimiter.retryAfter(ip), validEmail ? forgotEmailLimiter.retryAfter(key) : 0);
  if (wait) {
    res.status(429).json({ status: 'fail', message: tooManyAttempts(wait) });
    return;
  }
  forgotIpLimiter.hit(ip);
  // La misma respuesta exista o no el email, y antes de buscarlo, para que no sirva para descubrir cuentas
  res.status(200).json({ status: 'success' });
  if (!validEmail) return;
  forgotEmailLimiter.hit(key);
  userService.requestPasswordReset(email).catch(err => console.error('password reset mail failed:', err));
};

export const resetPassword = async (req: Request, res: Response, next: NextFunction) => {
  const ip = clientIp(req);
  const wait = resetIpLimiter.retryAfter(ip);
  if (wait) {
    res.status(429).json({ status: 'fail', message: tooManyAttempts(wait) });
    return;
  }
  resetIpLimiter.hit(ip);
  try {
    const email = await userService.resetPassword(req.body?.token, req.body?.password);
    // Con la contraseña nueva se puede volver a intentar entrar en seguida
    loginEmailLimiter.reset(emailKey(email));
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};
