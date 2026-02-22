import { Request, Response, NextFunction } from 'express';
import { NoteService } from '../services/NoteService';

const noteService = new NoteService();

export const createNote = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { groupId } = req.params;
    const userId = (req as any).user.id;
    const noteData = { ...req.body, grupo_id: groupId };
    const note = await noteService.createNote(noteData, userId);
    res.status(201).json({ status: 'success', data: note });
  } catch (error) {
    next(error);
  }
};

export const getGroupNotes = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { groupId } = req.params;
    const userId = (req as any).user.id;
    const notes = await noteService.getNotesByGroup(groupId, userId);
    res.status(200).json({ status: 'success', data: notes });
  } catch (error) {
    next(error);
  }
};

export const updateNote = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { noteId } = req.params;
    const userId = (req as any).user.id;
    const updatedNote = await noteService.updateNote(noteId, req.body, userId);
    res.status(200).json({ status: 'success', data: updatedNote });
  } catch (error) {
    next(error);
  }
};

export const deleteNote = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { noteId } = req.params;
    const userId = (req as any).user.id;
    await noteService.deleteNote(noteId, userId);
    res.status(204).json({ status: 'success', data: null });
  } catch (error) {
    next(error);
  }
};
