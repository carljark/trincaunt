import mongoose, { Schema, Document } from 'mongoose';

export interface IBalance {
  id: string;
  nombre: string;
  email: string;
  balance: number;
}

export type GroupTipo = 'compartido' | 'personal';

// Configuración del modo presupuesto (solo grupos personales)
export interface IGroupPresupuesto {
  diaInicioCiclo: number;      // Día de cobro: el ciclo va de este día al mismo día del mes siguiente
  ahorroObjetivo: number;      // Lo que se quiere apartar cada ciclo
  incluirOtrosGrupos: boolean; // Sumar tu parte de los gastos de tus grupos compartidos
}

export const PRESUPUESTO_POR_DEFECTO: IGroupPresupuesto = {
  diaInicioCiclo: 1,
  ahorroObjetivo: 0,
  incluirOtrosGrupos: false
};

export interface IGroup extends Document {
  nombre: string;
  descripcion?: string;
  creado_por: mongoose.Types.ObjectId;
  miembros: mongoose.Types.ObjectId[];
  fecha_creacion: Date;
  balances: IBalance[];
  tipo: GroupTipo;
  presupuesto?: IGroupPresupuesto;
}

const GroupSchema: Schema = new Schema({
  nombre: { type: String, required: true },
  descripcion: { type: String },
  creado_por: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  miembros: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  fecha_creacion: { type: Date, default: Date.now },
  tipo: { type: String, enum: ['compartido', 'personal'], default: 'compartido' },
  presupuesto: {
    type: new Schema({
      diaInicioCiclo: { type: Number, min: 1, max: 31, default: 1 },
      ahorroObjetivo: { type: Number, min: 0, default: 0 },
      incluirOtrosGrupos: { type: Boolean, default: false }
    }, { _id: false }),
    required: false
  }
});

export default mongoose.model<IGroup>('Group', GroupSchema);