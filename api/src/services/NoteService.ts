import Note, { INote } from '../models/Note';
import Group from '../models/Group';
import { AppError } from '../utils/AppError';
import mongoose from 'mongoose';

export class NoteService {
  async createNote(data: Partial<INote>, userId: string): Promise<INote> {
    const group = await Group.findById(data.grupo_id);
    if (!group) {
      throw new AppError('Grupo no encontrado', 404);
    }

    // Ensure the creator is a member of the group
    if (!group.miembros.some(member => member.toString() === userId)) {
      throw new AppError('El usuario creador no pertenece al grupo', 403);
    }

    // Ensure all readers are members of the group
    if (data.lectores && data.lectores.length > 0) {
      const allReadersAreMembers = data.lectores.every(readerId => 
        group.miembros.some(member => member.toString() === readerId.toString())
      );
      if (!allReadersAreMembers) {
        throw new AppError('Alguno de los lectores especificados no pertenece al grupo', 403);
      }
    } else {
        // If no readers are specified, the note is private to the creator by default
        data.lectores = [new mongoose.Types.ObjectId(userId)];
    }

    const note = await Note.create({
      ...data,
      creado_por: new mongoose.Types.ObjectId(userId),
    });

    return note;
  }

  async getNotesByGroup(groupId: string, userId: string): Promise<INote[]> {
    const groupObjectId = new mongoose.Types.ObjectId(groupId);
    const userObjectId = new mongoose.Types.ObjectId(userId);

    const notes = await Note.find({
      grupo_id: groupObjectId,
      $or: [
        { creado_por: userObjectId }, // Creator can always see their notes
        { lectores: userObjectId }    // User is in the readers list
      ]
    })
    .populate('creado_por', 'nombre')
    .populate('lectores', 'nombre');

    return notes;
  }

  async updateNote(noteId: string, data: Partial<INote>, userId: string): Promise<INote | null> {
    const note = await Note.findById(noteId);

    if (!note) {
      throw new AppError('Nota no encontrada', 404);
    }

    // Only the creator can update the note
    if (note.creado_por.toString() !== userId) {
      throw new AppError('No tienes permiso para actualizar esta nota', 403);
    }

    const group = await Group.findById(note.grupo_id);
    if (!group) {
      throw new AppError('Grupo asociado a la nota no encontrado', 404);
    }

    // Ensure all updated readers are members of the group
    if (data.lectores && data.lectores.length > 0) {
        const allReadersAreMembers = data.lectores.every(readerId => 
            group.miembros.some(member => member.toString() === readerId.toString())
        );
        if (!allReadersAreMembers) {
            throw new AppError('Alguno de los lectores especificados no pertenece al grupo', 403);
        }
    } else {
        // If readers list is emptied, it becomes private to the creator
        data.lectores = [new mongoose.Types.ObjectId(userId)];
    }


    Object.assign(note, data);
    await note.save();
    return note;
  }

  async deleteNote(noteId: string, userId: string): Promise<void> {
    const note = await Note.findById(noteId);

    if (!note) {
      throw new AppError('Nota no encontrada', 404);
    }

    // Only the creator can delete the note
    if (note.creado_por.toString() !== userId) {
      throw new AppError('No tienes permiso para eliminar esta nota', 403);
    }

    await note.deleteOne();
  }
}
