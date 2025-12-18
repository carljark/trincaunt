import mongoose, { Schema, Document } from 'mongoose';

export interface IBalance {
  id: string;
  nombre: string;
  email: string;
  balance: number;
}

export interface IGroup extends Document {
  nombre: string;
  descripcion?: string;
  creado_por: mongoose.Types.ObjectId;
  miembros: mongoose.Types.ObjectId[];
  fecha_creacion: Date;
  balances: IBalance[];
}

const GroupSchema: Schema = new Schema({
  nombre: { type: String, required: true },
  descripcion: { type: String },
  creado_por: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  miembros: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  fecha_creacion: { type: Date, default: Date.now }
});

export default mongoose.model<IGroup>('Group', GroupSchema);