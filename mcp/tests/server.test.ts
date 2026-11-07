import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createApiClient } from '../src/api.js';
import { createServer } from '../src/server.js';

const G = 'a'.repeat(24);
const ME = 'b'.repeat(24);
const ANA = 'c'.repeat(24);
const E1 = 'd'.repeat(24);

const group = {
  _id: G, nombre: 'Piso', tipo: 'compartido', creado_por: ME,
  miembros: [{ _id: ME, nombre: 'Carlos' }, { _id: ANA, nombre: 'Ana' }]
};
const expenses = [
  { _id: E1, grupo_id: G, descripcion: 'Súper Mercadona', monto: 45.5, fecha: '2026-11-03T00:00:00.000Z', categoria: ['Comida'], pagado_por: [ME], participantes: [ME, ANA] },
  { _id: 'e'.repeat(24), grupo_id: G, descripcion: 'Luz', monto: 60, fecha: '2026-10-20T00:00:00.000Z', categoria: ['Hogar'], pagado_por: [ANA], participantes: [ME, ANA] },
  { _id: 'f'.repeat(24), grupo_id: G, descripcion: 'Cena', monto: 30, fecha: '2026-11-05T19:00:00.000Z', categoria: ['Ocio'], localization: 'Café Mercado', pagado_por: [ME], participantes: [ME], asume_gasto: true }
];

type Call = { method: string; url: string; body?: unknown; auth?: string };

describe('Trincaunt MCP server', () => {
  let calls: Call[];
  let client: Client;
  let responder: (call: Call) => { status: number; body?: unknown };

  beforeEach(async () => {
    calls = [];
    responder = ({ method, url }) => {
      if (method === 'GET' && url.endsWith(`/groups/${G}`)) return { status: 200, body: { data: group } };
      if (method === 'GET' && url.endsWith(`/groups/${G}/expenses`)) return { status: 200, body: { data: expenses } };
      if (method === 'POST' && url.endsWith('/expenses')) return { status: 201, body: { data: { _id: E1, ...(calls.at(-1)!.body as object), fecha: '2026-11-06T00:00:00.000Z', pagado_por: [ME], participantes: [ME, ANA] } } };
      if (method === 'DELETE') return { status: 204 };
      return { status: 404, body: { message: 'Ruta no encontrada' } };
    };
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      const call: Call = {
        method: init.method!, url, auth: (init.headers as Record<string, string>).Authorization,
        body: init.body ? JSON.parse(String(init.body)) : undefined
      };
      calls.push(call);
      const { status, body } = responder(call);
      return { ok: status < 400, status, json: async () => body } as Response;
    });

    const server = createServer(createApiClient('https://trincaunt.test/', 'trc_secret', fetchMock as unknown as typeof fetch));
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: 'test', version: '1.0.0' });
    await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  });

  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const result = await client.callTool({ name, arguments: args });
    const text = (result.content as { text: string }[])[0].text;
    return { isError: result.isError === true, text, json: () => JSON.parse(text) };
  };

  it('exposes the tools with read/destructive hints', async () => {
    const { tools } = await client.listTools();
    const byName = new Map(tools.map(t => [t.name, t]));
    expect(byName.size).toBe(30);
    expect(byName.get('remove_group_member')!.annotations).toMatchObject({ destructiveHint: true });
    expect(byName.get('list_users')!.annotations).toMatchObject({ readOnlyHint: true });
    expect(byName.get('list_expenses')!.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
    expect(byName.get('create_expense')!.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false });
    expect(byName.get('delete_expense')!.annotations).toMatchObject({ destructiveHint: true });
    expect(byName.get('create_expense')!.inputSchema.required).toEqual(['groupId', 'descripcion', 'monto']);
  });

  it('lists expenses newest first with filters, names and totals', async () => {
    const all = (await call('list_expenses', { groupId: G })).json();
    expect(all.total).toBe(3);
    expect(all.suma).toBe(135.5);
    expect(all.gastos.map((g: { fecha: string }) => g.fecha)).toEqual(['2026-11-05', '2026-11-03', '2026-10-20']);
    expect(all.gastos[1]).toEqual({
      id: E1, fecha: '2026-11-03', descripcion: 'Súper Mercadona', monto: 45.5, categoria: ['Comida'],
      pagado_por: ['Carlos'], participantes: ['Carlos', 'Ana']
    });
    expect(all.gastos[0]).toMatchObject({ lugar: 'Café Mercado', asume_gasto: true });
    expect(calls[0].auth).toBe('Bearer trc_secret');
    expect(calls.map(c => c.url)).toContain(`https://trincaunt.test/api/v1/groups/${G}/expenses`);

    const filtered = (await call('list_expenses', { groupId: G, desde: '2026-11-01', texto: 'MERCADO', limite: 1 })).json();
    expect(filtered).toMatchObject({ total: 2, suma: 75.5, mostrados: 1 });
    expect(filtered.gastos[0].descripcion).toBe('Cena');

    await call('list_expenses', { groupId: G, categoria: 'Comida y bebida' });
    expect(calls.at(-1)!.url).toMatch(/\/expenses\?category=Comida%20y%20bebida$/);
  });

  it('creates an expense mapping the fields to the API names', async () => {
    const result = await call('create_expense', {
      groupId: G, descripcion: 'Pizza', monto: 12.5, categoria: ['Comida'], lugar: 'Napoli', asume_gasto: true
    });
    expect(calls.at(-1)).toMatchObject({
      method: 'POST',
      body: { grupo_id: G, descripcion: 'Pizza', monto: 12.5, categoria: ['Comida'], localization: 'Napoli', assumeExpense: true }
    });
    expect(result.json()).toMatchObject({ id: E1, descripcion: 'Pizza', fecha: '2026-11-06' });
  });

  it('validates arguments before calling the API', async () => {
    const result = await call('create_expense', { groupId: 'nope', descripcion: 'x', monto: -3 });
    expect(result.isError).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it('deletes and reports API errors as tool errors', async () => {
    expect((await call('delete_expense', { expenseId: E1 })).json()).toEqual({ borrado: E1 });
    expect(calls.at(-1)).toMatchObject({ method: 'DELETE', url: `https://trincaunt.test/api/v1/expenses/${E1}` });

    responder = () => ({ status: 401, body: { message: 'Token de API no válido o borrado.' } });
    const failed = await call('list_groups');
    expect(failed.isError).toBe(true);
    expect(failed.text).toContain('Revisa TRINCAUNT_TOKEN');
  });

  it('sends only the budget settings that were given', async () => {
    responder = () => ({ status: 200, body: { data: { _id: G, presupuesto: { ahorroObjetivo: 300 } } } });
    await call('update_budget_settings', { groupId: G, ahorroObjetivo: 300 });
    expect(calls.at(-1)).toMatchObject({ method: 'PUT', body: { presupuesto: { ahorroObjetivo: 300 } } });

    await call('get_budget', { groupId: G });
    expect(calls.at(-1)!.url).toMatch(/\/budget\?offset=0$/);
  });

  it('creates groups and manages their members', async () => {
    responder = ({ method, body }) => method === 'DELETE'
      ? { status: 204 }
      : { status: 200, body: { data: { _id: G, nombre: (body as { nombre?: string })?.nombre ?? 'Piso', tipo: 'compartido', miembros: [ME] } } };

    expect((await call('create_group', { nombre: 'Viaje' })).json()).toEqual({ id: G, nombre: 'Viaje', tipo: 'compartido', miembros: [{ id: ME }] });
    expect(calls.at(-1)).toMatchObject({ method: 'POST', url: 'https://trincaunt.test/api/v1/groups', body: { nombre: 'Viaje', tipo: 'compartido' } });

    await call('add_group_member', { groupId: G, email: 'ana@example.com' });
    expect(calls.at(-1)).toMatchObject({ method: 'POST', url: `https://trincaunt.test/api/v1/groups/${G}/members`, body: { email: 'ana@example.com' } });

    expect((await call('remove_group_member', { groupId: G, userId: ANA })).json()).toEqual({ quitado: ANA, grupo: G });
    expect(calls.at(-1)).toMatchObject({ method: 'DELETE', url: `https://trincaunt.test/api/v1/groups/${G}/members/${ANA}` });
  });

  it('calls the administration routes and passes their refusals on', async () => {
    responder = () => ({ status: 201, body: { data: { user: { _id: ANA, nombre: 'Ana' }, password: 'Generated-Pass-16' } } });
    expect((await call('create_user', { nombre: 'Ana', email: 'ana@example.com' })).json()).toMatchObject({ password: 'Generated-Pass-16' });
    expect(calls.at(-1)).toMatchObject({ method: 'POST', url: 'https://trincaunt.test/api/v1/users/admin' });

    responder = () => ({ status: 200, body: { data: {} } });
    await call('set_user_role', { userId: ANA, rol: 'admin' });
    expect(calls.at(-1)).toMatchObject({ method: 'PATCH', url: `https://trincaunt.test/api/v1/users/admin/${ANA}/role`, body: { role: 'admin' } });
    await call('set_user_ai', { userId: ANA, activada: true });
    expect(calls.at(-1)).toMatchObject({ method: 'PATCH', body: { aiEnabled: true } });

    responder = () => ({ status: 200, body: { data: [{ ...group, creado_por: { _id: ME, nombre: 'Carlos' } }] } });
    expect((await call('list_all_groups')).json()[0].creado_por).toEqual({ id: ME, nombre: 'Carlos' });

    responder = () => ({ status: 403, body: { message: 'Este token de API no permite administración.' } });
    const refused = await call('list_users');
    expect(refused.isError).toBe(true);
    expect(refused.text).toContain('no permite administración');
  });
});
