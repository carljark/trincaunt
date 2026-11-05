import React, { useCallback, useEffect, useState } from 'react';
import { Chart } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  BarController,
  BarElement,
  CategoryScale,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
  Legend,
  type ChartData,
  type ChartOptions,
  type TooltipItem
} from 'chart.js';
import { IBudgetHistory, ICycleHistoryEntry } from '../types/budget';
import { budgetApi } from '../utils/budgetApi';
import { addDays, formatEuros, formatShortDate } from '../utils/format';
import './BudgetHistory.scss';

ChartJS.register(BarController, BarElement, CategoryScale, LinearScale, LineController, LineElement, PointElement, Tooltip, Legend);

interface BudgetHistoryProps {
  groupId: string;
  token: string;
  // Cambia cuando la página recarga los gastos, para recalcular
  refreshKey?: number;
}

// Mismos colores que la gráfica de gastos (paleta validada): facturas naranja, día a día
// azul; los ingresos, una línea en tinta neutra que no compite con las barras.
const COLOR_BILLS = '#eb6834';
const COLOR_DAILY = '#4361ee';
const COLOR_INCOME = '#343a40';
const TEXT_MUTED = '#6c757d';
const GRID_COLOR = '#e9ecef';
// El ciclo en curso aún no ha terminado: sus barras van más claras
const PARTIAL_ALPHA = '80';

const OPTIONS = [6, 12] as const;

const round2 = (n: number) => Math.round(n * 100) / 100;
const range = (c: ICycleHistoryEntry) => `${formatShortDate(c.inicio)} – ${formatShortDate(addDays(c.fin, -1))}`;
const signed = (n: number) => (n < 0 ? `−${formatEuros(-n)}` : formatEuros(n));

// Tarjeta del presupuesto: cómo te ha ido en los últimos ciclos
const BudgetHistory: React.FC<BudgetHistoryProps> = ({ groupId, token, refreshKey = 0 }) => {
  const [ciclos, setCiclos] = useState<number>(6);
  const [history, setHistory] = useState<IBudgetHistory | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setHistory(await budgetApi.getHistory(token, groupId, ciclos));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el histórico.');
    }
  }, [token, groupId, ciclos]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  if (!history) {
    return (
      <section className="budget-history">
        <h3 className="budget-history__title">Cómo te ha ido</h3>
        {error ? <p className="budget-history__error" role="alert">{error}</p> : <p className="budget-history__text">Cargando…</p>}
      </section>
    );
  }

  const list = history.ciclos;
  const tint = (color: string) => list.map(c => (c.enCurso ? color + PARTIAL_ALPHA : color));

  const data: ChartData<'bar' | 'line', number[], string> = {
    labels: list.map(c => formatShortDate(c.inicio)),
    datasets: [
      {
        type: 'line',
        label: 'Ingresos',
        data: list.map(c => c.ingresos),
        borderColor: COLOR_INCOME,
        backgroundColor: COLOR_INCOME,
        borderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 5,
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        order: 0
      },
      {
        type: 'bar',
        label: 'Facturas',
        data: list.map(c => c.facturas),
        backgroundColor: tint(COLOR_BILLS),
        stack: 'gastos',
        borderSkipped: 'start',
        order: 1
      },
      {
        type: 'bar',
        label: 'Día a día',
        data: list.map(c => round2(c.gastosVariables + c.otrosGrupos)),
        backgroundColor: tint(COLOR_DAILY),
        stack: 'gastos',
        // Separación de 2px con las facturas y extremo redondeado arriba
        borderColor: '#fff',
        borderWidth: { top: 0, bottom: 2, left: 0, right: 0 },
        borderSkipped: false,
        borderRadius: { topLeft: 4, topRight: 4, bottomLeft: 0, bottomRight: 0 },
        order: 1
      }
    ]
  };

  const options: ChartOptions<'bar' | 'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    datasets: { bar: { maxBarThickness: 28, categoryPercentage: 0.7 } },
    plugins: {
      legend: {
        position: 'bottom',
        labels: { usePointStyle: true, boxWidth: 8, boxHeight: 8, color: '#495057', padding: 16 }
      },
      tooltip: {
        callbacks: {
          title: (items: TooltipItem<'bar' | 'line'>[]) => {
            const c = items[0] && list[items[0].dataIndex];
            return c ? `${range(c)}${c.enCurso ? ' (en curso)' : ''}` : '';
          },
          label: (item: TooltipItem<'bar' | 'line'>) => `${item.dataset.label}: ${formatEuros(item.parsed.y ?? 0)}`,
          footer: (items: TooltipItem<'bar' | 'line'>[]) => {
            const c = items[0] && list[items[0].dataIndex];
            return c ? `${c.sobrante < 0 ? 'Te pasaste' : 'Te sobró'}: ${formatEuros(Math.abs(c.sobrante))}` : '';
          }
        }
      }
    },
    scales: {
      x: {
        stacked: true,
        grid: { display: false },
        border: { color: GRID_COLOR },
        ticks: { color: TEXT_MUTED, maxRotation: 0, autoSkip: true }
      },
      y: {
        stacked: true,
        beginAtZero: true,
        grid: { color: GRID_COLOR },
        border: { display: false },
        ticks: { color: TEXT_MUTED, maxTicksLimit: 5, callback: value => `${Number(value).toLocaleString('es-ES')} €` }
      }
    }
  };

  const media = history.mediaSobrante;

  return (
    <section className="budget-history">
      <div className="budget-history__header">
        <h3 className="budget-history__title">Cómo te ha ido</h3>
        <div className="budget-history__switch" role="group" aria-label="Ciclos a mostrar">
          {OPTIONS.map(n => (
            <button
              key={n}
              type="button"
              className={`budget-history__switch-button ${ciclos === n ? 'budget-history__switch-button--active' : ''}`}
              aria-pressed={ciclos === n}
              onClick={() => setCiclos(n)}
            >
              {n} ciclos
            </button>
          ))}
        </div>
      </div>

      {error && <p className="budget-history__error" role="alert">{error}</p>}

      {media === null ? (
        <p className="budget-history__text">Cuando termine tu primer ciclo verás aquí cuánto te sobró en cada uno.</p>
      ) : (
        <p className="budget-history__summary">
          <span className="budget-history__summary-label">{media < 0 ? 'De media te pasas' : 'De media te sobran'}</span>
          <span className={`budget-history__summary-amount ${media < 0 ? 'budget-history__summary-amount--negative' : ''}`}>
            {formatEuros(Math.abs(media))}
          </span>
          <span className="budget-history__summary-sub">
            por ciclo
            {history.ahorroObjetivo > 0 && ` · tu objetivo de ahorro es ${formatEuros(history.ahorroObjetivo)}`}
          </span>
        </p>
      )}

      {list.length > 1 && (
        <div className="budget-history__chart">
          <Chart type="bar" data={data} options={options} aria-label="Ingresos y gastos de cada ciclo" role="img" />
        </div>
      )}

      <table className="budget-history__table">
        <caption className="budget-history__caption">
          Lo cobrado y lo pagado de verdad en cada ciclo; lo previsto sin confirmar no cuenta.
        </caption>
        <thead>
          <tr>
            <th scope="col" className="budget-history__th">Ciclo</th>
            <th scope="col" className="budget-history__th budget-history__th--amount">Ingresos</th>
            <th scope="col" className="budget-history__th budget-history__th--amount">Gastos</th>
            <th scope="col" className="budget-history__th budget-history__th--amount">Te sobró</th>
          </tr>
        </thead>
        <tbody>
          {[...list].reverse().map(c => (
            <tr key={c.inicio} className="budget-history__tr">
              <th scope="row" className="budget-history__cycle">
                {formatShortDate(c.inicio)}
                {c.enCurso && <span className="budget-history__current">en curso</span>}
              </th>
              <td className="budget-history__td">{formatEuros(c.ingresos)}</td>
              <td className="budget-history__td">{formatEuros(c.gastado)}</td>
              <td className={`budget-history__td budget-history__td--${c.sobrante < 0 ? 'negative' : 'positive'}`}>
                {signed(c.sobrante)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
};

export default BudgetHistory;
