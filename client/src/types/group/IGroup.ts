import { IUser } from '../user';

export interface IGroup {
  _id: string;
  nombre: string;
  descripcion?: string;
  creado_por: string; // User ID
  miembros: IUser[]; // Array of User objects
  fecha_creacion: string; // ISO Date string
}
