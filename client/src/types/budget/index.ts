export type Frecuencia = 'mensual' | 'bimestral' | 'trimestral' | 'semestral' | 'anual';
export type RecurringTipo = 'ingreso' | 'factura';

export interface ILimiteCategoria {
  categoria: string;
  limite: number;
}

export interface IBudgetConfig {
  diaInicioCiclo: number;
  ahorroObjetivo: number;
  incluirOtrosGrupos: boolean;
  limitesCategoria?: ILimiteCategoria[];
  avisos?: boolean; // push al 80 % y al 100 %; sin valor, activados
}

export interface ICategoryLimitStatus extends ILimiteCategoria {
  gastado: number;
  restante: number;   // negativo si te has pasado
  porcentaje: number;
}

export interface IRecurringItem {
  _id: string;
  grupo_id: string;
  tipo: RecurringTipo;
  nombre: string;
  importe: number;
  frecuencia: Frecuencia;
  fechaInicio: string; // ISO
  fechaFin?: string;
  categoria: string[];
  activo: boolean;
}

export interface IIncome {
  _id: string;
  grupo_id: string;
  descripcion: string;
  monto: number;
  fecha: string;
  recurrente_id?: string;
}

export interface IBudgetLine<E extends string> {
  recurrente_id?: string;
  nombre: string;
  fecha: string; // YYYY-MM-DD
  importe: number;
  estado: E;
  movimiento_id?: string;
}

export interface IBudgetSummary {
  ciclo: {
    inicio: string;
    fin: string; // excluido
    offset: number;
    diasTotales: number;
    diasTranscurridos: number;
    diasRestantes: number;
  };
  configuracion: IBudgetConfig;
  ingresos: { recibidos: number; previstos: number; total: number; lineas: IBudgetLine<'recibido' | 'previsto'>[] };
  facturas: { pagadas: number; pendientes: number; total: number; lineas: IBudgetLine<'pagada' | 'pendiente'>[] };
  ahorroObjetivo: number;
  gastosVariables: number;
  otrosGrupos: { total: number; grupos: { _id: string; nombre: string; total: number }[] } | null;
  presupuestoGastable: number;
  gastado: number;
  disponible: number;
  porDia: number | null;
  porSemana: number | null;
  ritmo: { gastoIdeal: number; desviacion: number } | null;
  limitesCategoria?: ICategoryLimitStatus[];
}

export const FRECUENCIA_LABELS: Record<Frecuencia, string> = {
  mensual: 'Cada mes',
  bimestral: 'Cada 2 meses',
  trimestral: 'Cada 3 meses',
  semestral: 'Cada 6 meses',
  anual: 'Cada año'
};
