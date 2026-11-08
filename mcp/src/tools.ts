import { z } from 'zod';
import type { ApiClient } from './api.js';

// Herramientas del servidor MCP. Cada una es una llamada (o unas pocas) a la API de
// Trincaunt; las respuestas se recortan a lo útil para que no llenen el contexto.

type Shape = z.ZodRawShape;

export interface ToolDef<S extends Shape = Shape> {
  name: string;
  title: string;
  description: string;
  input: S;
  kind: 'read' | 'write' | 'delete';
  run: (api: ApiClient, args: z.infer<z.ZodObject<S>>) => Promise<unknown>;
}

const tool = <S extends Shape>(def: ToolDef<S>): ToolDef => def as unknown as ToolDef;

// ---------- Tipos de la API (solo lo que se usa) ----------

interface Member { _id: string; nombre: string; email?: string }
interface Group {
  _id: string;
  nombre: string;
  tipo?: 'compartido' | 'personal';
  miembros: (Member | string)[];
  creado_por?: string | Member;
  presupuesto?: unknown;
}
interface Expense {
  _id: string;
  grupo_id: string | { _id: string };
  descripcion: string;
  monto: number;
  fecha: string;
  categoria?: string[];
  localization?: string;
  pagado_por: (string | Member)[];
  participantes: (string | Member)[];
  asume_gasto?: boolean;
  recurrente_id?: string;
}

// ---------- Utilidades ----------

const id = z.string().regex(/^[a-f0-9]{24}$/i, 'Identificador de 24 caracteres hexadecimales');
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha AAAA-MM-DD');
const amount = z.number().positive().describe('Importe en euros, mayor que 0');
const categories = z.array(z.string().min(1)).describe('Categorías, p. ej. ["Comida", "Restaurantes"]');

const idOf = (v: string | { _id: string }) => (typeof v === 'string' ? v : String(v._id));
const day = (iso: string) => iso.slice(0, 10);
const round2 = (n: number) => Math.round(n * 100) / 100;

const memberNames = (group: Group) =>
  new Map(group.miembros.filter((m): m is Member => typeof m !== 'string').map(m => [String(m._id), m.nombre]));

const summarizeGroup = (g: Group) => ({
  id: g._id,
  nombre: g.nombre,
  tipo: g.tipo ?? 'compartido',
  miembros: g.miembros.map(m => (typeof m === 'string' ? { id: m } : { id: String(m._id), nombre: m.nombre }))
});

const creatorOf = (g: Group) =>
  typeof g.creado_por === 'object' ? { id: String(g.creado_por._id), nombre: g.creado_por.nombre } : g.creado_por;

const summarizeExpense = (e: Expense, names: Map<string, string>) => {
  const person = (p: string | Member) => {
    const pid = idOf(p);
    return names.get(pid) ?? (typeof p === 'string' ? pid : p.nombre ?? pid);
  };
  return {
    id: e._id,
    fecha: day(e.fecha),
    descripcion: e.descripcion,
    monto: e.monto,
    categoria: e.categoria ?? [],
    ...(e.localization ? { lugar: e.localization } : {}),
    pagado_por: e.pagado_por.map(person),
    participantes: e.participantes.map(person),
    ...(e.asume_gasto ? { asume_gasto: true } : {}),
    ...(e.recurrente_id ? { factura_recurrente: true } : {})
  };
};

const normalize = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

// Quita los undefined: la API distingue "no tocar" de "poner a null"
const defined = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

// ---------- Herramientas ----------

export const tools: ToolDef[] = [
  tool({
    name: 'whoami',
    title: 'Quién soy',
    description:
      'Usuario de Trincaunt al que pertenece el token: id, nombre, email, rol (user o admin) y si el token permite ' +
      'administración (tokenAdmin). Las herramientas de administración necesitan rol admin y tokenAdmin.',
    input: {},
    kind: 'read',
    run: api => api.get('/users/me')
  }),

  tool({
    name: 'list_groups',
    title: 'Listar grupos',
    description: 'Tus grupos: id, nombre, tipo (compartido, o personal = presupuesto personal) y miembros con su id.',
    input: {},
    kind: 'read',
    run: async api => (await api.get<Group[]>('/groups')).map(summarizeGroup)
  }),

  tool({
    name: 'get_group',
    title: 'Ver grupo',
    description: 'Detalle de un grupo: miembros (id y nombre) y, si es personal, la configuración del presupuesto.',
    input: { groupId: id },
    kind: 'read',
    run: async (api, { groupId }) => {
      const g = await api.get<Group>(`/groups/${groupId}`);
      return { ...summarizeGroup(g), creado_por: creatorOf(g), ...(g.tipo === 'personal' ? { presupuesto: g.presupuesto } : {}) };
    }
  }),

  tool({
    name: 'create_group',
    title: 'Crear grupo',
    description:
      'Crea un grupo del que eres creador y único miembro. "compartido" para gastos entre varias personas (añade ' +
      'miembros con add_group_member); "personal" para llevar tu presupuesto.',
    input: {
      nombre: z.string().min(1),
      tipo: z.enum(['compartido', 'personal']).default('compartido'),
      descripcion: z.string().optional()
    },
    kind: 'write',
    run: async (api, data) => summarizeGroup(await api.post<Group>('/groups', defined(data)))
  }),

  tool({
    name: 'update_group',
    title: 'Editar grupo',
    description: 'Cambia el nombre o el tipo de un grupo. Solo el creador. Un grupo solo puede ser personal si tiene un único miembro.',
    input: {
      groupId: id,
      nombre: z.string().min(1).optional(),
      tipo: z.enum(['compartido', 'personal']).optional()
    },
    kind: 'write',
    run: async (api, { groupId, ...data }) => summarizeGroup(await api.put<Group>(`/groups/${groupId}`, defined(data)))
  }),

  tool({
    name: 'add_group_member',
    title: 'Añadir miembro',
    description:
      'Añade a un grupo compartido a un usuario ya registrado, por su email. Puede hacerlo cualquier miembro (o un ' +
      'administrador en cualquier grupo). Si la persona no tiene cuenta, un administrador puede crearla con create_user.',
    input: { groupId: id, email: z.string().email() },
    kind: 'write',
    run: async (api, { groupId, email }) => summarizeGroup(await api.post<Group>(`/groups/${groupId}/members`, { email }))
  }),

  tool({
    name: 'remove_group_member',
    title: 'Quitar miembro',
    description:
      'Quita a un miembro de un grupo (userId de get_group). Uno mismo puede salirse; a otros los quita el creador del ' +
      'grupo o un administrador. Sus gastos se quedan en el grupo. Si era el último miembro, el grupo se borra con todos ' +
      'sus datos.',
    input: { groupId: id, userId: id },
    kind: 'delete',
    run: async (api, { groupId, userId }) => {
      await api.delete(`/groups/${groupId}/members/${userId}`);
      return { quitado: userId, grupo: groupId };
    }
  }),

  tool({
    name: 'list_expenses',
    title: 'Listar gastos',
    description:
      'Gastos de un grupo, del más reciente al más antiguo, con filtros opcionales. Devuelve también cuántos hay y la suma ' +
      'de los filtrados. La categoría incluye sus alias.',
    input: {
      groupId: id,
      desde: ymd.optional().describe('Desde esta fecha, incluida (AAAA-MM-DD)'),
      hasta: ymd.optional().describe('Hasta esta fecha, incluida (AAAA-MM-DD)'),
      categoria: z.string().optional().describe('Solo esta categoría (o sus alias)'),
      texto: z.string().optional().describe('Busca en la descripción y el lugar, sin distinguir tildes ni mayúsculas'),
      limite: z.number().int().min(1).max(500).default(50).describe('Máximo de gastos a devolver (por defecto 50)')
    },
    kind: 'read',
    run: async (api, { groupId, desde, hasta, categoria, texto, limite }) => {
      const query = categoria ? `?category=${encodeURIComponent(categoria)}` : '';
      const [group, expenses] = await Promise.all([
        api.get<Group>(`/groups/${groupId}`),
        api.get<Expense[]>(`/groups/${groupId}/expenses${query}`)
      ]);
      const needle = texto ? normalize(texto) : null;
      const filtered = expenses
        .filter(e => (!desde || day(e.fecha) >= desde) && (!hasta || day(e.fecha) <= hasta))
        .filter(e => !needle || normalize(`${e.descripcion} ${e.localization ?? ''}`).includes(needle))
        .sort((a, b) => b.fecha.localeCompare(a.fecha));
      const names = memberNames(group);
      return {
        total: filtered.length,
        suma: round2(filtered.reduce((acc, e) => acc + e.monto, 0)),
        mostrados: Math.min(limite, filtered.length),
        gastos: filtered.slice(0, limite).map(e => summarizeExpense(e, names))
      };
    }
  }),

  tool({
    name: 'create_expense',
    title: 'Apuntar gasto',
    description:
      'Apunta un gasto en un grupo. Por defecto lo pagas tú y se reparte entre todos los miembros; usa get_group para ' +
      'ver los ids de los miembros si paga otro o participan solo algunos.',
    input: {
      groupId: id,
      descripcion: z.string().min(1),
      monto: amount,
      fecha: ymd.optional().describe('Fecha del gasto (por defecto, hoy)'),
      categoria: categories.optional(),
      lugar: z.string().optional().describe('Lugar o comercio'),
      pagado_por: z.array(id).min(1).optional().describe('Ids de quienes pagan (por defecto, tú)'),
      participantes: z.array(id).min(1).optional().describe('Ids de quienes lo comparten (por defecto, todos)'),
      asume_gasto: z.boolean().optional().describe('Quien paga asume el gasto entero: no se reparte')
    },
    kind: 'write',
    run: async (api, a) => {
      const created = await api.post<Expense>('/expenses', defined({
        grupo_id: a.groupId,
        descripcion: a.descripcion,
        monto: a.monto,
        fecha: a.fecha,
        categoria: a.categoria,
        localization: a.lugar,
        pagado_por: a.pagado_por,
        participantes: a.participantes,
        assumeExpense: a.asume_gasto
      }));
      return summarizeExpense(created, new Map());
    }
  }),

  tool({
    name: 'update_expense',
    title: 'Editar gasto',
    description: 'Cambia campos de un gasto. Solo se tocan los que pases.',
    input: {
      expenseId: id,
      descripcion: z.string().min(1).optional(),
      monto: amount.optional(),
      fecha: ymd.optional(),
      categoria: categories.optional(),
      lugar: z.string().optional(),
      pagado_por: z.array(id).min(1).optional(),
      participantes: z.array(id).min(1).optional()
    },
    kind: 'write',
    run: async (api, { expenseId, lugar, ...rest }) => {
      const updated = await api.put<Expense>(`/expenses/${expenseId}`, defined({ ...rest, localization: lugar }));
      return summarizeExpense(updated, new Map());
    }
  }),

  tool({
    name: 'delete_expense',
    title: 'Borrar gasto',
    description: 'Borra un gasto. No se puede deshacer. Si era el pago de una factura fija, la factura vuelve a quedar pendiente.',
    input: { expenseId: id },
    kind: 'delete',
    run: async (api, { expenseId }) => {
      await api.delete(`/expenses/${expenseId}`);
      return { borrado: expenseId };
    }
  }),

  tool({
    name: 'get_balance',
    title: 'Saldos del grupo',
    description: 'Cuánto debe o le deben a cada miembro en un grupo compartido.',
    input: { groupId: id },
    kind: 'read',
    run: (api, { groupId }) => api.get(`/groups/${groupId}/balance`)
  }),

  tool({
    name: 'list_categories',
    title: 'Listar categorías',
    description: 'Categorías usadas en tus gastos con cuántas veces aparecen, de un grupo o de todos tus grupos.',
    input: { groupId: id.optional() },
    kind: 'read',
    run: (api, { groupId }) => api.get(`/expenses/categories${groupId ? `?groupId=${groupId}` : ''}`)
  }),

  // ---------- Presupuesto (grupos personales) ----------

  tool({
    name: 'get_budget',
    title: 'Ver presupuesto',
    description:
      'Resumen del presupuesto de un grupo personal para un ciclo (de cobro a cobro): ingresos, facturas, ahorro, lo ' +
      'gastado, lo disponible, cuánto puedes gastar al día y a la semana, el ritmo, los límites por categoría y las huchas ' +
      '(reservas de facturas prorrateadas; deHucha en una factura es la parte que se paga con lo apartado).',
    input: {
      groupId: id,
      offset: z.number().int().min(-120).max(120).default(0).describe('0 = ciclo actual, -1 = el anterior, 1 = el siguiente')
    },
    kind: 'read',
    run: (api, { groupId, offset }) => api.get(`/groups/${groupId}/budget?offset=${offset}`)
  }),

  tool({
    name: 'get_budget_history',
    title: 'Histórico del presupuesto',
    description: 'Lo cobrado, pagado, gastado y lo que sobró en cada uno de los últimos ciclos, y la media de lo que sobra.',
    input: { groupId: id, ciclos: z.number().int().min(1).max(12).default(6) },
    kind: 'read',
    run: (api, { groupId, ciclos }) => api.get(`/groups/${groupId}/budget/history?ciclos=${ciclos}`)
  }),

  tool({
    name: 'get_budget_forecast',
    title: 'Previsión del presupuesto',
    description:
      'El ciclo actual y los siguientes según las partidas fijas: ingresos, facturas y lo que quedará para gastar en ' +
      'cada uno, con las facturas que tienen fecha de fin (préstamos, aplazamientos) y si es su última cuota.',
    input: { groupId: id, ciclos: z.number().int().min(1).max(13).default(13) },
    kind: 'read',
    run: (api, { groupId, ciclos }) => api.get(`/groups/${groupId}/budget/forecast?ciclos=${ciclos}`)
  }),

  tool({
    name: 'update_budget_settings',
    title: 'Configurar presupuesto',
    description:
      'Cambia la configuración del presupuesto de un grupo personal (solo quien lo creó). Solo se tocan los campos que ' +
      'pases; limitesCategoria sustituye la lista entera.',
    input: {
      groupId: id,
      diaInicioCiclo: z.number().int().min(1).max(31).optional().describe('Día del mes en que cobras: empieza el ciclo'),
      ahorroObjetivo: z.number().min(0).optional().describe('Ahorro que apartas cada ciclo, en euros'),
      incluirOtrosGrupos: z.boolean().optional().describe('Contar tu parte de los gastos de tus grupos compartidos'),
      avisos: z.boolean().optional().describe('Avisos push al 80 % y al 100 %'),
      limitesCategoria: z
        .array(z.object({ categoria: z.string().min(1), limite: amount }))
        .optional()
        .describe('Tope de gasto por ciclo para cada categoría')
    },
    kind: 'write',
    run: async (api, { groupId, ...presupuesto }) => {
      const g = await api.put<Group>(`/groups/${groupId}`, { presupuesto: defined(presupuesto) });
      return { id: g._id, presupuesto: g.presupuesto };
    }
  }),

  tool({
    name: 'list_recurring_items',
    title: 'Listar partidas fijas',
    description: 'Ingresos y facturas fijas (nómina, alquiler, luz…) de un grupo personal.',
    input: { groupId: id },
    kind: 'read',
    run: (api, { groupId }) => api.get(`/groups/${groupId}/recurring-items`)
  }),

  tool({
    name: 'create_recurring_item',
    title: 'Crear partida fija',
    description: 'Añade un ingreso o una factura fija a un grupo personal.',
    input: {
      groupId: id,
      tipo: z.enum(['ingreso', 'factura']),
      nombre: z.string().min(1),
      importe: amount.describe('Importe estimado en euros'),
      frecuencia: z.enum(['mensual', 'bimestral', 'trimestral', 'semestral', 'anual']).default('mensual'),
      fechaInicio: ymd.describe('Primera fecha en que toca (el día del mes se repite)'),
      fechaFin: ymd.optional(),
      categoria: categories.optional(),
      prorratear: z.boolean().optional().describe('Factura no mensual, o mensual con fechaFin (cuotas de un aplazamiento): apartar cada ciclo una parte en una hucha y pagarla de ahí'),
      prorrateoDesde: ymd.optional().describe('Con prorratear: desde cuándo empieza a apartar (hoy o después; por defecto hoy)')
    },
    kind: 'write',
    run: (api, { groupId, ...data }) => api.post(`/groups/${groupId}/recurring-items`, defined(data))
  }),

  tool({
    name: 'update_recurring_item',
    title: 'Editar partida fija',
    description: 'Cambia una partida fija. Solo se tocan los campos que pases; fechaFin null quita la fecha de fin.',
    input: {
      itemId: id,
      nombre: z.string().min(1).optional(),
      importe: amount.optional(),
      frecuencia: z.enum(['mensual', 'bimestral', 'trimestral', 'semestral', 'anual']).optional(),
      fechaInicio: ymd.optional(),
      fechaFin: ymd.nullable().optional(),
      categoria: categories.optional(),
      activo: z.boolean().optional().describe('false la desactiva sin borrarla'),
      prorratear: z.boolean().optional().describe('Factura no mensual, o mensual con fechaFin (cuotas de un aplazamiento): apartar cada ciclo una parte en una hucha y pagarla de ahí'),
      prorrateoDesde: ymd.nullable().optional().describe('Con hucha: desde cuándo empieza a apartar (no pasada); null la vuelve a hoy')
    },
    kind: 'write',
    run: (api, { itemId, ...data }) => api.put(`/recurring-items/${itemId}`, defined(data))
  }),

  tool({
    name: 'delete_recurring_item',
    title: 'Borrar partida fija',
    description: 'Borra una partida fija. Los gastos e ingresos ya confirmados se quedan. No se puede deshacer.',
    input: { itemId: id },
    kind: 'delete',
    run: async (api, { itemId }) => {
      await api.delete(`/recurring-items/${itemId}`);
      return { borrado: itemId };
    }
  }),

  tool({
    name: 'confirm_recurring_item',
    title: 'Pagar factura o cobrar ingreso',
    description:
      'Marca una factura fija como pagada (crea el gasto) o un ingreso fijo como cobrado (crea el ingreso). Si no pasas ' +
      'monto, se usa el estimado; sin fecha, hoy.',
    input: { itemId: id, monto: amount.optional(), fecha: ymd.optional() },
    kind: 'write',
    run: (api, { itemId, ...data }) => api.post(`/recurring-items/${itemId}/confirm`, defined(data))
  }),

  tool({
    name: 'list_incomes',
    title: 'Listar ingresos',
    description: 'Ingresos cobrados de un grupo personal, del más reciente al más antiguo.',
    input: { groupId: id, limite: z.number().int().min(1).max(500).default(50) },
    kind: 'read',
    run: async (api, { groupId, limite }) => {
      const incomes = await api.get<{ fecha: string }[]>(`/groups/${groupId}/incomes`);
      return { total: incomes.length, ingresos: incomes.slice(0, limite) };
    }
  }),

  tool({
    name: 'create_income',
    title: 'Apuntar ingreso',
    description: 'Apunta un ingreso suelto (un trabajo extra, un reembolso…) en un grupo personal.',
    input: { groupId: id, descripcion: z.string().min(1), monto: amount, fecha: ymd },
    kind: 'write',
    run: (api, { groupId, ...data }) => api.post(`/groups/${groupId}/incomes`, data)
  }),

  tool({
    name: 'update_income',
    title: 'Editar ingreso',
    description: 'Cambia un ingreso. Solo se tocan los campos que pases.',
    input: { incomeId: id, descripcion: z.string().min(1).optional(), monto: amount.optional(), fecha: ymd.optional() },
    kind: 'write',
    run: (api, { incomeId, ...data }) => api.put(`/incomes/${incomeId}`, defined(data))
  }),

  tool({
    name: 'delete_income',
    title: 'Borrar ingreso',
    description: 'Borra un ingreso. Si era el cobro de un ingreso fijo, vuelve a quedar como previsto. No se puede deshacer.',
    input: { incomeId: id },
    kind: 'delete',
    run: async (api, { incomeId }) => {
      await api.delete(`/incomes/${incomeId}`);
      return { borrado: incomeId };
    }
  }),

  // ---------- Administración: rol admin y token creado con «Permite administración» ----------

  tool({
    name: 'list_users',
    title: 'Listar usuarios (admin)',
    description: 'Solo administradores. Todos los usuarios: id, nombre, email, rol y si tienen la IA activada.',
    input: {},
    kind: 'read',
    run: api => api.get('/users/admin/all')
  }),

  tool({
    name: 'create_user',
    title: 'Crear usuario (admin)',
    description:
      'Solo administradores. Crea una cuenta con una contraseña generada, que se devuelve solo esta vez: dásela al ' +
      'usuario para que entre y la cambie en Preferencias. No la guardes en ningún sitio.',
    input: { nombre: z.string().min(2), email: z.string().email() },
    kind: 'write',
    run: (api, data) => api.post('/users/admin', data)
  }),

  tool({
    name: 'set_user_role',
    title: 'Cambiar rol (admin)',
    description: 'Solo administradores. Hace administrador a otro usuario (admin) o le quita el rol (user). No sirve para uno mismo.',
    input: { userId: id, rol: z.enum(['user', 'admin']) },
    kind: 'write',
    run: (api, { userId, rol }) => api.patch(`/users/admin/${userId}/role`, { role: rol })
  }),

  tool({
    name: 'set_user_ai',
    title: 'Activar IA (admin)',
    description: 'Solo administradores. Activa o desactiva a un usuario las funciones de IA (apuntar gastos por texto, foto o voz).',
    input: { userId: id, activada: z.boolean() },
    kind: 'write',
    run: (api, { userId, activada }) => api.patch(`/users/admin/${userId}/ai`, { aiEnabled: activada })
  }),

  tool({
    name: 'list_all_groups',
    title: 'Listar todos los grupos (admin)',
    description:
      'Solo administradores. Todos los grupos de la aplicación con sus miembros y creador, también aquellos de los que ' +
      'no eres miembro. Un administrador puede verlos (get_group) y añadir o quitar miembros, pero no ver sus gastos.',
    input: {},
    kind: 'read',
    run: async api => {
      const groups = await api.get<Group[]>('/admin/groups');
      return groups.map(g => ({ ...summarizeGroup(g), creado_por: creatorOf(g) }));
    }
  })
];
