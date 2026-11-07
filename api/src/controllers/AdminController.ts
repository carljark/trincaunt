import { Request, Response, NextFunction } from 'express';
import AdminService from '../services/AdminService';

// Rutas de administración: van detrás de protect + requireAdmin

const actorIdOf = (req: Request) => String((req as any).user.id);

export const listUsers = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.status(200).json({ status: 'success', data: await AdminService.listUsers() });
  } catch (error) { next(error); }
};

export const createUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await AdminService.createUser(req.body?.nombre, req.body?.email);
    res.status(201).json({ status: 'success', data: result });
  } catch (error) { next(error); }
};

export const setUserRole = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await AdminService.setRole(actorIdOf(req), req.params.id, req.body?.role);
    res.status(200).json({ status: 'success', data: user });
  } catch (error) { next(error); }
};

export const setUserAI = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.status(200).json({ status: 'success', data: await AdminService.setAI(req.params.id, req.body?.aiEnabled) });
  } catch (error) { next(error); }
};

export const listGroups = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.status(200).json({ status: 'success', data: await AdminService.listGroups() });
  } catch (error) { next(error); }
};
