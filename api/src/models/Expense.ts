import mongoose, { Schema, Document } from 'mongoose';

export interface IExpense extends Document {
  grupo_id: mongoose.Types.ObjectId;
  descripcion: string;
  monto: number;
  pagado_por: mongoose.Types.ObjectId[];
  participantes: mongoose.Types.ObjectId[];
  fecha: Date;
  asume_gasto: boolean;
  categoria: string[];
  localization?: string;
  recurrente_id?: mongoose.Types.ObjectId; // Factura recurrente que este gasto paga
}

const ExpenseSchema: Schema = new Schema({
  grupo_id: { type: Schema.Types.ObjectId, ref: 'Group', required: true },
  descripcion: { type: String, required: true },
  monto: { type: Number, required: true, min: [0.01, 'El monto debe ser mayor a 0'] },
  pagado_por: [{ type: Schema.Types.ObjectId, ref: 'User', required: true }],
  participantes: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  fecha: { type: Date, default: Date.now },
  asume_gasto: { type: Boolean, default: false },
  categoria: { type: [String], required: false },
  localization: { type: String, required: false },
  recurrente_id: { type: Schema.Types.ObjectId, ref: 'RecurringItem', required: false }
});

ExpenseSchema.index({ grupo_id: 1, fecha: 1 });

export default mongoose.model<IExpense>('Expense', ExpenseSchema);