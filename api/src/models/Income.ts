import mongoose, { Schema, Document } from 'mongoose';

// Dinero que entra en un grupo personal (nómina cobrada, extras, Bizum...)
export interface IIncome extends Document {
  grupo_id: mongoose.Types.ObjectId;
  descripcion: string;
  monto: number;
  fecha: Date;
  recurrente_id?: mongoose.Types.ObjectId; // Ingreso recurrente que confirma (p. ej. la nómina)
  creado_por: mongoose.Types.ObjectId;
}

const IncomeSchema: Schema = new Schema({
  grupo_id: { type: Schema.Types.ObjectId, ref: 'Group', required: true },
  descripcion: { type: String, required: true, trim: true },
  monto: { type: Number, required: true, min: [0.01, 'El monto debe ser mayor a 0'] },
  fecha: { type: Date, required: true },
  recurrente_id: { type: Schema.Types.ObjectId, ref: 'RecurringItem', required: false },
  creado_por: { type: Schema.Types.ObjectId, ref: 'User', required: true }
});

IncomeSchema.index({ grupo_id: 1, fecha: 1 });

export default mongoose.model<IIncome>('Income', IncomeSchema);
