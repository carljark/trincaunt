import mongoose, { Schema, Document } from 'mongoose';

export interface IBalance {
  id: string;
  nombre: string;
  email: string;
  balance: number;
}

export type GroupTipo = 'compartido' | 'personal';

// Tope de gasto por ciclo para una categoría (cuentan también sus alias)
export interface ILimiteCategoria {
  categoria: string;
  limite: number;
}

// Configuración del modo presupuesto (solo grupos personales)
export interface IGroupPresupuesto {
  diaInicioCiclo: number;      // Día de cobro: el ciclo va de este día al mismo día del mes siguiente
  ahorroObjetivo: number;      // Lo que se quiere apartar cada ciclo
  incluirOtrosGrupos: boolean; // Sumar tu parte de los gastos de tus grupos compartidos
  limitesCategoria: ILimiteCategoria[];
  avisos: boolean;             // Push al llegar al 80 % y al 100 % del presupuesto o de un límite
}

export const PRESUPUESTO_POR_DEFECTO: IGroupPresupuesto = {
  diaInicioCiclo: 1,
  ahorroObjetivo: 0,
  incluirOtrosGrupos: false,
  limitesCategoria: [],
  avisos: true
};

export const MAX_LIMITES_CATEGORIA = 30;

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
      incluirOtrosGrupos: { type: Boolean, default: false },
      limitesCategoria: {
        type: [new Schema({
          categoria: { type: String, required: true, trim: true },
          limite: { type: Number, required: true, min: 0.01 }
        }, { _id: false })],
        default: []
      },
      avisos: { type: Boolean, default: true }
    }, { _id: false }),
    required: false
  }
});

export default mongoose.model<IGroup>('Group', GroupSchema);