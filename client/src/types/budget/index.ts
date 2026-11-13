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

// Tramo de fechas en que una partida se paga distinto: otra cuota (sustituye al importe)
// o un pago extra que se suma (una amortización anticipada)
export type PagoEspecialTipo = 'cuota' | 'extra';

export interface IPagoEspecial {
  tipo: PagoEspecialTipo;
  desde: string; // ISO, incluida
  hasta: string; // ISO, incluida; un solo pago: la misma que desde
  importe: number;
  aviso?: string;
  avisoDiasAntes?: number;
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
  prorratear?: boolean;    // factura no mensual que se aparta cada ciclo en una hucha
  prorrateoDesde?: string; // desde cuándo se aparta: hoy al activarla, o la fecha que se elija (no pasada)
  aviso?: string;          // algo que hacer a mano antes de cada fecha (pedir una amortización…)
  avisoDiasAntes?: number; // con cuántos días de antelación se recuerda (por defecto 3)
  pagosEspeciales?: IPagoEspecial[];
}

/** Algo que hacer a mano en el banco: lo de una partida con aviso, o mover dinero de la hucha. */
export interface IBudgetReminder {
  clave: string;
  tipo: 'partida' | 'hucha';
  titulo: string;
  detalle: string;
  fecha: string;
  importe: number;
  recurrente_id?: string;
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
  deHucha?: number; // parte que se paga con lo apartado
  extra?: number;   // parte que son pagos extra
}

export interface IReserveLine {
  recurrente_id: string;
  nombre: string;
  cuota: number; // lo que se aparta en este ciclo
  saldo: number; // en la hucha al acabar el ciclo
  proximoPago: { fecha: string; importe: number; cubierto: number } | null;
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
  // Importes netos: sin lo que se paga con las huchas
  facturas: { pagadas: number; pendientes: number; total: number; deHucha: number; lineas: IBudgetLine<'pagada' | 'pendiente'>[] };
  reservas: { total: number; lineas: IReserveLine[] };
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

export interface ICycleHistoryEntry {
  inicio: string;
  fin: string; // excluido
  offset: number;
  enCurso: boolean;
  ingresos: number;
  facturas: number;
  gastosVariables: number;
  otrosGrupos: number;
  gastado: number;
  sobrante: number;
}

export interface IBudgetHistory {
  ahorroObjetivo: number;
  ciclos: ICycleHistoryEntry[]; // del más antiguo al actual
  mediaSobrante: number | null;
}

export interface IForecastBill {
  recurrente_id: string;
  nombre: string;
  fecha: string;
  importe: number;
  estado: 'pagada' | 'pendiente';
  ultima: boolean; // no vuelve a tocar después de este ciclo
  nueva: boolean;  // empieza en este ciclo
  deHucha?: number; // lo que se paga con lo apartado en su hucha
  extra?: number;   // parte del importe que son pagos extra
  simulada?: boolean; // partida inventada en un ensayo
}

export interface ICycleForecastEntry {
  inicio: string;
  fin: string; // excluido
  offset: number;
  enCurso: boolean;
  ingresos: number;
  facturas: number;
  reservas: number;
  presupuestoGastable: number;
  gastado: number;
  disponible: number;
  partidas: IForecastBill[];   // todas las facturas del ciclo
  temporales: IForecastBill[]; // facturas con fecha de fin
}

export interface IBudgetForecast {
  ahorroObjetivo: number;
  ciclos: ICycleForecastEntry[]; // del actual en adelante
}

// Partida inventada para un ensayo de la previsión (no se guarda)
export interface IScenarioItem {
  tipo: RecurringTipo;
  nombre: string;
  importe: number;
  frecuencia: Frecuencia;
  fechaInicio: string;
  fechaFin?: string;
}

// Retoque de una partida en el ensayo: importe multiplicado por escala y fechas movidas meses
export interface IScenarioChange {
  id: string;
  escala?: number;
  meses?: number;
}

export interface IBudgetScenario {
  quitar: string[];
  nuevas: IScenarioItem[];
  cambiar?: IScenarioChange[];
}

export const FRECUENCIA_LABELS: Record<Frecuencia, string> = {
  mensual: 'Cada mes',
  bimestral: 'Cada 2 meses',
  trimestral: 'Cada 3 meses',
  semestral: 'Cada 6 meses',
  anual: 'Cada año'
};
