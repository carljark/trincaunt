import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ApiClient } from './api.js';
import { tools } from './tools.js';

export const VERSION = '1.0.0';

/** Servidor MCP con todas las herramientas de Trincaunt sobre `api`. */
export const createServer = (api: ApiClient) => {
  const server = new McpServer(
    { name: 'trincaunt', version: VERSION },
    {
      instructions:
        'Gastos compartidos y presupuesto personal de Trincaunt. Empieza con list_groups para tener los ids. Los grupos ' +
        'de tipo "personal" tienen presupuesto (get_budget). Importes en euros, fechas AAAA-MM-DD. Las herramientas ' +
        'delete_* borran datos reales sin posibilidad de deshacer: confirma con el usuario antes de usarlas.'
    }
  );

  for (const t of tools) {
    server.registerTool(
      t.name,
      {
        title: t.title,
        description: t.description,
        inputSchema: t.input,
        annotations: {
          title: t.title,
          readOnlyHint: t.kind === 'read',
          destructiveHint: t.kind === 'delete',
          openWorldHint: false
        }
      },
      async (args: unknown) => {
        try {
          const result = await t.run(api, args as never);
          return { content: [{ type: 'text' as const, text: JSON.stringify(result ?? null, null, 2) }] };
        } catch (error) {
          return { isError: true, content: [{ type: 'text' as const, text: (error as Error).message }] };
        }
      }
    );
  }
  return server;
};
