import path from 'path';
import { pathToFileURL } from 'url';
import type { IncomingMessage, ServerResponse } from 'http';

// El servidor MCP vive en el paquete mcp/ (ESM); la API es CommonJS. Se carga con un import()
// de verdad (TypeScript lo convertiría en require), desde mcp/dist: en el repo, ../../../mcp/dist
// desde api/src/services; en la imagen, /app/mcp/dist desde /app/api/dist/services.
type McpHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  body: unknown,
  options: { apiUrl: string; token: string }
) => Promise<void>;

const importEsm = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<{ handleMcpRequest: McpHandler }>;

let handler: Promise<McpHandler> | null = null;

export const loadMcpHandler = (): Promise<McpHandler> => {
  handler ??= importEsm(pathToFileURL(path.join(__dirname, '../../../mcp/dist/http.js')).href)
    .then(module => module.handleMcpRequest)
    .catch(error => {
      handler = null; // que lo vuelva a intentar en la siguiente petición
      throw error;
    });
  return handler;
};
