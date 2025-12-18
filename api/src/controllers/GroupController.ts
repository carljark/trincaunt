import { Request, Response, NextFunction } from 'express';
import { GroupService } from '../services/GroupService';

const groupService = new GroupService();

export const createGroup = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user.id;
    const group = await groupService.createGroup(req.body, userId);
    res.status(201).json({ status: 'success', data: group });
  } catch (error) {
    next(error);
  }
};

export const addMember = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { groupId } = req.params;
    const { email } = req.body;
    const group = await groupService.addMember(groupId, email);
    res.status(200).json({ status: 'success', data: group });
  } catch (error) {
    next(error);
  }
};

export const getMyGroups = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user.id;
    const groups = await groupService.getGroupsForUser(userId);
    res.status(200).json({ status: 'success', data: groups });
  } catch (error) { next(error); }
};

export const getGroupById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { groupId } = req.params;
    const group = await groupService.getGroupById(groupId);
    res.status(200).json({ status: 'success', data: group });
  } catch (error) {
    next(error);
  }
};

export const deleteGroup = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { groupId } = req.params;
    await groupService.deleteGroup(groupId);
    res.status(204).json({ status: 'success', data: null });
  } catch (error) {
    next(error);
  }
};