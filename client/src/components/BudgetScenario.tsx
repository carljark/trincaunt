import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { forceCollide, forceSimulation, forceX, forceY, Simulation, SimulationNodeDatum } from 'd3-force';
import ConfirmationModal from './ConfirmationModal';
import ScenarioItemDialog from './ScenarioItemDialog';
import { CloseIcon, PlusIcon, TrashIcon } from './icons';
import { Frecuencia, IBudgetForecast, ICycleForecastEntry, IRecurringItem, IScenarioItem, RecurringTipo } from '../types/budget';
import { budgetApi, RecurringItemInput } from '../utils/budgetApi';
import { formatEuros, formatShortDate, todayYmd } from '../utils/format';
import { MAX_MESES, SIN_RETOQUE, Tweak, isTweaked, monthIndex, niceAmount, paysInMonth, shiftMonths, tweakScenarioItem, tweakedFields } from '../utils/scenario';
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
  importe?: number; // el de la partida, sin retocar (si es una sola)
  partidas: Payable[]; // para saber en qué meses toca
  tweak: Tweak;
}

type Payable = Pick<IRecurringItem, 'frecuencia' | 'fechaInicio' | 'fechaFin' | 'pagosEspeciales'>;

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
  const [tweaks, setTweaks] = useState<Record<string, Tweak>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const nextId = useRef(0);

  const active = useMemo(() => items.filter(i => i.activo), [items]);

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
    const all: Bubble[] = [...families.entries()].map(([key, group]) => {
      const tweak = tweaks[key] ?? SIN_RETOQUE;
      return {
        id: key,
        ids: group.map(i => i._id),
        nombre: familyOf(group[0].nombre),
        titulo: group.length === 1 ? group[0].nombre : familyOf(group[0].nombre),
        detalle: group.length === 1 ? amountOf({ ...group[0], importe: group[0].importe * tweak.escala }) : `${group.length} partidas`,
        peso: tweak.escala * group.reduce((acc, i) => acc + (i.tipo === 'factura' && yearly ? yearly.get(i._id) ?? 0 : perYear(i)), 0),
        tipo: group[0].tipo,
        quitada: group.every(i => quitar.includes(i._id)),
        simulada: false,
        importe: group.length === 1 ? group[0].importe : undefined,
        partidas: group,
        tweak
      };
    });
    const inventadas: Bubble[] = nuevas.map(({ id, item }) => {
      const tweak = tweaks[id] ?? SIN_RETOQUE;
      const shown = tweakScenarioItem(item, tweak);
      return {
        id, ids: [], nombre: item.nombre, titulo: item.nombre, detalle: amountOf(shown), peso: perYear(shown), tipo: item.tipo,
        quitada: false, simulada: true, importe: item.importe, partidas: [item], tweak
      };
    });
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
      otras: true,
      partidas: [],
      tweak: SIN_RETOQUE
    }] : [];
    return { bubbles: [...sueltas, ...otras, ...inventadas], ocultas: all.length - visibles.length, muchas };
  }, [active, nuevas, quitar, yearly, abiertas, tweaks]);

  // Lo que se manda a simular: los retoques de las guardadas van aparte; las inventadas, ya retocadas
  const scenario = useMemo(() => {
    const cambiar = Object.entries(tweaks)
      .filter(([, t]) => isTweaked(t))
      .flatMap(([key, t]) => (bubbles.find(b => b.id === key && !b.simulada)?.ids ?? [])
        .filter(id => !quitar.includes(id))
        .map(id => ({ id, ...(t.escala !== 1 ? { escala: t.escala } : {}), ...(t.meses !== 0 ? { meses: t.meses } : {}) })));
    return { quitar, nuevas: nuevas.map(n => tweakScenarioItem(n.item, tweaks[n.id] ?? SIN_RETOQUE)), cambiar };
  }, [quitar, nuevas, tweaks, bubbles]);
  const changed = quitar.length > 0 || nuevas.length > 0 || scenario.cambiar.length > 0;
  const tweaking = bubbles.find(b => b.id === selected && !b.quitada && !b.otras);

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
      budgetApi.simulateForecast(token, groupId, CICLOS, scenario)
        .then(f => { setEnsayo(f); setError(null); })
        .catch(err => setError(err instanceof Error ? err.message : 'No se pudo simular.'));
    }, 250);
    return () => clearTimeout(timer);
  }, [token, groupId, scenario, changed, refreshKey]);

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

  const setTweak = useCallback((id: string, change: Partial<Tweak>) => {
    setTweaks(prev => ({ ...prev, [id]: { ...(prev[id] ?? SIN_RETOQUE), ...change } }));
  }, []);

  // Al estirar: el importe en pasos redondos (o de 5 % en 5 % si la pelotita junta varias)
  const stretch = useCallback((bubble: Bubble, escala: number) => {
    const next = bubble.importe ? niceAmount(bubble.importe * escala) / bubble.importe : Math.max(0.05, Math.round(escala * 20) / 20);
    setTweak(bubble.id, { escala: Math.min(10, next) });
  }, [setTweak]);

  const addNueva = (item: IScenarioItem) => {
    setNuevas(prev => [...prev, { id: `nueva-${nextId.current++}`, item }]);
    setAdding(false);
  };

  const reset = () => {
    setQuitar([]);
    setNuevas([]);
    setTweaks({});
    setSelected(null);
  };

  // Las guardadas retocadas (y no quitadas), con lo que hay que guardar de cada una
  const retocadas = active.flatMap(item => {
    const change = scenario.cambiar.find(c => c.id === item._id);
    return change ? [{ item, data: tweakedFields(item, { ...SIN_RETOQUE, ...change }) }] : [];
  });

  const apply = async () => {
    setBusy(true);
    try {
      await Promise.all([
        ...quitar.map(id => budgetApi.updateRecurringItem(token, id, { activo: false })),
        ...retocadas.map(({ item, data }) => budgetApi.updateRecurringItem(token, item._id, data)),
        ...scenario.nuevas.map(item => budgetApi.createRecurringItem(token, groupId, { ...item, categoria: [], activo: true }))
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
        <h3 className="budget-scenario__title">El juego de las pelotas: ¿Y si…?</h3>
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
      {error && <p className="budget-scenario__error" role="alert">{error}</p>}

      {before && after && <Score before={before} after={after} changed={changed} />}

      <Arena
        bubbles={bubbles}
        selected={tweaking?.id ?? null}
        onToggle={toggle}
        onOpen={() => setAbiertas(true)}
        onSelect={id => setSelected(prev => (prev === id ? null : id))}
        onStretch={stretch}
      />
      {tweaking ? (
        <TweakPanel
          key={tweaking.id}
          bubble={tweaking}
          onChange={change => setTweak(tweaking.id, change)}
          onRemove={() => { toggle(tweaking, true); setSelected(null); }}
          onClose={() => setSelected(null)}
        />
      ) : (
        <p className="budget-scenario__text">
          Arrastra una partida a la papelera para ver qué pasaría sin ella. Tócala para retocarla: estírala desde el tirador
          para cambiar el importe o muévela de mes. Con «+» inventas una. Es un ensayo: no cambia nada hasta que lo apliques.
        </p>
      )}
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

      {base && shown && <Outcome base={base} shown={shown} changed={changed} />}

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
            retocadas.length ? `Se cambiarán: ${retocadas.map(({ item, data }) => `${item.nombre} (${describeChange(item, data)})`).join(', ')}.` : '',
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

const describeChange = (item: IRecurringItem, data: Partial<RecurringItemInput>) => [
  data.importe !== undefined ? amountOf({ ...item, importe: data.importe }) : '',
  data.fechaInicio ? `${monthsLabel(monthIndex(data.fechaInicio) - monthIndex(item.fechaInicio))}` : ''
].filter(Boolean).join(', ');

const monthsLabel = (meses: number) =>
  meses === 0 ? 'en sus fechas' : `${Math.abs(meses)} ${Math.abs(meses) === 1 ? 'mes' : 'meses'} ${meses > 0 ? 'más tarde' : 'antes'}`;

// ---------- Pelotitas ----------

interface ArenaProps {
  bubbles: Bubble[];
  selected: string | null;
  onToggle: (bubble: Bubble, quitada: boolean) => void;
  onOpen: () => void;
  onSelect: (id: string) => void;
  onStretch: (bubble: Bubble, escala: number) => void;
}

const Arena: React.FC<ArenaProps> = ({ bubbles, selected, onToggle, onOpen, onSelect, onStretch }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(320);
  const [, setFrame] = useState(0);
  const nodes = useRef(new Map<string, BubbleNode>());
  const sim = useRef<Simulation<BubbleNode, undefined> | null>(null);
  const drag = useRef<{ id: string; startX: number; startY: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  // Estirando una pelotita desde su tirador: el radio sigue al dedo hasta soltarla
  const stretching = useRef<{ id: string; r0: number; escala0: number; r: number } | null>(null);
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
      node.r = stretching.current?.id === b.id ? stretching.current.r : layout.radii.get(b.id)!;
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

  const onHandleDown = (e: React.PointerEvent<HTMLSpanElement>, bubble: Bubble) => {
    if (e.button !== 0) return;
    const node = nodes.current.get(bubble.id);
    if (!node) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    node.fx = node.x;
    node.fy = node.y;
    stretching.current = { id: bubble.id, r0: node.r, escala0: bubble.tweak.escala, r: node.r };
  };

  const onHandleMove = (e: React.PointerEvent<HTMLSpanElement>) => {
    const s = stretching.current;
    const node = s && nodes.current.get(s.id);
    const bubble = s && bubbles.find(b => b.id === s.id);
    if (!s || !node || !bubble) return;
    const { x, y } = local(e);
    // El tirador está en diagonal: la distancia al centro es el radio nuevo
    s.r = Math.max(14, Math.min(width / 2.5, arenaH / 2, Math.hypot(x - (node.x ?? 0), y - (node.y ?? 0))));
    node.r = s.r;
    // Proporcional al radio, no al área: con el dedo, el área se dispara enseguida
    onStretch(bubble, s.escala0 * (s.r / s.r0));
    sim.current?.alpha(0.3).restart();
  };

  const onHandleUp = () => {
    const s = stretching.current;
    stretching.current = null;
    const node = s && nodes.current.get(s.id);
    if (node) {
      node.fx = null;
      node.fy = null;
      node.r = layout.radii.get(node.id) ?? node.r;
    }
    sim.current?.alpha(0.5).restart();
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
              b.quitada ? 'budget-scenario__bubble--removed' : '',
              isTweaked(b.tweak) ? 'budget-scenario__bubble--tweaked' : '',
              selected === b.id ? 'budget-scenario__bubble--selected' : ''
            ].filter(Boolean).join(' ')}
            style={{ width: r * 2, height: r * 2, fontSize: Math.max(10, Math.min(13, r / 3)), transform: `translate(${(node.x ?? 0) - r}px, ${(node.y ?? 0) - r}px)` }}
            aria-pressed={b.otras || b.quitada ? undefined : selected === b.id}
            aria-label={b.otras && !b.quitada
              ? `${b.titulo}. Toca para verlas por separado; arrástrala a la papelera para quitarlas todas`
              : `${b.titulo}, ${b.detalle}${b.simulada ? ', inventada' : ''}${isTweaked(b.tweak) ? ', retocada' : ''}. ${b.quitada ? 'Fuera del ensayo: toca para recuperarla' : 'Toca para retocarla'}`}
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
              else if (b.quitada) onToggle(b, false);
              else onSelect(b.id);
            }}
          >
            <span className="budget-scenario__bubble-name">{b.nombre}</span>
            {r >= 28 && <span className="budget-scenario__bubble-amount">{b.detalle}</span>}
          </button>
        );
      })}
      {bubbles.filter(b => b.id === selected).map(b => {
        const node = nodes.current.get(b.id);
        if (!node) return null;
        // Abajo a la derecha, en el borde de la pelotita
        const offset = node.r * Math.SQRT1_2;
        return (
          <span
            key="handle"
            className="budget-scenario__handle"
            style={{ transform: `translate(${(node.x ?? 0) + offset}px, ${(node.y ?? 0) + offset}px)` }}
            aria-hidden="true"
            title="Estira para cambiar el importe"
            onPointerDown={e => onHandleDown(e, b)}
            onPointerMove={onHandleMove}
            onPointerUp={onHandleUp}
            onPointerCancel={onHandleUp}
          />
        );
      })}
    </div>
  );
};

// ---------- Retoque de una pelotita ----------

interface TweakPanelProps {
  bubble: Bubble;
  onChange: (change: Partial<Tweak>) => void;
  onRemove: () => void;
  onClose: () => void;
}

const MESES_TIRA = 12;
const monthName = (index: number) =>
  new Date(Date.UTC(Math.floor(index / 12), index % 12, 1)).toLocaleDateString('es-ES', { month: 'short', timeZone: 'UTC' }).replace('.', '');

// Debajo del tablero: el importe (lo mismo que estirar) y la tira de meses para mover sus fechas
const TweakPanel: React.FC<TweakPanelProps> = ({ bubble, onChange, onRemove, onClose }) => {
  const { tweak, importe } = bubble;
  const strip = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; meses: number; moved: boolean } | null>(null);
  const first = monthIndex(todayYmd());
  const months = Array.from({ length: MESES_TIRA }, (_, i) => first + i);
  const pays = (month: number, meses: number) => bubble.partidas.some(p => paysInMonth(p, month, meses));
  // Todos los meses y sin fin: moverla no cambia nada
  const moves = bubble.partidas.some(p =>
    p.frecuencia !== 'mensual' || p.fechaFin || p.pagosEspeciales?.length || monthIndex(p.fechaInicio) >= first);

  const [draft, setDraft] = useState<string | null>(null);
  const actual = importe !== undefined ? Math.round(importe * tweak.escala * 100) / 100 : undefined;
  const setMeses = (meses: number) => onChange({ meses: Math.max(-MAX_MESES, Math.min(MAX_MESES, meses)) });
  const step = (dir: 1 | -1) => {
    setDraft(null);
    if (actual === undefined) {
      onChange({ escala: Math.max(0.05, Math.round((tweak.escala + dir * 0.05) * 20) / 20) });
      return;
    }
    const size = actual < 50 ? 1 : actual < 500 ? 5 : 10;
    const next = niceAmount(actual + dir * size);
    onChange({ escala: next / importe! });
  };

  const cellAt = (clientX: number) => {
    const rect = strip.current!.getBoundingClientRect();
    return Math.max(0, Math.min(MESES_TIRA - 1, Math.floor(((clientX - rect.left) / rect.width) * MESES_TIRA)));
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { x: e.clientX, meses: tweak.meses, moved: false };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const width = strip.current!.getBoundingClientRect().width / MESES_TIRA;
    const delta = Math.round((e.clientX - d.x) / width);
    if (delta !== 0) d.moved = true;
    if (d.moved) setMeses(d.meses + delta);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.moved) return;
    // Un toque en un mes: el primer pago que se ve pasa a ese mes
    const target = months[cellAt(e.clientX)];
    const firstPay = months.find(m => pays(m, tweak.meses));
    if (firstPay !== undefined) setMeses(tweak.meses + target - firstPay);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const keys: Record<string, number> = { ArrowLeft: tweak.meses - 1, ArrowDown: tweak.meses - 1, ArrowRight: tweak.meses + 1, ArrowUp: tweak.meses + 1, Home: 0 };
    if (!(e.key in keys)) return;
    e.preventDefault();
    setMeses(keys[e.key]);
  };

  const fin = bubble.partidas.length === 1 && bubble.partidas[0].fechaFin;

  return (
    <div className="budget-scenario__tweak" role="group" aria-label={`Retocar ${bubble.titulo}`}>
      <div className="budget-scenario__tweak-header">
        <h4 className="budget-scenario__tweak-title">{bubble.titulo}</h4>
        <button type="button" className="budget-scenario__icon-button" onClick={onClose} aria-label="Cerrar el retoque" title="Cerrar">
          <CloseIcon />
        </button>
      </div>

      <div className="budget-scenario__tweak-row">
        <span className="budget-scenario__tweak-label" id={`importe-${bubble.id}`}>
          {actual === undefined ? 'Importes' : 'Importe'}
        </span>
        <div className="budget-scenario__stepper">
          <button type="button" className="budget-scenario__step" onClick={() => step(-1)} aria-label="Menos">−</button>
          {actual === undefined ? (
            <span className="budget-scenario__step-value" aria-labelledby={`importe-${bubble.id}`}>
              {tweak.escala === 1 ? 'Igual' : `${tweak.escala > 1 ? '+' : '−'}${Math.round(Math.abs(tweak.escala - 1) * 100)} %`}
            </span>
          ) : (
            <span className="budget-scenario__amount">
              <input
                className="budget-scenario__input"
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                aria-labelledby={`importe-${bubble.id}`}
                value={draft ?? String(actual)}
                onChange={e => {
                  setDraft(e.target.value);
                  const value = Number(e.target.value.replace(',', '.'));
                  if (value > 0 && value / importe! <= 10) onChange({ escala: value / importe! });
                }}
                onBlur={() => setDraft(null)}
              />
              <span className="budget-scenario__currency" aria-hidden="true">€</span>
            </span>
          )}
          <button type="button" className="budget-scenario__step" onClick={() => step(1)} aria-label="Más">+</button>
        </div>
      </div>
      {tweak.escala !== 1 && importe !== undefined && (
        <p className="budget-scenario__text">Ahora: {formatEuros(importe)}</p>
      )}

      <div className="budget-scenario__tweak-row budget-scenario__tweak-row--column">
        <span className="budget-scenario__tweak-label">Cuándo toca</span>
        {moves || tweak.meses !== 0 ? (
          <>
            <div
              ref={strip}
              className="budget-scenario__months"
              role="slider"
              tabIndex={0}
              aria-label="Mover sus fechas"
              aria-valuemin={-MAX_MESES}
              aria-valuemax={MAX_MESES}
              aria-valuenow={tweak.meses}
              aria-valuetext={monthsLabel(tweak.meses)}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={() => { drag.current = null; }}
              onKeyDown={onKeyDown}
            >
              {months.map(m => {
                const now = pays(m, tweak.meses);
                const before = tweak.meses !== 0 && pays(m, 0);
                return (
                  <span key={m} className="budget-scenario__month">
                    <span
                      className={[
                        'budget-scenario__dot',
                        now ? 'budget-scenario__dot--on' : '',
                        !now && before ? 'budget-scenario__dot--before' : ''
                      ].filter(Boolean).join(' ')}
                    />
                    <span className="budget-scenario__month-name">{monthName(m)}</span>
                  </span>
                );
              })}
            </div>
            <p className="budget-scenario__text">
              {tweak.meses === 0 ? 'En sus fechas. Arrastra los puntos (o toca un mes) para moverla.' : `${monthsLabel(tweak.meses)[0].toUpperCase()}${monthsLabel(tweak.meses).slice(1)}.`}
              {fin ? ` Último pago: ${formatShortDate(shiftMonths(fin, tweak.meses))} ${shiftMonths(fin, tweak.meses).slice(0, 4)}.` : ''}
            </p>
          </>
        ) : (
          <p className="budget-scenario__text">Se paga todos los meses y no tiene fin: moverla no cambiaría nada.</p>
        )}
      </div>

      <div className="budget-scenario__actions">
        <button
          type="button"
          className="budget-scenario__button budget-scenario__button--secondary"
          onClick={() => onChange(SIN_RETOQUE)}
          disabled={!isTweaked(tweak)}
        >
          Como estaba
        </button>
        <button type="button" className="budget-scenario__button budget-scenario__button--secondary" onClick={onRemove}>
          {bubble.simulada ? 'Descartarla' : 'Quitar del ensayo'}
        </button>
      </div>
    </div>
  );
};

// ---------- Resultado ----------

interface ScoreProps {
  before: ReturnType<typeof stats>;
  after: ReturnType<typeof stats>;
  changed: boolean;
}

// Las cifras del ensayo, pegadas a las pelotitas y fijas arriba al desplazarse por el tablero
const Score: React.FC<ScoreProps> = ({ before, after, changed }) => {
  const diff = Math.round((after.media - before.media) * 100) / 100;
  return (
    <div className="budget-scenario__score" aria-live="polite">
      <p className="budget-scenario__score-main">
        <span className="budget-scenario__score-label">Para gastar cada ciclo{changed ? ', con el ensayo' : ''}</span>
        <span className={`budget-scenario__score-amount ${after.media < 0 ? 'budget-scenario__score-amount--negative' : ''}`}>
          {signed(after.media)}
        </span>
      </p>
      <p className="budget-scenario__score-side">
        {changed ? (
          <>
            <span className={`budget-scenario__delta budget-scenario__delta--${diff > 0 ? 'up' : diff < 0 ? 'down' : 'same'}`}>
              {diff === 0 ? 'Igual que ahora' : `${diff > 0 ? '+' : '−'}${formatEuros(Math.abs(diff))} cada ciclo`}
            </span>
            <span className="budget-scenario__score-detail">Ahora: {signed(before.media)}</span>
          </>
        ) : (
          <span className="budget-scenario__score-detail">Media del próximo año</span>
        )}
        {after.peor && (
          <span className={`budget-scenario__score-detail ${after.negativos > 0 ? 'budget-scenario__score-detail--negative' : ''}`}>
            {after.negativos > 0
              ? `${after.negativos} ${after.negativos === 1 ? 'ciclo' : 'ciclos'} en negativo`
              : `Más justo: ${formatShortDate(after.peor.inicio)} · ${signed(after.peor.disponible)}`}
          </span>
        )}
      </p>
    </div>
  );
};

interface OutcomeProps {
  base: IBudgetForecast;
  shown: IBudgetForecast;
  changed: boolean;
}

const CHART_HEIGHT = 120;

const Outcome: React.FC<OutcomeProps> = ({ base, shown, changed }) => {
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
