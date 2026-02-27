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

    // Ensure all editors are members of the group
    if (data.editores && data.editores.length > 0) {
        const allEditorsAreMembers = data.editores.every(editorId => 
            group.miembros.some(member => member.toString() === editorId.toString())
        );
        if (!allEditorsAreMembers) {
            throw new AppError('Alguno de los editores especificados no pertenece al grupo', 403);
        }
    }

    // Ensure creator is always an editor
    const finalEditors = data.editores ? [...data.editores.map(id => id.toString())] : [];
    if (!finalEditors.includes(userId)) {
        finalEditors.push(userId);
    }

    const note = await Note.create({
      ...data,
      creado_por: new mongoose.Types.ObjectId(userId),
      editores: finalEditors.map(id => new mongoose.Types.ObjectId(id)),
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
        { lectores: userObjectId },    // User is in the readers list
        { editores: userObjectId }     // User is in the editors list
      ]
    })
    .populate('creado_por', 'nombre')
    .populate('lectores', 'nombre')
    .populate('editores', 'nombre');

    return notes;
  }

  async updateNote(noteId: string, data: Partial<INote>, userId: string): Promise<INote | null> {
    const note = await Note.findById(noteId);

    if (!note) {
      throw new AppError('Nota no encontrada', 404);
    }

    // Only creator or editor can update the note
    const canEdit = note.creado_por.toString() === userId || note.editores.some(editorId => editorId.toString() === userId);
    if (!canEdit) {
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
    } else if (data.lectores && data.lectores.length === 0) {
        // If readers list is emptied, it becomes private to the creator
        data.lectores = [new mongoose.Types.ObjectId(userId)];
    }
    
    // Ensure all updated editors are members of the group
    if (data.editores && data.editores.length > 0) {
        const allEditorsAreMembers = data.editores.every(editorId => 
            group.miembros.some(member => member.toString() === editorId.toString())
        );
        if (!allEditorsAreMembers) {
            throw new AppError('Alguno de los editores especificados no pertenece al grupo', 403);
        }
    }

    // Ensure creator is always an editor (even if they remove themselves from the list)
    const finalEditors = data.editores ? [...data.editores.map(id => id.toString())] : note.editores.map(id => id.toString());
    if (!finalEditors.includes(note.creado_por.toString())) {
        finalEditors.push(note.creado_por.toString());
    }
    data.editores = finalEditors.map(id => new mongoose.Types.ObjectId(id));

    Object.assign(note, data);
    await note.save();
    return note;
  }

  async deleteNote(noteId: string, userId: string): Promise<void> {
    const note = await Note.findById(noteId);

    if (!note) {
      throw new AppError('Nota no encontrada', 404);
    }

    // Only creator or editor can delete the note
    const canDelete = note.creado_por.toString() === userId || note.editores.some(editorId => editorId.toString() === userId);
    if (!canDelete) {
      throw new AppError('No tienes permiso para eliminar esta nota', 403);
    }

    await note.deleteOne();
  }
}
