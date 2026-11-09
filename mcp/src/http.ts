import type { IncomingMessage, ServerResponse } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createApiClient } from './api.js';
import { createServer } from './server.js';

export interface HttpOptions {
  /** Raíz de la API de Trincaunt a la que llaman las herramientas (en el servidor, la propia API en local) */
  apiUrl: string;
  /** Token de API del usuario que hace la petición (ya comprobado por quien llama) */
  token: string;
}

/**
 * Atiende una petición MCP por HTTP (Streamable HTTP, sin sesión): cada petición crea su
 * servidor con las herramientas de siempre sobre la API, autenticado con el token del usuario.
 * Lo usa la API de Trincaunt para servir el conector remoto en /mcp.
 */
export const handleMcpRequest = async (
  req: IncomingMessage,
  res: ServerResponse,
  body: unknown,
  { apiUrl, token }: HttpOptions
): Promise<void> => {
  const server = createServer(createApiClient(apiUrl, token));
  // Respuestas JSON en vez de SSE: sin sesión no hace falta streaming y pasa mejor por nginx
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on('close', () => {
    void transport.close();
    void server.close();
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, body);
};
