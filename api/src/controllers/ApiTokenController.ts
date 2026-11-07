import { Request, Response, NextFunction } from 'express';
import ApiTokenService from '../services/ApiTokenService';

const userIdOf = (req: Request) => (req as any).user.id as string;

export const listTokens = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.status(200).json({ status: 'success', data: await ApiTokenService.list(userIdOf(req)) });
  } catch (error) { next(error); }
};

export const createToken = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await ApiTokenService.create((req as any).user, req.body?.nombre, req.body?.admin ?? false);
    res.status(201).json({ status: 'success', data: result });
  } catch (error) { next(error); }
};

export const revokeToken = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await ApiTokenService.revoke(userIdOf(req), req.params.tokenId);
    res.status(204).send();
  } catch (error) { next(error); }
};
