import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { forceCollide, forceSimulation, forceX, forceY, Simulation, SimulationNodeDatum } from 'd3-force';
import ConfirmationModal from './ConfirmationModal';
import ScenarioItemDialog from './ScenarioItemDialog';
import { PlusIcon, TrashIcon } from './icons';
import { Frecuencia, IBudgetForecast, ICycleForecastEntry, IRecurringItem, IScenarioItem, RecurringTipo } from '../types/budget';
import { budgetApi } from '../utils/budgetApi';
import { formatEuros, formatShortDate } from '../utils/format';
import './BudgetScenario.scss';

interface BudgetScenarioProps {
  groupId: string;
  token: string;
  items: IRecurringItem[]; // las partidas fijas del grupo
  refreshKey?: number;
  // Tras aplicar el ensayo: recargar el presupuesto
  onApplied: () => Promise<void> | void;
}

// Una pelotita: una partida, o varias con el mismo nombre base («Visa &Go (cuota 110 €)», «Visa &Go (cuota 120 €)»...)
interface Bubble {
  id: string;
  ids: string[];    // partidas que representa
  nombre: string;   // corto, para la pelotita
  titulo: string;   // completo, para el lector de pantalla y el tooltip
  detalle: string;  // importe, o cuántas partidas agrupa
  peso: number;     // lo que mueve en el próximo año: fija su tamaño
  tipo: RecurringTipo;
  quitada: boolean;
  simulada: boolean;
  otras?: boolean;  // las pequeñas juntas: al tocarla se abre
}

interface BubbleNode extends SimulationNodeDatum {
  id: string;
  r: number;
}

const CICLOS = 13; // un año vista
const MIN_R = 24;
const MAX_R = 64;
const SMALLEST_R = 20;
const MAX_FACTURAS = 11; // las demás van juntas en «Otras» hasta que se abra
const FILL = 0.42; // parte del tablero que pueden ocupar las pelotitas
const DRAG_THRESHOLD = 6;
const MESES: Record<Frecuencia, number> = { mensual: 1, bimestral: 2, trimestral: 3, semestral: 6, anual: 12 };
const CADA: Record<Frecuencia, string> = { mensual: '/mes', bimestral: '/2 meses', trimestral: '/3 meses', semestral: '/6 meses', anual: '/año' };

const signed = (n: number) => (n < 0 ? `−${formatEuros(-n)}` : formatEuros(n));
const perYear = (i: { importe: number; frecuencia: Frecuencia }) => (i.importe * 12) / MESES[i.frecuencia];
const amountOf = (i: { importe: number; frecuencia: Frecuencia }) =>
  `${formatEuros(i.importe)}${i.frecuencia === 'mensual' ? '' : CADA[i.frecuencia]}`;
// «Visa &Go (cuota 110 €)» y «Visa &Go (último pago)» son de la misma familia
const familyOf = (nombre: string) => nombre.replace(/\s*\([^)]*\)\s*$/, '').trim() || nombre;

// Lo que importa de una previsión: cuánto queda de media, el ciclo más justo y cuántos en negativo
const stats = (forecast: IBudgetForecast) => {
  const future = forecast.ciclos.filter(c => !c.enCurso);
  const media = future.length ? future.reduce((acc, c) => acc + c.disponible, 0) / future.length : 0;
  const peor = future.reduce<ICycleForecastEntry | null>((min, c) => (!min || c.disponible < min.disponible ? c : min), null);
  return { media: Math.round(media * 100) / 100, peor, negativos: future.filter(c => c.disponible < 0).length };
};

// Ensayo de la previsión: cada partida fija es una pelotita que se arrastra a la papelera
// (o se toca) para ver qué pasaría sin ella; con «+» se inventan partidas nuevas
const BudgetScenario: React.FC<BudgetScenarioProps> = ({ groupId, token, items, refreshKey = 0, onApplied }) => {
  const [quitar, setQuitar] = useState<string[]>([]);
  const [nuevas, setNuevas] = useState<{ id: string; item: IScenarioItem }[]>([]);
  const [base, setBase] = useState<IBudgetForecast | null>(null);
  const [ensayo, setEnsayo] = useState<IBudgetForecast | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [abiertas, setAbiertas] = useState(false);
  const nextId = useRef(0);

  const active = useMemo(() => items.filter(i => i.activo), [items]);
  const changed = quitar.length > 0 || nuevas.length > 0;

  // Lo que suma cada factura en la previsión del próximo año (los ingresos no salen en ella)
  const yearly = useMemo(() => {
    if (!base) return null;
    const map = new Map<string, number>();
    for (const c of base.ciclos) for (const p of c.partidas) map.set(p.recurrente_id, (map.get(p.recurrente_id) ?? 0) + p.importe);
    return map;
  }, [base]);

  const { bubbles, ocultas, muchas } = useMemo(() => {
    const families = new Map<string, IRecurringItem[]>();
    for (const item of active) {
      const key = `${item.tipo}:${familyOf(item.nombre).toLocaleLowerCase('es')}`;
      families.set(key, [...(families.get(key) ?? []), item]);
    }
    const all: Bubble[] = [...families.entries()].map(([key, group]) => ({
      id: key,
      ids: group.map(i => i._id),
      nombre: familyOf(group[0].nombre),
      titulo: group.length === 1 ? group[0].nombre : familyOf(group[0].nombre),
      detalle: group.length === 1 ? amountOf(group[0]) : `${group.length} partidas`,
      peso: group.reduce((acc, i) => acc + (i.tipo === 'factura' && yearly ? yearly.get(i._id) ?? 0 : perYear(i)), 0),
      tipo: group[0].tipo,
      quitada: group.every(i => quitar.includes(i._id)),
      simulada: false
    }));
    const inventadas: Bubble[] = nuevas.map(({ id, item }) => ({
      id, ids: [], nombre: item.nombre, titulo: item.nombre, detalle: amountOf(item), peso: perYear(item), tipo: item.tipo, quitada: false, simulada: true
    }));
    // Las que no tocan en el próximo año no cambian nada en el ensayo
    const visibles = all.filter(b => b.peso > 0 || b.quitada);
    const facturas = visibles.filter(b => b.tipo === 'factura').sort((a, b) => b.peso - a.peso);
    const muchas = facturas.length > MAX_FACTURAS + 1;
    const pequenas = abiertas || !muchas ? [] : facturas.slice(MAX_FACTURAS);
    const sueltas = visibles.filter(b => !pequenas.includes(b));
    const otras: Bubble[] = pequenas.length ? [{
      id: 'otras',
      ids: pequenas.flatMap(b => b.ids),
      nombre: 'Otras',
      titulo: `Otras: ${pequenas.map(b => b.titulo).join(', ')}`,
      detalle: `${pequenas.length} más`,
      peso: pequenas.reduce((acc, b) => acc + b.peso, 0),
      tipo: 'factura',
      quitada: pequenas.every(b => b.quitada),
      simulada: false,
      otras: true
    }] : [];
    return { bubbles: [...sueltas, ...otras, ...inventadas], ocultas: all.length - visibles.length, muchas };
  }, [active, nuevas, quitar, yearly, abiertas]);

  // Si una partida desaparece (borrada en otro sitio), deja de estar quitada
  useEffect(() => {
    setQuitar(prev => prev.filter(id => active.some(i => i._id === id)));
  }, [active]);

  useEffect(() => {
    budgetApi.getForecast(token, groupId, CICLOS)
      .then(f => { setBase(f); setError(null); })
      .catch(err => setError(err instanceof Error ? err.message : 'No se pudo cargar la previsión.'));
  }, [token, groupId, refreshKey]);

  // Recalcula el ensayo poco después del último cambio
  useEffect(() => {
    if (!changed) {
      setEnsayo(null);
      return;
    }
    const timer = setTimeout(() => {
      budgetApi.simulateForecast(token, groupId, CICLOS, { quitar, nuevas: nuevas.map(n => n.item) })
        .then(f => { setEnsayo(f); setError(null); })
        .catch(err => setError(err instanceof Error ? err.message : 'No se pudo simular.'));
    }, 250);
    return () => clearTimeout(timer);
  }, [token, groupId, quitar, nuevas, changed, refreshKey]);

  const toggle = useCallback((bubble: Bubble, quitada: boolean) => {
    if (bubble.simulada) {
      // Una inventada que va a la papelera se descarta del todo
      if (quitada) setNuevas(prev => prev.filter(n => n.id !== bubble.id));
      return;
    }
    setQuitar(prev => {
      const rest = prev.filter(id => !bubble.ids.includes(id));
      return quitada ? [...rest, ...bubble.ids] : rest;
    });
  }, []);

  const addNueva = (item: IScenarioItem) => {
    setNuevas(prev => [...prev, { id: `nueva-${nextId.current++}`, item }]);
    setAdding(false);
  };

  const reset = () => {
    setQuitar([]);
    setNuevas([]);
  };

  const apply = async () => {
    setBusy(true);
    try {
      await Promise.all([
        ...quitar.map(id => budgetApi.updateRecurringItem(token, id, { activo: false })),
        ...nuevas.map(({ item }) => budgetApi.createRecurringItem(token, groupId, { ...item, categoria: [], activo: true }))
      ]);
      reset();
      setConfirming(false);
      await onApplied();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo aplicar el ensayo.');
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  };

  const shown = ensayo ?? base;
  const before = base && stats(base);
  const after = shown && stats(shown);
  const quitadas = bubbles.filter(b => b.quitada);

  return (
    <section className="budget-scenario">
      <div className="budget-scenario__header">
        <h3 className="budget-scenario__title">¿Y si…?</h3>
        <button
          type="button"
          className="budget-scenario__icon-button"
          onClick={() => setAdding(true)}
          aria-label="Inventar una partida"
          title="Inventar una partida"
        >
          <PlusIcon />
        </button>
      </div>
      <p className="budget-scenario__text">
        Arrastra una partida a la papelera (o tócala) para ver qué pasaría sin ella, o inventa una con «+». Es un ensayo: no
        cambia nada hasta que lo apliques.
      </p>

      {error && <p className="budget-scenario__error" role="alert">{error}</p>}

      <Arena bubbles={bubbles} onToggle={toggle} onOpen={() => setAbiertas(true)} />
      {abiertas && muchas && (
        <button type="button" className="budget-scenario__link" onClick={() => setAbiertas(false)}>
          Juntar otra vez las pequeñas
        </button>
      )}

      {quitadas.length > 0 && (
        <p className="budget-scenario__text">Fuera del ensayo: {quitadas.map(b => b.nombre).join(', ')}.</p>
      )}
      {ocultas > 0 && (
        <p className="budget-scenario__text">
          {ocultas === 1 ? 'Una partida no sale porque no toca' : `${ocultas} partidas no salen porque no tocan`} en el próximo año.
        </p>
      )}

      {before && after && (
        <Outcome base={base!} shown={shown!} before={before} after={after} changed={changed} />
      )}

      {changed && (
        <div className="budget-scenario__actions">
          <button type="button" className="budget-scenario__button budget-scenario__button--secondary" onClick={reset} disabled={busy}>
            Descartar
          </button>
          <button type="button" className="budget-scenario__button budget-scenario__button--primary" onClick={() => setConfirming(true)} disabled={busy}>
            Aplicar
          </button>
        </div>
      )}

      {adding && <ScenarioItemDialog onAdd={addNueva} onClose={() => setAdding(false)} />}

      {confirming && (
        <ConfirmationModal
          title="Aplicar el ensayo"
          message={[
            quitar.length ? `Se desactivarán: ${active.filter(i => quitar.includes(i._id)).map(i => i.nombre).join(', ')}.` : '',
            nuevas.length ? `Se crearán como partidas fijas: ${nuevas.map(n => n.item.nombre).join(', ')}.` : ''
          ].filter(Boolean).join(' ')}
          confirmLabel="Aplicar"
          onConfirm={() => void apply()}
          onCancel={() => setConfirming(false)}
        />
      )}
    </section>
  );
};

// ---------- Pelotitas ----------

interface ArenaProps {
  bubbles: Bubble[];
  onToggle: (bubble: Bubble, quitada: boolean) => void;
  onOpen: () => void;
}

const Arena: React.FC<ArenaProps> = ({ bubbles, onToggle, onOpen }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(320);
  const [, setFrame] = useState(0);
  const nodes = useRef(new Map<string, BubbleNode>());
  const sim = useRef<Simulation<BubbleNode, undefined> | null>(null);
  const drag = useRef<{ id: string; startX: number; startY: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const [overTrash, setOverTrash] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth || 320);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Tamaños según el peso de cada una, encogidos si no caben; con muchas, el tablero crece
  const layout = useMemo(() => {
    const inside = bubbles.filter(b => !b.quitada);
    const removed = bubbles.length - inside.length;
    const arenaH = Math.min(480, Math.max(260, 140 + 14 * inside.length));
    const trashH = Math.min(200, 96 + Math.max(0, removed - 5) * 14);
    const maxPeso = Math.max(1, ...bubbles.map(b => b.peso));
    const raw = new Map(bubbles.map(b => [b.id, Math.min(MIN_R + (MAX_R - MIN_R) * Math.sqrt(b.peso / maxPeso), width / 5)]));
    const area = inside.reduce((acc, b) => acc + Math.PI * raw.get(b.id)! ** 2, 0);
    const k = area > 0 ? Math.min(1, Math.sqrt((FILL * width * arenaH) / area)) : 1;
    const radii = new Map(bubbles.map(b => {
      const r = Math.max(SMALLEST_R, raw.get(b.id)! * k);
      // En la papelera, más pequeñas para que quepan
      return [b.id, b.quitada ? Math.max(16, r * 0.6) : r];
    }));
    // Cada lado ocupa lo que pesan sus pelotitas, sin quedarse en nada
    const incomeArea = inside.filter(b => b.tipo === 'ingreso').reduce((acc, b) => acc + radii.get(b.id)! ** 2, 0);
    const totalArea = inside.reduce((acc, b) => acc + radii.get(b.id)! ** 2, 0);
    const share = Math.min(0.5, Math.max(0.22, totalArea ? incomeArea / totalArea : 0.3));
    return { arenaH, trashH, radii, share };
  }, [bubbles, width]);
  const { arenaH, trashH } = layout;

  // Las pelotitas conservan su sitio entre renders; las nuevas caen desde arriba
  useEffect(() => {
    const map = nodes.current;
    const ids = new Set(bubbles.map(b => b.id));
    for (const id of [...map.keys()]) if (!ids.has(id)) map.delete(id);
    const list = bubbles.map((b, i) => {
      const node = map.get(b.id) ?? { id: b.id, r: 0, x: width / 2 + (i % 5 - 2) * 10, y: 20 };
      node.r = layout.radii.get(b.id)!;
      map.set(b.id, node);
      return node;
    });
    const byId = new Map(bubbles.map(b => [b.id, b]));
    const targetX = (n: BubbleNode) => {
      const b = byId.get(n.id)!;
      if (b.quitada) return width / 2;
      return b.tipo === 'ingreso' ? (width * layout.share) / 2 : width * (layout.share + (1 - layout.share) / 2);
    };
    const targetY = (n: BubbleNode) => (byId.get(n.id)!.quitada ? arenaH + trashH / 2 : arenaH / 2);

    sim.current?.stop();
    const simulation = forceSimulation<BubbleNode>(list)
      .force('x', forceX<BubbleNode>(targetX).strength(0.07))
      .force('y', forceY<BubbleNode>(targetY).strength(n => (byId.get(n.id)!.quitada ? 0.3 : 0.09)))
      .force('collide', forceCollide<BubbleNode>(n => n.r + 3).strength(0.9))
      .alpha(0.9)
      .on('tick', () => {
        for (const n of list) {
          const b = byId.get(n.id)!;
          const top = b.quitada ? arenaH + n.r + 4 : n.r + 4;
          const bottom = b.quitada ? arenaH + trashH - n.r - 4 : arenaH - n.r - 4;
          if (n.fx == null) {
            n.x = Math.max(n.r, Math.min(width - n.r, n.x ?? 0));
            n.y = Math.max(top, Math.min(bottom, n.y ?? 0));
          }
        }
        setFrame(f => f + 1);
      });
    sim.current = simulation;
    return () => { simulation.stop(); };
  }, [bubbles, width, layout]);

  const local = (e: React.PointerEvent) => {
    const rect = ref.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>, id: string) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const { x, y } = local(e);
    drag.current = { id, startX: x, startY: y, moved: false };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d) return;
    const { x, y } = local(e);
    if (!d.moved && Math.hypot(x - d.startX, y - d.startY) < DRAG_THRESHOLD) return;
    d.moved = true;
    const node = nodes.current.get(d.id);
    if (!node) return;
    node.fx = Math.max(node.r, Math.min(width - node.r, x));
    node.fy = Math.max(node.r, Math.min(arenaH + trashH - node.r, y));
    setOverTrash(y > arenaH);
    sim.current?.alphaTarget(0.3).restart();
  };

  const onPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    drag.current = null;
    setOverTrash(false);
    if (!d?.moved) return;
    suppressClick.current = true;
    const node = nodes.current.get(d.id);
    if (node) {
      node.fx = null;
      node.fy = null;
    }
    sim.current?.alphaTarget(0);
    const bubble = bubbles.find(b => b.id === d.id);
    const quitada = local(e).y > arenaH;
    if (bubble && bubble.quitada !== quitada) onToggle(bubble, quitada);
    else sim.current?.alpha(0.5).restart();
  };

  return (
    <div className="budget-scenario__arena" ref={ref} style={{ height: arenaH + trashH }}>
      <span className="budget-scenario__zone budget-scenario__zone--income" aria-hidden="true">Ingresos</span>
      <span className="budget-scenario__zone budget-scenario__zone--bills" aria-hidden="true">Gastos</span>
      <div
        className={`budget-scenario__trash ${overTrash ? 'budget-scenario__trash--over' : ''}`}
        style={{ height: trashH }}
        aria-hidden="true"
      >
        <TrashIcon className="budget-scenario__trash-icon" />
        <span className="budget-scenario__trash-label">Sin esto</span>
      </div>
      {bubbles.length === 0 && (
        <p className="budget-scenario__empty">Aún no tienes partidas fijas. Inventa una con «+».</p>
      )}
      {bubbles.map(b => {
        const node = nodes.current.get(b.id);
        if (!node) return null;
        const r = node.r;
        return (
          <button
            key={b.id}
            type="button"
            className={[
              'budget-scenario__bubble',
              `budget-scenario__bubble--${b.simulada ? 'new-' : ''}${b.tipo === 'ingreso' ? 'income' : 'bill'}`,
              b.otras ? 'budget-scenario__bubble--others' : '',
              b.quitada ? 'budget-scenario__bubble--removed' : ''
            ].filter(Boolean).join(' ')}
            style={{ width: r * 2, height: r * 2, fontSize: Math.max(10, Math.min(13, r / 3)), transform: `translate(${(node.x ?? 0) - r}px, ${(node.y ?? 0) - r}px)` }}
            aria-pressed={b.quitada}
            aria-label={b.otras && !b.quitada
              ? `${b.titulo}. Toca para verlas por separado; arrástrala a la papelera para quitarlas todas`
              : `${b.titulo}, ${b.detalle}${b.simulada ? ', inventada' : ''}. ${b.quitada ? 'Fuera del ensayo: toca para recuperarla' : 'Toca para quitarla del ensayo'}`}
            title={`${b.titulo} · ${b.detalle}`}
            onPointerDown={e => onPointerDown(e, b.id)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onClick={() => {
              if (suppressClick.current) {
                suppressClick.current = false;
                return;
              }
              if (b.otras && !b.quitada) onOpen();
              else onToggle(b, !b.quitada);
            }}
          >
            <span className="budget-scenario__bubble-name">{b.nombre}</span>
            {r >= 28 && <span className="budget-scenario__bubble-amount">{b.detalle}</span>}
          </button>
        );
      })}
    </div>
  );
};

// ---------- Resultado ----------

interface OutcomeProps {
  base: IBudgetForecast;
  shown: IBudgetForecast;
  before: ReturnType<typeof stats>;
  after: ReturnType<typeof stats>;
  changed: boolean;
}

const CHART_HEIGHT = 120;

const Outcome: React.FC<OutcomeProps> = ({ base, shown, before, after, changed }) => {
  const diff = Math.round((after.media - before.media) * 100) / 100;
  const cycles = shown.ciclos.filter(c => !c.enCurso);
  const baseByStart = new Map(base.ciclos.map(c => [c.inicio, c.disponible]));
  const values = cycles.flatMap(c => [c.disponible, baseByStart.get(c.inicio) ?? 0]);
  const top = Math.max(0, ...values);
  const bottom = Math.min(0, ...values);
  const span = top - bottom || 1;
  const y = (v: number) => ((top - v) / span) * CHART_HEIGHT;
  const step = 100 / Math.max(1, cycles.length);

  return (
    <div className="budget-scenario__outcome">
      <p className="budget-scenario__headline">
        <span className="budget-scenario__headline-label">
          {changed ? 'Con el ensayo, te quedaría para gastar en cada ciclo' : 'Te queda para gastar en cada ciclo'} (media del próximo año)
        </span>
        <span className={`budget-scenario__headline-amount ${after.media < 0 ? 'budget-scenario__headline-amount--negative' : ''}`}>
          {signed(after.media)}
        </span>
      </p>
      {changed && (
        <p className="budget-scenario__text">
          Ahora: {signed(before.media)}.{' '}
          {diff === 0 ? (
            'No cambia.'
          ) : (
            <span className={`budget-scenario__delta budget-scenario__delta--${diff > 0 ? 'up' : 'down'}`}>
              {formatEuros(Math.abs(diff))} {diff > 0 ? 'más' : 'menos'} cada ciclo.
            </span>
          )}
        </p>
      )}
      {after.peor && (
        <p className="budget-scenario__text">
          El ciclo más justo empieza el {formatShortDate(after.peor.inicio)}: {signed(after.peor.disponible)}.
          {after.negativos > 0
            ? ` ${after.negativos} ${after.negativos === 1 ? 'ciclo acabaría' : 'ciclos acabarían'} en negativo.`
            : ' Ningún ciclo acaba en negativo.'}
        </p>
      )}

      {cycles.length > 0 && (
        <figure className="budget-scenario__chart">
          <svg
            className="budget-scenario__svg"
            viewBox={`0 0 100 ${CHART_HEIGHT}`}
            preserveAspectRatio="none"
            role="img"
            aria-label={`Lo que quedaría para gastar en cada uno de los próximos ${cycles.length} ciclos`}
          >
            <line className="budget-scenario__zero" x1="0" x2="100" y1={y(0)} y2={y(0)} vectorEffect="non-scaling-stroke" />
            {cycles.map((c, i) => {
              const now = baseByStart.get(c.inicio) ?? 0;
              const x = i * step + step * 0.15;
              const w = step * 0.7;
              return (
                <g key={c.inicio}>
                  <title>{`${formatShortDate(c.inicio)}: ${signed(c.disponible)}${changed ? ` (ahora ${signed(now)})` : ''}`}</title>
                  <rect
                    className={`budget-scenario__bar ${c.disponible < 0 ? 'budget-scenario__bar--negative' : ''}`}
                    x={x}
                    width={w}
                    y={Math.min(y(c.disponible), y(0))}
                    height={Math.max(1, Math.abs(y(c.disponible) - y(0)))}
                  />
                  {changed && (
                    <line className="budget-scenario__now" x1={x - step * 0.05} x2={x + w + step * 0.05} y1={y(now)} y2={y(now)} vectorEffect="non-scaling-stroke" />
                  )}
                </g>
              );
            })}
          </svg>
          <figcaption className="budget-scenario__legend">
            <span className="budget-scenario__legend-item">
              <span className="budget-scenario__swatch budget-scenario__swatch--bar" aria-hidden="true" />
              Para gastar por ciclo{changed ? ' con el ensayo' : ''}
            </span>
            {changed && (
              <span className="budget-scenario__legend-item">
                <span className="budget-scenario__swatch budget-scenario__swatch--now" aria-hidden="true" />
                Ahora
              </span>
            )}
            <span className="budget-scenario__legend-range">
              {formatShortDate(cycles[0].inicio)} – {formatShortDate(cycles[cycles.length - 1].inicio)}
            </span>
          </figcaption>
        </figure>
      )}
    </div>
  );
};

export default BudgetScenario;
