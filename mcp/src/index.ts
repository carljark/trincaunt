#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createApiClient, DEFAULT_URL } from './api.js';
import { createServer } from './server.js';

// Servidor MCP de Trincaunt por stdio. Configuración por variables de entorno:
//   TRINCAUNT_TOKEN  token de API (Preferencias → Acceso para asistentes). Si no está,
//                    se lee de ~/.config/trincaunt/token (un único sitio para todos los clientes).
//   TRINCAUNT_URL    por defecto https://trincaunt.ddns.net

const TOKEN_FILE = join(homedir(), '.config', 'trincaunt', 'token');

const readTokenFile = () => {
  try {
    return readFileSync(TOKEN_FILE, 'utf8').trim();
  } catch {
    return undefined;
  }
};

const token = process.env.TRINCAUNT_TOKEN?.trim() || readTokenFile();
if (!token) {
  console.error(
    `Falta el token. Crea uno en Trincaunt → Preferencias → Acceso para asistentes (MCP) y ponlo en ${TOKEN_FILE} ` +
    'o en la variable TRINCAUNT_TOKEN.'
  );
  process.exit(1);
}
if (!token.startsWith('trc_')) {
  console.error('El token no parece un token de API de Trincaunt (empiezan por trc_).');
  process.exit(1);
}

const url = process.env.TRINCAUNT_URL?.trim() || DEFAULT_URL;
const server = createServer(createApiClient(url, token));
await server.connect(new StdioServerTransport());
// stdout es el canal MCP: los mensajes para humanos van a stderr
console.error(`Trincaunt MCP conectado a ${url}`);
