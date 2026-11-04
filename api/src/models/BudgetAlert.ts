import mongoose, { Schema, Document } from 'mongoose';

// Aviso push de presupuesto ya enviado: uno por grupo, ciclo, concepto y umbral, para no repetirlo
export interface IBudgetAlert extends Document {
  grupo_id: mongoose.Types.ObjectId;
  ciclo: string;  // inicio del ciclo, YYYY-MM-DD
  clave: string;  // 'total' o 'categoria:<nombre en minúsculas>'
  umbral: number; // 80 o 100
  fecha: Date;
}

const BudgetAlertSchema: Schema = new Schema({
  grupo_id: { type: Schema.Types.ObjectId, ref: 'Group', required: true },
  ciclo: { type: String, required: true },
  clave: { type: String, required: true },
  umbral: { type: Number, required: true },
  fecha: { type: Date, default: Date.now }
});

BudgetAlertSchema.index({ grupo_id: 1, ciclo: 1, clave: 1, umbral: 1 }, { unique: true });

export default mongoose.model<IBudgetAlert>('BudgetAlert', BudgetAlertSchema);
