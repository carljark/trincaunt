import mongoose, { Schema, Document } from 'mongoose';

// Estado de un recordatorio del presupuesto ("pide la amortización", "pasa X € a la hucha"):
// si ya se ha avisado por push y si el usuario lo ha marcado como hecho. Uno por grupo y clave.
export interface IBudgetReminder extends Document {
  grupo_id: mongoose.Types.ObjectId;
  clave: string;    // 'partida:<id>:<YYYY-MM-DD>' o 'hucha:<inicio del ciclo>'
  avisado?: Date;   // push enviado
  hecho?: Date;     // marcado como hecho
}

const BudgetReminderSchema: Schema = new Schema({
  grupo_id: { type: Schema.Types.ObjectId, ref: 'Group', required: true },
  clave: { type: String, required: true },
  avisado: { type: Date },
  hecho: { type: Date }
});

BudgetReminderSchema.index({ grupo_id: 1, clave: 1 }, { unique: true });

export default mongoose.model<IBudgetReminder>('BudgetReminder', BudgetReminderSchema);
