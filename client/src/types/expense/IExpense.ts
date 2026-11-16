export interface IExpenseLine {
  texto: string;
  cantidad?: number;
  importe: number;
}

export interface IExpense {
  _id: string;
  grupo_id: string;
  descripcion: string;
  monto: number;
  pagado_por: string[]; // User ID
  participantes: string[]; // Array of User IDs
  fecha: string; // ISO Date string
  asume_gasto: boolean;
  categoria?: string[];
  localization?: string;
  // Artículos de un ticket (cgsshoppings): suman `monto`. Con parte 0.5 se apuntó la mitad.
  lineas?: IExpenseLine[];
  parte?: number;
}
