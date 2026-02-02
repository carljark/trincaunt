export interface IExpense {
  _id: string;
  grupo_id: string;
  descripcion: string;
  monto: number;
  pagado_por: string; // User ID
  participantes: string[]; // Array of User IDs
  fecha: string; // ISO Date string
  asume_gasto: boolean;
  categoria?: string[];
}
