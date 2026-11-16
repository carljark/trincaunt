import { IExpenseLine } from './IExpense';
import { IUserPopulated } from '../user';

export interface IExpensePopulated {
  _id: string;
  grupo_id: string;
  descripcion: string;
  monto: number;
  pagado_por: IUserPopulated[];
  participantes: IUserPopulated[];
  fecha: string;
  asume_gasto: boolean;
  categoria?: string[];
  localization?: string;
  // Artículos de un ticket (cgsshoppings): suman `monto`. Con parte 0.5 se apuntó la mitad.
  lineas?: IExpenseLine[];
  parte?: number;
}
