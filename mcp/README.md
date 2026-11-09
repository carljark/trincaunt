# trincaunt-mcp

Servidor MCP (stdio) para consultar y gestionar desde un asistente (Claude Code, opencode, Antigravity, Gemini CLI…) los gastos y el presupuesto personal de Trincaunt. Habla con la API de producción (`https://trincaunt.ddns.net`) usando un token de API.

## 1. Crear el token

En Trincaunt: **Preferencias → Acceso para asistentes (MCP) → Crear token**. El token (`trc_…`) solo se ve una vez. Crea uno por equipo; si uno se filtra, bórralo ahí y deja de funcionar al momento.

Si eres administrador, verás la casilla **Permite administración**. Márcala solo si quieres usar desde el asistente las herramientas de administración (crear usuarios, cambiar roles, gestionar grupos ajenos). Un token sin ella no puede administrar aunque tu usuario sea administrador.

Lo más cómodo es guardarlo en un fichero, así no hay que copiarlo en la configuración de cada herramienta:

```sh
mkdir -p ~/.config/trincaunt
pbpaste > ~/.config/trincaunt/token   # con el token copiado
chmod 600 ~/.config/trincaunt/token
```

También vale la variable de entorno `TRINCAUNT_TOKEN`, que tiene prioridad sobre el fichero.

## 2. Compilar

```sh
cd mcp
npm ci --registry https://registry.npmjs.org
npm run build
```

Queda en `mcp/dist/index.js`. Vuelve a compilar tras actualizar el repo. En los ejemplos, `/ruta/a/trincaunt` es donde tengas este repo.

## 3. Añadirlo a cada herramienta

Con el token en `~/.config/trincaunt/token`, basta con el comando:

**Claude Code** (para todos los proyectos):

```sh
claude mcp add --scope user trincaunt -- node /ruta/a/trincaunt/mcp/dist/index.js
```

**opencode** (`~/.config/opencode/opencode.json`):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "trincaunt": {
      "type": "local",
      "command": ["node", "/ruta/a/trincaunt/mcp/dist/index.js"],
      "enabled": true
    }
  }
}
```

**Antigravity** (Agent → MCP Servers → Manage MCP Servers → View raw config, `mcp_config.json`), **Gemini CLI** (`~/.gemini/settings.json`), **Claude Desktop**, **Cursor** y la mayoría de clientes usan el formato `mcpServers`:

```json
{
  "mcpServers": {
    "trincaunt": {
      "command": "node",
      "args": ["/ruta/a/trincaunt/mcp/dist/index.js"]
    }
  }
}
```

Si prefieres no usar el fichero, añade `"env": { "TRINCAUNT_TOKEN": "trc_…" }` (en opencode, `"environment"`).

Variables opcionales: `TRINCAUNT_URL` para otra instancia, p. ej. `http://localhost:3000` en desarrollo.

## Conector remoto (claude.ai web y móvil, otros clientes con OAuth)

La API sirve el mismo servidor en **`https://trincaunt.ddns.net/mcp`** (Streamable HTTP, sin sesión), así que no hace falta instalar nada:

1. En claude.ai: **Ajustes → Conectores → Añadir conector personalizado**, con la URL `https://trincaunt.ddns.net/mcp`.
2. Al conectar, se abre Trincaunt (inicia sesión si hace falta) y pregunta si permites el acceso. Pulsa **Permitir**.
3. Claude recibe un token de API normal llamado «Conector: …», que aparece en **Preferencias → Acceso para asistentes**. Borrarlo desconecta el conector.

Por dentro: OAuth 2.1 con registro dinámico de clientes (`/oauth/register`), código de autorización con PKCE S256 (`/oauth/authorize`, que manda a la pantalla `/oauth/consent` de la app) y canje en `/oauth/token`. Los metadatos están en `/.well-known/oauth-authorization-server` y `/.well-known/oauth-protected-resource/mcp`. El código vive en `api/src/routes/oauth.ts`, `api/src/services/OAuthService.ts` y `mcp/src/http.ts`; la imagen de Docker incluye `mcp/dist`.

## Herramientas

| Lectura | Escritura | Borrado (no se puede deshacer) |
|---|---|---|
| `whoami`, `list_groups`, `get_group` | `create_group`, `update_group`, `add_group_member` | `remove_group_member` |
| | `create_expense`, `update_expense` | `delete_expense` |
| `list_expenses` (filtros por fechas, categoría, texto) | `update_budget_settings` | `delete_recurring_item` |
| `get_balance`, `list_categories` | `create_recurring_item`, `update_recurring_item` | `delete_income` |
| `get_budget`, `get_budget_history` | `confirm_recurring_item` (pagar factura / cobrar) | |
| `list_recurring_items`, `list_incomes` | `create_income`, `update_income` | |

**Administración** (rol de administrador y token con «Permite administración»): `list_users`, `list_all_groups` (lectura); `create_user`, `set_user_role`, `set_user_ai` (escritura). Además, un administrador puede ver cualquier grupo con `get_group` y añadir o quitar miembros en él, pero no ve sus gastos si no es miembro.

- `create_user` genera una contraseña aleatoria y la devuelve una sola vez. Pásasela a la persona para que entre y la cambie en **Preferencias → Contraseña**.
- `remove_group_member`: uno mismo puede salirse de un grupo; a otros los quita el creador del grupo o un administrador. Si quitas al último miembro, el grupo se borra con todos sus datos.
- Nadie puede cambiarse su propio rol, para que no se quede la app sin administradores por error.

Las herramientas de borrado van marcadas como destructivas (`destructiveHint`), y el servidor le pide al asistente que confirme contigo antes de usarlas. Cómo se respeta depende de cada cliente.

## Desarrollo

```sh
npx vitest run   # tests (cliente MCP real en memoria contra una API simulada)
npm run build
```

El token solo da acceso a lo que tu usuario ve en la app. Nunca sirve para crear ni borrar tokens, exportar o importar la base de datos ni cambiar la contraseña: eso exige haber iniciado sesión en la app.
