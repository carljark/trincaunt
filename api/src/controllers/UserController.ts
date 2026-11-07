import { Request, Response, NextFunction } from 'express';
import { UserService } from '../services/UserService';

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
