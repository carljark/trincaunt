import mongoose, { Schema, Document } from 'mongoose';

export interface INote extends Document {
  grupo_id: mongoose.Types.ObjectId;
  titulo?: string;
  contenido: string; // Could be markdown, plain text, or JSON for rich content
  lectores: mongoose.Types.ObjectId[]; // Users who can read this note
  editores: mongoose.Types.ObjectId[]; // Users who can edit this note
  creado_por: mongoose.Types.ObjectId;
  fecha_creacion: Date;
  fecha_actualizacion: Date;
}

const NoteSchema: Schema = new Schema({
  grupo_id: { type: Schema.Types.ObjectId, ref: 'Group', required: true },
  titulo: { type: String, required: false },
  contenido: { type: String, required: true },
  lectores: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  editores: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  creado_por: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  fecha_creacion: { type: Date, default: Date.now },
  fecha_actualizacion: { type: Date, default: Date.now },
});



export default mongoose.model<INote>('Note', NoteSchema);
