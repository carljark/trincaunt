import React, { useCallback, useEffect, useState } from 'react';
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon, PlusIcon, TrashIcon } from './icons';
import BudgetForecast from './BudgetForecast';
import BudgetHistory from './BudgetHistory';
import BudgetMovementDialog, { BudgetMovementValues } from './BudgetMovementDialog';
import RecurringItemDialog from './RecurringItemDialog';
import ConfirmationModal from './ConfirmationModal';
import { FRECUENCIA_LABELS, IBudgetLine, IBudgetSummary, IRecurringItem, RecurringTipo } from '../types/budget';
import { budgetApi, RecurringItemInput } from '../utils/budgetApi';
import { addDays, formatEuros, formatShortDate, todayYmd } from '../utils/format';
import './BudgetTab.scss';

interface BudgetTabProps {
  groupId: string;
  token: string;
  // Cambia cuando la página recarga los gastos (socket, FAB...), para recalcular
  refreshKey?: number;
  // Tras pagar o deshacer una factura: los gastos del grupo han cambiado
  onExpensesChanged?: () => void;
}

type BillLine = IBudgetLine<'pagada' | 'pendiente'>;
type IncomeLine = IBudgetLine<'recibido' | 'previsto'>;

type DialogState =
  | { kind: 'confirm'; line: BillLine | IncomeLine; tipo: RecurringTipo }
  | { kind: 'income' }
  | { kind: 'item'; item?: IRecurringItem; tipo: RecurringTipo }
  | { kind: 'undo'; line: BillLine | IncomeLine; tipo: RecurringTipo }
  | null;

// Una hucha que aún no ha empezado dice desde cuándo
const huchaLabel = (desde?: string) =>
  desde && desde.slice(0, 10) > todayYmd() ? ` · hucha desde el ${formatShortDate(desde)}` : ' · con hucha';

const cycleLabel = (summary: IBudgetSummary) => {
  const { inicio, fin, offset } = summary.ciclo;
  const range = `${formatShortDate(inicio)} – ${formatShortDate(addDays(fin, -1))}`;
  if (offset === 0) return { title: 'Ciclo actual', range };
  if (offset === -1) return { title: 'Ciclo anterior', range };
  if (offset === 1) return { title: 'Próximo ciclo', range };
  return { title: range, range: '' };
};

const BudgetTab: React.FC<BudgetTabProps> = ({ groupId, token, refreshKey = 0, onExpensesChanged }) => {
  const [offset, setOffset] = useState(0);
  const [summary, setSummary] = useState<IBudgetSummary | null>(null);
  const [items, setItems] = useState<IRecurringItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);

  const load = useCallback(async () => {
    try {
      const [s, list] = await Promise.all([
        budgetApi.getSummary(token, groupId, offset),
        budgetApi.listRecurringItems(token, groupId)
      ]);
      setSummary(s);
      setItems(list);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el presupuesto.');
    }
  }, [token, groupId, offset]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  // Ejecuta una acción de un diálogo, cierra y recarga (los errores los muestra el diálogo)
  const afterChange = async (action: () => Promise<unknown>, expensesChanged = false) => {
    await action();
    setDialog(null);
    await load();
    if (expensesChanged) onExpensesChanged?.();
  };

  if (error && !summary) {
    return (
      <div className="budget">
        <p className="budget__error" role="alert">{error}</p>
        <button type="button" className="budget__button budget__button--secondary" onClick={() => void load()}>Reintentar</button>
      </div>
    );
  }
  if (!summary) return <p className="budget__status">Cargando presupuesto…</p>;

  const isCurrent = summary.ciclo.offset === 0;
  const isPast = summary.ciclo.offset < 0;
  const today = todayYmd();
  const label = cycleLabel(summary);
  const negative = summary.disponible < 0;
  const spentRatio = summary.presupuestoGastable > 0 ? Math.min(1, Math.max(0, summary.gastado / summary.presupuestoGastable)) : 1;
  const isEmpty = items.length === 0 && summary.ingresos.lineas.length === 0;

  const heroLabel = isPast ? (negative ? 'Te pasaste' : 'Te sobró') : negative ? 'Te has pasado' : 'Te quedan';
  // Fecha propuesta al confirmar: la prevista si ya ha llegado; si no, hoy
  const defaultDate = (line: { fecha: string }) => (line.fecha <= today ? line.fecha : today);

  const confirm = (values: BudgetMovementValues) => {
    if (dialog?.kind !== 'confirm' || !dialog.line.recurrente_id) return Promise.resolve();
    const { line, tipo } = dialog;
    return afterChange(
      () => budgetApi.confirmRecurringItem(token, line.recurrente_id!, { monto: values.monto, fecha: values.fecha }),
      tipo === 'factura'
    );
  };

  const undo = () => {
    if (dialog?.kind !== 'undo' || !dialog.line.movimiento_id) return;
    const { line, tipo } = dialog;
    void afterChange(
      () => (tipo === 'factura' ? budgetApi.deleteExpense(token, line.movimiento_id!) : budgetApi.deleteIncome(token, line.movimiento_id!)),
      tipo === 'factura'
    ).catch(err => {
      setDialog(null);
      setError(err instanceof Error ? err.message : 'No se pudo deshacer.');
    });
  };

  const saveItem = (data: RecurringItemInput) => {
    if (dialog?.kind !== 'item') return Promise.resolve();
    const { item } = dialog;
    return afterChange(() => (item
      ? budgetApi.updateRecurringItem(token, item._id, data)
      : budgetApi.createRecurringItem(token, groupId, data)));
  };

  const renderLine = (line: BillLine | IncomeLine, tipo: RecurringTipo) => {
    const done = line.estado === 'pagada' || line.estado === 'recibido';
    const overdue = !done && line.fecha < today;
    return (
      <li key={`${line.recurrente_id ?? line.movimiento_id}-${line.fecha}`} className={`budget__line ${done ? 'budget__line--done' : ''}`}>
        <span className={`budget__line-icon ${done ? 'budget__line-icon--done' : ''}`} aria-hidden="true">
          {done ? <CheckIcon /> : null}
        </span>
        <span className="budget__line-text">
          <span className="budget__line-name">{line.nombre}</span>
          <span className={`budget__line-meta ${overdue ? 'budget__line-meta--overdue' : ''}`}>
            {formatShortDate(line.fecha)} · {done ? (tipo === 'factura' ? 'Pagada' : 'Cobrado') : overdue ? 'Sin confirmar' : (tipo === 'factura' ? 'Pendiente' : 'Previsto')}
            {line.deHucha ? ` · ${formatEuros(line.deHucha)} de la hucha` : ''}
          </span>
        </span>
        <span className="budget__line-amount">{formatEuros(line.importe)}</span>
        {done ? (
          <button
            type="button"
            className="budget__icon-button budget__icon-button--muted"
            onClick={() => setDialog({ kind: 'undo', line, tipo })}
            aria-label={`Deshacer ${line.nombre}`}
            title="Deshacer"
          >
            <TrashIcon />
          </button>
        ) : (
          <button
            type="button"
            className="budget__line-action"
            onClick={() => setDialog({ kind: 'confirm', line, tipo })}
            aria-label={`${tipo === 'factura' ? 'Pagar' : 'Cobrar'} ${line.nombre}`}
          >
            {tipo === 'factura' ? 'Pagar' : 'Cobrar'}
          </button>
        )}
      </li>
    );
  };

  const incomeItems = items.filter(i => i.tipo === 'ingreso');
  const billItems = items.filter(i => i.tipo === 'factura');

  return (
    <div className="budget">
      <nav className="budget__cycle" aria-label="Cambiar de ciclo">
        <button type="button" className="budget__icon-button" onClick={() => setOffset(o => o - 1)} aria-label="Ciclo anterior">
          <ChevronLeftIcon />
        </button>
        <span className="budget__cycle-text">
          <span className="budget__cycle-title">{label.title}</span>
          {label.range && <span className="budget__cycle-range">{label.range}</span>}
        </span>
        <button type="button" className="budget__icon-button" onClick={() => setOffset(o => o + 1)} aria-label="Ciclo siguiente">
          <ChevronRightIcon />
        </button>
      </nav>
      {!isCurrent && (
        <button type="button" className="budget__today" onClick={() => setOffset(0)}>Volver al ciclo actual</button>
      )}

      {error && <p className="budget__error" role="alert">{error}</p>}

      <section className={`budget__hero ${negative ? 'budget__hero--negative' : ''}`} aria-label="Lo que puedes gastar">
        <span className="budget__hero-label">{heroLabel}</span>
        <span className="budget__hero-amount">{formatEuros(Math.abs(summary.disponible))}</span>
        <span className="budget__hero-sub">
          Llevas {formatEuros(summary.gastado)} de {formatEuros(summary.presupuestoGastable)} para el día a día
        </span>
        <div
          className="budget__progress"
          role="progressbar"
          aria-label="Gastado del presupuesto"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(spentRatio * 100)}
        >
          <span className="budget__progress-bar" style={{ width: `${spentRatio * 100}%` }} />
        </div>
        {summary.porDia !== null && summary.porSemana !== null && (
          <dl className="budget__rates">
            <div className="budget__rate">
              <dt className="budget__rate-label">{summary.ciclo.diasRestantes >= 7 ? 'Por semana' : 'Hasta fin de ciclo'}</dt>
              <dd className="budget__rate-value">{formatEuros(Math.max(0, summary.porSemana))}</dd>
            </div>
            <div className="budget__rate">
              <dt className="budget__rate-label">Al día</dt>
              <dd className="budget__rate-value">{formatEuros(Math.max(0, summary.porDia))}</dd>
            </div>
            <div className="budget__rate">
              <dt className="budget__rate-label">Quedan</dt>
              <dd className="budget__rate-value">{summary.ciclo.diasRestantes} {summary.ciclo.diasRestantes === 1 ? 'día' : 'días'}</dd>
            </div>
          </dl>
        )}
        {summary.ritmo && Math.abs(summary.ritmo.desviacion) >= 1 && (
          <p className={`budget__pace ${summary.ritmo.desviacion > 0 ? 'budget__pace--over' : 'budget__pace--under'}`}>
            {summary.ritmo.desviacion > 0
              ? `Vas ${formatEuros(summary.ritmo.desviacion)} por encima de lo previsto a estas alturas.`
              : `Vas ${formatEuros(-summary.ritmo.desviacion)} por debajo de lo previsto. ¡Bien!`}
          </p>
        )}
      </section>

      {isEmpty && (
        <section className="budget__card budget__card--intro">
          <h3 className="budget__title">Empieza por aquí</h3>
          <p className="budget__text">
            Añade tu nómina y tus facturas fijas (alquiler, luz, suscripciones…). Con eso calculo cuánto te queda para
            el día a día cada ciclo, que empieza el día que cobras.
          </p>
          <div className="budget__intro-actions">
            <button type="button" className="budget__button budget__button--primary" onClick={() => setDialog({ kind: 'item', tipo: 'ingreso' })}>
              Añadir nómina
            </button>
            <button type="button" className="budget__button budget__button--secondary" onClick={() => setDialog({ kind: 'item', tipo: 'factura' })}>
              Añadir factura
            </button>
          </div>
        </section>
      )}

      <section className="budget__card">
        <h3 className="budget__title">Cómo sale la cuenta</h3>
        <dl className="budget__breakdown">
          <div className="budget__breakdown-row">
            <dt>Ingresos{summary.ingresos.previstos > 0 ? ' (con previstos)' : ''}</dt>
            <dd className="budget__breakdown-amount budget__breakdown-amount--positive">+{formatEuros(summary.ingresos.total)}</dd>
          </div>
          <div className="budget__breakdown-row">
            <dt>
              Facturas{summary.facturas.pendientes > 0 ? ' (con pendientes)' : ''}
              {summary.facturas.deHucha > 0 ? ', sin lo que paga la hucha' : ''}
            </dt>
            <dd className="budget__breakdown-amount">−{formatEuros(summary.facturas.total)}</dd>
          </div>
          {summary.reservas.total > 0 && (
            <div className="budget__breakdown-row">
              <dt>Apartado en huchas</dt>
              <dd className="budget__breakdown-amount">−{formatEuros(summary.reservas.total)}</dd>
            </div>
          )}
          {summary.ahorroObjetivo > 0 && (
            <div className="budget__breakdown-row">
              <dt>Ahorro</dt>
              <dd className="budget__breakdown-amount">−{formatEuros(summary.ahorroObjetivo)}</dd>
            </div>
          )}
          <div className="budget__breakdown-row">
            <dt>Gastos del día a día</dt>
            <dd className="budget__breakdown-amount">−{formatEuros(summary.gastosVariables)}</dd>
          </div>
          {summary.otrosGrupos && (
            <div className="budget__breakdown-row">
              <dt>Tu parte en otros grupos</dt>
              <dd className="budget__breakdown-amount">−{formatEuros(summary.otrosGrupos.total)}</dd>
            </div>
          )}
          <div className="budget__breakdown-row budget__breakdown-row--total">
            <dt>{summary.disponible < 0 ? 'Te has pasado' : 'Disponible'}</dt>
            <dd className={`budget__breakdown-amount ${negative ? 'budget__breakdown-amount--negative' : ''}`}>
              {formatEuros(summary.disponible)}
            </dd>
          </div>
        </dl>
      </section>

      {summary.limitesCategoria && summary.limitesCategoria.length > 0 && (
        <section className="budget__card">
          <h3 className="budget__title">Límites por categoría</h3>
          <ul className="budget__limits">
            {summary.limitesCategoria.map(l => {
              const level = l.restante < 0 ? 'over' : l.porcentaje >= 80 ? 'warning' : 'ok';
              return (
                <li key={l.categoria} className="budget__limit">
                  <div className="budget__limit-header">
                    <span className="budget__limit-name">{l.categoria}</span>
                    <span className={`budget__limit-left budget__limit-left--${level}`}>
                      {l.restante < 0 ? `Te pasas ${formatEuros(-l.restante)}` : `Quedan ${formatEuros(l.restante)}`}
                    </span>
                  </div>
                  <div
                    className="budget__limit-track"
                    role="progressbar"
                    aria-label={`Gastado en ${l.categoria}`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.min(100, l.porcentaje)}
                  >
                    <span className={`budget__limit-bar budget__limit-bar--${level}`} style={{ width: `${Math.min(100, l.porcentaje)}%` }} />
                  </div>
                  <span className="budget__limit-detail">
                    {formatEuros(l.gastado)} de {formatEuros(l.limite)} · {l.porcentaje} %
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="budget__card">
        <div className="budget__header">
          <h3 className="budget__title">
            Facturas
            {summary.facturas.pendientes > 0 && (
              <span className="budget__badge">{formatEuros(summary.facturas.pendientes)} pendientes</span>
            )}
          </h3>
        </div>
        {summary.facturas.lineas.length > 0 ? (
          <ul className="budget__lines">{summary.facturas.lineas.map(line => renderLine(line, 'factura'))}</ul>
        ) : (
          <p className="budget__text">No hay facturas en este ciclo.</p>
        )}
      </section>

      {summary.reservas.lineas.length > 0 && (
        <section className="budget__card">
          <h3 className="budget__title">Huchas</h3>
          <ul className="budget__limits">
            {summary.reservas.lineas.map(r => {
              const pago = r.proximoPago;
              const porcentaje = pago ? Math.round(pago.cubierto / pago.importe * 100) : 100;
              return (
                <li key={r.recurrente_id} className="budget__limit">
                  <div className="budget__limit-header">
                    <span className="budget__limit-name">{r.nombre}</span>
                    <span className="budget__limit-left budget__limit-left--ok">
                      {r.cuota > 0 ? `Apartas ${formatEuros(r.cuota)}` : 'Nada que apartar'}
                    </span>
                  </div>
                  {pago && (
                    <div
                      className="budget__limit-track"
                      role="progressbar"
                      aria-label={`Apartado para ${r.nombre}`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={porcentaje}
                    >
                      <span className="budget__limit-bar budget__limit-bar--ok" style={{ width: `${porcentaje}%` }} />
                    </div>
                  )}
                  <span className="budget__limit-detail">
                    {pago
                      ? `${formatEuros(pago.cubierto)} de ${formatEuros(pago.importe)} para el ${formatShortDate(pago.fecha)}`
                      : `Sin más pagos · quedan ${formatEuros(r.saldo)} en la hucha`}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="budget__card">
        <div className="budget__header">
          <h3 className="budget__title">Ingresos</h3>
          <button
            type="button"
            className="budget__icon-button"
            onClick={() => setDialog({ kind: 'income' })}
            aria-label="Añadir ingreso suelto"
            title="Añadir ingreso suelto"
          >
            <PlusIcon />
          </button>
        </div>
        {summary.ingresos.lineas.length > 0 ? (
          <ul className="budget__lines">{summary.ingresos.lineas.map(line => renderLine(line, 'ingreso'))}</ul>
        ) : (
          <p className="budget__text">No hay ingresos en este ciclo.</p>
        )}
      </section>

      {summary.otrosGrupos && (
        <section className="budget__card">
          <h3 className="budget__title">Tu parte en otros grupos</h3>
          {summary.otrosGrupos.grupos.length > 0 ? (
            <ul className="budget__lines">
              {summary.otrosGrupos.grupos.map(g => (
                <li key={g._id} className="budget__line">
                  <span className="budget__line-text">
                    <span className="budget__line-name">{g.nombre}</span>
                  </span>
                  <span className="budget__line-amount">{formatEuros(g.total)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="budget__text">No tienes gastos en otros grupos en este ciclo.</p>
          )}
        </section>
      )}

      <BudgetForecast groupId={groupId} token={token} refreshKey={refreshKey} />

      <BudgetHistory groupId={groupId} token={token} refreshKey={refreshKey} />

      <section className="budget__card">
        <div className="budget__header">
          <h3 className="budget__title">Partidas fijas</h3>
          <button
            type="button"
            className="budget__icon-button"
            onClick={() => setDialog({ kind: 'item', tipo: 'factura' })}
            aria-label="Añadir partida fija"
            title="Añadir partida fija"
          >
            <PlusIcon />
          </button>
        </div>
        {items.length === 0 ? (
          <p className="budget__text">Aún no tienes partidas fijas.</p>
        ) : (
          [{ title: 'Ingresos', list: incomeItems }, { title: 'Facturas y gastos fijos', list: billItems }]
            .filter(group => group.list.length > 0)
            .map(group => (
              <div key={group.title} className="budget__items">
                <h4 className="budget__subtitle">{group.title}</h4>
                <ul className="budget__lines">
                  {group.list.map(item => (
                    <li key={item._id} className={`budget__line ${item.activo ? '' : 'budget__line--inactive'}`}>
                      <button
                        type="button"
                        className="budget__item-button"
                        onClick={() => setDialog({ kind: 'item', item, tipo: item.tipo })}
                        aria-label={`Editar ${item.nombre}`}
                      >
                        <span className="budget__line-text">
                          <span className="budget__line-name">{item.nombre}</span>
                          <span className="budget__line-meta">
                            {FRECUENCIA_LABELS[item.frecuencia]} · día {Number(item.fechaInicio.slice(8, 10))}
                            {item.prorratear ? huchaLabel(item.prorrateoDesde) : ''}
                            {item.activo ? '' : ' · desactivada'}
                          </span>
                        </span>
                        <span className="budget__line-amount">{formatEuros(item.importe)}</span>
                        <ChevronRightIcon className="budget__chevron" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))
        )}
      </section>

      {dialog?.kind === 'confirm' && (
        <BudgetMovementDialog
          title={dialog.tipo === 'factura' ? `Pagar ${dialog.line.nombre}` : `Cobrar ${dialog.line.nombre}`}
          submitLabel={dialog.tipo === 'factura' ? 'Marcar pagada' : 'Marcar cobrado'}
          hint={dialog.tipo === 'factura'
            ? 'Se apuntará como gasto del grupo. Cambia el importe si no ha sido el previsto.'
            : 'Cambia el importe si no ha sido el previsto.'}
          initial={{ monto: dialog.line.importe, fecha: defaultDate(dialog.line) }}
          onSubmit={confirm}
          onClose={() => setDialog(null)}
        />
      )}

      {dialog?.kind === 'income' && (
        <BudgetMovementDialog
          title="Añadir ingreso"
          submitLabel="Añadir"
          askDescription
          initial={{ fecha: isCurrent ? today : summary.ciclo.inicio }}
          onSubmit={values => afterChange(() => budgetApi.createIncome(token, groupId, values))}
          onClose={() => setDialog(null)}
        />
      )}

      {dialog?.kind === 'item' && (
        <RecurringItemDialog
          item={dialog.item}
          defaultTipo={dialog.tipo}
          onSave={saveItem}
          onDelete={dialog.item ? () => afterChange(() => budgetApi.deleteRecurringItem(token, dialog.item!._id)) : undefined}
          onClose={() => setDialog(null)}
        />
      )}

      {dialog?.kind === 'undo' && (
        <ConfirmationModal
          title={dialog.tipo === 'factura' ? 'Deshacer el pago' : 'Borrar el ingreso'}
          message={dialog.tipo === 'factura'
            ? `Se borrará el gasto «${dialog.line.nombre}» de ${formatEuros(dialog.line.importe)} y la factura volverá a quedar pendiente.`
            : `Se borrará el ingreso «${dialog.line.nombre}» de ${formatEuros(dialog.line.importe)}.`}
          confirmLabel={dialog.tipo === 'factura' ? 'Deshacer' : 'Borrar'}
          onConfirm={undo}
          onCancel={() => setDialog(null)}
        />
      )}
    </div>
  );
};

export default BudgetTab;
