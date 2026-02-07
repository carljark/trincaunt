
import { Request, Response, NextFunction } from 'express';
import { CategoryAliasService } from '../services/CategoryAliasService';

const aliasService = new CategoryAliasService();

export const getAllAliases = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const aliases = await aliasService.getAllAliases();
    res.status(200).json({ status: 'success', data: aliases });
  } catch (error) {
    next(error);
  }
};

export const createAlias = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const newAlias = await aliasService.createAlias(req.body);
    res.status(201).json({ status: 'success', data: newAlias });
  } catch (error) {
    next(error);
  }
};

export const updateAlias = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { aliasId } = req.params;
    const updatedAlias = await aliasService.updateAlias(aliasId, req.body);
    res.status(200).json({ status: 'success', data: updatedAlias });
  } catch (error) {
    next(error);
  }
};

export const deleteAlias = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { aliasId } = req.params;
    await aliasService.deleteAlias(aliasId);
    res.status(204).json({ status: 'success', data: null });
  } catch (error) {
    next(error);
  }
};
