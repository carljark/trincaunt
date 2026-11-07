import mongoose, { Schema, Document } from 'mongoose';
import { Frecuencia, FRECUENCIAS } from '../utils/budgetCycle';

export type RecurringTipo = 'ingreso' | 'factura';

// Partida fija de un grupo personal: la nómina, el alquiler, la luz, Netflix...
// No genera nada por sí sola: el usuario la confirma cada ciclo y entonces se crea
// el gasto (factura) o el ingreso real enlazado con recurrente_id.
export interface IRecurringItem extends Document {
  grupo_id: mongoose.Types.ObjectId;
  tipo: RecurringTipo;
  nombre: string;
  importe: number;          // Importe estimado
  frecuencia: Frecuencia;
  fechaInicio: Date;        // Primera vez que toca: fija el día del mes y el mes de arranque
  fechaFin?: Date;          // Última fecha en que puede tocar (opcional)
  categoria: string[];
  activo: boolean;
  prorratear: boolean;      // Factura no mensual que se va apartando cada ciclo en una hucha
  prorrateoDesde?: Date;    // Cuándo se activó el prorrateo: la hucha empieza a llenarse en ese ciclo
}

const RecurringItemSchema: Schema = new Schema({
  grupo_id: { type: Schema.Types.ObjectId, ref: 'Group', required: true, index: true },
  tipo: { type: String, enum: ['ingreso', 'factura'], required: true },
  nombre: { type: String, required: true, trim: true },
  importe: { type: Number, required: true, min: [0.01, 'El importe debe ser mayor a 0'] },
  frecuencia: { type: String, enum: FRECUENCIAS, default: 'mensual' },
  fechaInicio: { type: Date, required: true },
  fechaFin: { type: Date, required: false },
  categoria: { type: [String], default: [] },
  activo: { type: Boolean, default: true },
  prorratear: { type: Boolean, default: false },
  prorrateoDesde: { type: Date, required: false }
});

export default mongoose.model<IRecurringItem>('RecurringItem', RecurringItemSchema);
