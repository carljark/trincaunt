import React, { useCallback, useEffect, useState } from 'react';
import { IBudgetForecast, ICycleForecastEntry } from '../types/budget';
import { budgetApi } from '../utils/budgetApi';
import { formatEuros, formatShortDate } from '../utils/format';
import './BudgetForecast.scss';

interface BudgetForecastProps {
  groupId: string;
  token: string;
  // Cambia cuando la página recarga los gastos, para recalcular
  refreshKey?: number;
}

// Un año vista son el ciclo actual y los 12 siguientes
const OPTIONS = [
  { ciclos: 6, label: '6 meses' },
  { ciclos: 13, label: '1 año' }
] as const;

const signed = (n: number) => (n < 0 ? `−${formatEuros(-n)}` : formatEuros(n));

// El ciclo con menos margen, sin contar el actual (que ya va descontando lo gastado)
const tightest = (list: ICycleForecastEntry[]) =>
  list.filter(c => !c.enCurso).reduce<ICycleForecastEntry | null>((min, c) => (!min || c.disponible < min.disponible ? c : min), null);

// Tarjeta del presupuesto: lo que te quedará para gastar en los próximos ciclos
const BudgetForecast: React.FC<BudgetForecastProps> = ({ groupId, token, refreshKey = 0 }) => {
  const [ciclos, setCiclos] = useState<number>(13);
  const [forecast, setForecast] = useState<IBudgetForecast | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setForecast(await budgetApi.getForecast(token, groupId, ciclos));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar la previsión.');
    }
  }, [token, groupId, ciclos]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  if (!forecast) {
    return (
      <section className="budget-forecast">
        <h3 className="budget-forecast__title">Lo que viene</h3>
        {error ? <p className="budget-forecast__error" role="alert">{error}</p> : <p className="budget-forecast__text">Cargando…</p>}
      </section>
    );
  }

  const list = forecast.ciclos;
  const min = tightest(list);

  return (
    <section className="budget-forecast">
      <div className="budget-forecast__header">
        <h3 className="budget-forecast__title">Lo que viene</h3>
        <div className="budget-forecast__switch" role="group" aria-label="Ciclos a prever">
          {OPTIONS.map(option => (
            <button
              key={option.ciclos}
              type="button"
              className={`budget-forecast__switch-button ${ciclos === option.ciclos ? 'budget-forecast__switch-button--active' : ''}`}
              aria-pressed={ciclos === option.ciclos}
              onClick={() => setCiclos(option.ciclos)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="budget-forecast__error" role="alert">{error}</p>}

      {min && (
        <p className="budget-forecast__summary">
          <span className="budget-forecast__summary-label">El ciclo más justo empieza el {formatShortDate(min.inicio)}</span>
          <span className={`budget-forecast__summary-amount ${min.disponible < 0 ? 'budget-forecast__summary-amount--negative' : ''}`}>
            {signed(min.disponible)}
          </span>
          <span className="budget-forecast__summary-sub">para gastar en todo el ciclo</span>
        </p>
      )}

      <table className="budget-forecast__table">
        <caption className="budget-forecast__caption">
          Con tus partidas fijas activas
          {forecast.ahorroObjetivo > 0 && ` y apartando ${formatEuros(forecast.ahorroObjetivo)} de ahorro`}. Las
          facturas incluyen lo que va a las huchas, no los pagos que salen de ellas. En el ciclo en curso, lo que te queda.
        </caption>
        <thead>
          <tr>
            <th scope="col" className="budget-forecast__th">Ciclo</th>
            <th scope="col" className="budget-forecast__th budget-forecast__th--amount">Ingresos</th>
            <th scope="col" className="budget-forecast__th budget-forecast__th--amount">Facturas</th>
            <th scope="col" className="budget-forecast__th budget-forecast__th--amount">Para gastar</th>
          </tr>
        </thead>
        {list.map(c => (
          <tbody key={c.inicio} className="budget-forecast__cycle-group">
            <tr>
              <th scope="row" className="budget-forecast__cycle">
                {formatShortDate(c.inicio)}
                {c.enCurso && <span className="budget-forecast__current">en curso</span>}
              </th>
              <td className="budget-forecast__td">{formatEuros(c.ingresos)}</td>
              <td className="budget-forecast__td">{formatEuros(c.facturas + c.reservas)}</td>
              <td className={`budget-forecast__td budget-forecast__td--${c.disponible < 0 ? 'negative' : 'positive'}`}>
                {signed(c.disponible)}
              </td>
            </tr>
            {c.temporales.length > 0 && (
              <tr>
                <td colSpan={4} className="budget-forecast__temporary">
                  <ul className="budget-forecast__temporary-list">
                    {c.temporales.map(t => (
                      <li key={`${t.recurrente_id}-${t.fecha}`} className="budget-forecast__temporary-item">
                        <span className="budget-forecast__temporary-name">{t.nombre}</span>
                        <span className="budget-forecast__temporary-amount">
                          {formatEuros(t.importe)}
                          {t.ultima && <span className="budget-forecast__badge">última</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                </td>
              </tr>
            )}
          </tbody>
        ))}
      </table>
    </section>
  );
};

export default BudgetForecast;
