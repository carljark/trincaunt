import { Request, Response, NextFunction } from 'express';
import OAuthService from '../services/OAuthService';

// Pantalla de permiso de la app (/oauth/consent): solo con la sesión de la app, no con un token de API

/** Qué aplicación pide acceso, para enseñárselo al usuario. */
export const describeAuthorization = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { client, error } = await OAuthService.checkAuthorize(req.query);
    res.status(200).json({ status: 'success', data: { cliente: client.nombre, error: error ?? null } });
  } catch (error) { next(error); }
};

/** El usuario permite o rechaza: devuelve a dónde volver. */
export const decideAuthorization = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const redirect = await OAuthService.decide((req as any).user, req.body?.params ?? {}, req.body?.permitir === true);
    res.status(200).json({ status: 'success', data: { redirect } });
  } catch (error) { next(error); }
};
