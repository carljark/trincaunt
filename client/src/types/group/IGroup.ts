import { IUser } from '../user';
import { IBudgetConfig } from '../budget';

export interface IGroup {
  _id: string;
  nombre: string;
  descripcion?: string;
  creado_por: string; // User ID
  miembros: IUser[]; // Array of User objects
  fecha_creacion: string; // ISO Date string
  tipo?: 'compartido' | 'personal'; // sin valor en grupos antiguos = compartido
  presupuesto?: IBudgetConfig;
}
