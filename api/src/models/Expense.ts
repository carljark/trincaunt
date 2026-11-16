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
  // Gasto creado por otra aplicación: cuál y con qué id suyo (p. ej. una compra de cgsshoppings).
  // Es único por grupo, así repetir la petición no lo duplica.
  origen?: { app: string; ref: string };
  // Gasto leído de un ticket: cada artículo con lo que se apunta de él. Suman exactamente `monto`.
  lineas?: { texto: string; cantidad?: number; importe: number }[];
  // Parte del ticket que se apunta (0.5 si es a medias). `monto` y `lineas` ya la llevan aplicada.
  parte?: number;
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
  recurrente_id: { type: Schema.Types.ObjectId, ref: 'RecurringItem', required: false },
  origen: {
    type: new Schema({ app: { type: String, required: true }, ref: { type: String, required: true } }, { _id: false }),
    required: false
  },
  lineas: {
    type: [new Schema({
      texto: { type: String, required: true },
      cantidad: { type: Number, required: false },
      importe: { type: Number, required: true }
    }, { _id: false })],
    default: undefined
  },
  parte: { type: Number, required: false, min: 0.01, max: 1 }
});

ExpenseSchema.index({ grupo_id: 1, fecha: 1 });
ExpenseSchema.index(
  { grupo_id: 1, 'origen.app': 1, 'origen.ref': 1 },
  { unique: true, partialFilterExpression: { 'origen.ref': { $exists: true } } }
);

export default mongoose.model<IExpense>('Expense', ExpenseSchema);