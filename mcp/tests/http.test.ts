import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { handleMcpRequest } from '../src/http.js';

const listen = (server: http.Server) =>
  new Promise<string>(resolve => server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)));

describe('MCP por HTTP', () => {
  const seenAuth: string[] = [];
  // API falsa: lo que llaman las herramientas
  const api = http.createServer((req, res) => {
    seenAuth.push(String(req.headers.authorization));
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ data: [{ _id: 'a'.repeat(24), nombre: 'Gastos', tipo: 'personal', miembros: [] }] }));
  });
  // El servidor que hace de /mcp, como la API de Trincaunt
  let apiUrl = '';
  const mcp = http.createServer((req, res) => {
    let raw = '';
    req.on('data', chunk => { raw += chunk; });
    req.on('end', () => {
      void handleMcpRequest(req, res, raw ? JSON.parse(raw) : undefined, { apiUrl, token: 'trc_usuario' });
    });
  });
  let mcpUrl = '';

  beforeAll(async () => {
    apiUrl = await listen(api);
    mcpUrl = await listen(mcp);
  });

  afterAll(() => {
    api.close();
    mcp.close();
  });

  it('lists the tools and runs them with the user token', async () => {
    const client = new Client({ name: 'test', version: '1.0.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(mcpUrl)));

    const { tools } = await client.listTools();
    expect(tools.map(t => t.name)).toContain('get_budget_reminders');

    const result = await client.callTool({ name: 'list_groups', arguments: {} });
    expect(JSON.parse((result.content as { text: string }[])[0].text)).toEqual([
      expect.objectContaining({ id: 'a'.repeat(24), nombre: 'Gastos', tipo: 'personal' })
    ]);
    expect(seenAuth).toContain('Bearer trc_usuario');
    await client.close();
  });
});
