import mongoose, { Schema, Document } from 'mongoose';
import { Frecuencia, FRECUENCIAS, PAGO_ESPECIAL_TIPOS, PagoEspecialTipo } from '../utils/budgetCycle';

export type RecurringTipo = 'ingreso' | 'factura';

// Un tramo de fechas en que la partida se paga distinto: otra cuota (sustituye al importe,
// como cuando sube la cuota de la tarjeta) o un pago extra que se suma (una amortización
// anticipada del préstamo). Puede llevar su propio aviso para esas fechas.
export interface IPagoEspecial {
  _id?: mongoose.Types.ObjectId;
  tipo: PagoEspecialTipo;
  desde: Date;             // Primera fecha del tramo (incluida)
  hasta: Date;             // Última fecha del tramo (incluida); un solo pago: la misma
  importe: number;
  aviso?: string;
  avisoDiasAntes?: number;
}

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
  aviso?: string;           // Algo que hacer a mano antes de cada fecha (pedir una amortización, cambiar una cuota)
  avisoDiasAntes?: number;  // Cuántos días antes empieza a recordarse (por defecto 3)
  pagosEspeciales?: IPagoEspecial[];
}

const PagoEspecialSchema = new Schema({
  tipo: { type: String, enum: PAGO_ESPECIAL_TIPOS, required: true },
  desde: { type: Date, required: true },
  hasta: { type: Date, required: true },
  importe: { type: Number, required: true, min: [0.01, 'El importe debe ser mayor a 0'] },
  aviso: { type: String, trim: true, maxlength: 200 },
  avisoDiasAntes: { type: Number, min: 0, max: 31 }
});

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
  prorrateoDesde: { type: Date, required: false },
  aviso: { type: String, trim: true, maxlength: 200 },
  avisoDiasAntes: { type: Number, min: 0, max: 31 },
  pagosEspeciales: { type: [PagoEspecialSchema], default: undefined }
});

export default mongoose.model<IRecurringItem>('RecurringItem', RecurringItemSchema);
