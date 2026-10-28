import { Request, Response, NextFunction } from 'express';
import PushService from '../services/PushService';

export const getPublicKey = (req: Request, res: Response, next: NextFunction) => {
  try {
    res.status(200).json({ status: 'success', data: { publicKey: PushService.getPublicKey() } });
  } catch (error) {
    next(error);
  }
};

export const subscribe = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user.id;
    await PushService.subscribe(userId, req.body);
    res.status(201).json({ status: 'success', data: null });
  } catch (error) {
    next(error);
  }
};

export const unsubscribe = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user.id;
    await PushService.unsubscribe(userId, req.body.endpoint);
    res.status(200).json({ status: 'success', data: null });
  } catch (error) {
    next(error);
  }
};
