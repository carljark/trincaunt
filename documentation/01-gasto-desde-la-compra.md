# Fase 1: gasto desde la compra

**Objetivo:** al terminar la compra, cgsshoppings crea el gasto en el grupo personal de Trincaunt, sin duplicarlo aunque la petición se repita y sin perderlo si Trincaunt está caído.

**Qué se aprende:** autenticación de servidor a servidor con un token personal, idempotencia, reintentos con espera creciente y clasificar los errores de otra API.

**Estado:** implementada, pendiente de desplegar. Trincaunt: carljark/trincaunt#71. cgsshoppings: carljark/cgsshoppings#1. Las diferencias con el diseño original están en [Implementación](#implementación).

## Resumen del flujo

```
 Usuario            cgsshoppings (cliente + servidor)              Trincaunt API
    │                          │                                         │
    │ 1. Pega token trc_…      │                                         │
    ├─────────────────────────►│ GET /users/me, GET /groups ────────────►│
    │ 2. Elige grupo y         │◄──────────── grupos personales ─────────┤
    │    categoría             │ (guarda el token cifrado)               │
    │                          │                                         │
    │ 3. «Compra hecha»        │                                         │
    │    importe, fecha, tienda│                                         │
    ├─────────────────────────►│ crea purchase (pendiente),              │
    │                          │ quita lo marcado de la lista            │
    │                          │ POST /expenses + origen ───────────────►│ crea el gasto
    │                          │◄─────────── 201 (o 200 si ya existía) ──┤ (avisos de presupuesto)
    │◄──── «Enviada» ──────────┤ purchase → enviada                      │
    │                          │                                         │
    │      (si falla: pendiente, reintento a 1 min, 5 min, 30 min, 2 h, 12 h)
```

## Decisiones

| Tema | Decisión | Alternativas descartadas |
|---|---|---|
| Autenticación | Token de API de Trincaunt (`trc_…`) creado por el usuario en Preferencias y pegado en cgsshoppings | OAuth: es la fase 2. Usuario y contraseña de Trincaunt guardados en cgsshoppings: nunca |
| Quién llama | El **servidor** de cgsshoppings | El navegador: necesitaría CORS en Trincaunt y el token estaría al alcance de cualquier script de la página |
| Idempotencia | Campo nuevo `origen: { app, ref }` en el gasto, único por grupo. `ref` es el `_id` de la compra en cgsshoppings | Cabecera `Idempotency-Key` con una colección aparte de claves: más genérica, pero más maquinaria y no deja rastro en el gasto. `origen` además sirve para enseñar «desde cgsshoppings» y para la fase 4 |
| Red | URL pública `https://trincaunt.ddns.net` (`TRINCAUNT_URL`) | Red de Docker compartida entre los dos `compose`: más rápida, pero acopla los despliegues y se salta TLS. Para el volumen de esta app no compensa |
| Envío | Inmediato al pulsar «Compra hecha», con reintentos en segundo plano si falla | Solo en segundo plano (cola): el usuario no sabría al momento si ha ido bien |
| Importe | Lo escribe el usuario (el total del ticket) | Calcularlo: cgsshoppings no tiene precios hasta la fase 4 |

## Cambios en Trincaunt

Compatibles hacia atrás: sin `origen`, `POST /expenses` funciona exactamente igual que ahora.

### Modelo `Expense`

```ts
// Gasto creado por otra aplicación: de cuál y con qué id suyo.
// Sirve para no duplicarlo si la petición se repite.
origen?: { app: string; ref: string };
```

- Esquema: `origen: { app: String, ref: String }`, sin `required`.
- Índice único parcial: `{ grupo_id: 1, 'origen.app': 1, 'origen.ref': 1 }` con `partialFilterExpression: { 'origen.ref': { $exists: true } }`. Mongo 4.4 (el del EC2) admite índices parciales. Va por grupo para que dos usuarios no puedan chocar entre sí con la misma `ref`.

### `POST /api/v1/expenses`

Petición (lo que mandará cgsshoppings):

```http
POST /api/v1/expenses
Authorization: Bearer trc_xxxxxxxxxxxxxxxxxxxxxxxx
Content-Type: application/json

{
  "grupo_id": "665f1c2e9a1b2c3d4e5f6789",
  "descripcion": "Compra en Mercadona (12 artículos)",
  "monto": 54.37,
  "fecha": "2026-11-15",
  "categoria": ["Supermercado"],
  "localization": "Mercadona",
  "assumeExpense": true,
  "origen": { "app": "cgsshoppings", "ref": "6737a1f04c2b9e0012ab34cd" }
}
```

- `pagado_por` se omite: por defecto es el dueño del token.
- `monto` en euros con dos decimales como mucho. cgsshoppings guarda céntimos enteros y divide al enviar.
- `fecha` en `AAAA-MM-DD` (la convención de la API y del MCP).

Validación nueva de `origen` (si viene): objeto con `app` que cumple `^[a-z0-9-]{1,30}$` y `ref` de texto de 1 a 100 caracteres. Si no, 400.

Respuestas:

| Caso | Código | Cuerpo | Efectos |
|---|---|---|---|
| Creado | `201` | `{ status: 'success', data: <gasto> }` | Como hoy: socket `expenses_updated`, push al grupo, comprobación de avisos de presupuesto |
| Ya existía un gasto con ese `grupo_id` + `origen` | `200` | `{ status: 'success', data: <gasto existente>, duplicado: true }` | Ninguno (ni socket, ni push, ni avisos) |
| Carrera: dos peticiones iguales a la vez | `200` | Igual que la fila anterior | Se captura el error `E11000` del índice y se devuelve el gasto que ganó |
| Datos no válidos | `400` | `{ status: 'fail', message }` | — |
| Token borrado o no válido | `401` | `{ status: 'fail', message }` | — |
| No es miembro del grupo | `403` | `{ status: 'fail', message }` | — |
| El grupo no existe | `404` | `{ status: 'fail', message }` | — |

Si el gasto existente tiene otro importe (por ejemplo, el usuario lo corrigió en Trincaunt), se devuelve tal cual: **la primera versión gana** y cgsshoppings no la pisa.

### Otros cambios en Trincaunt

- `GET /groups/:groupId/expenses` y el resto de listados ya devuelven el documento entero, así que `origen` llega solo al cliente. Opcional: una etiqueta pequeña «cgsshoppings» en la fila del gasto.
- Al editar un gasto (`PUT /expenses/:id`) no se puede cambiar ni quitar `origen`.
- El MCP (`mcp/src/tools.ts`, `create_expense`) no necesita cambios: el campo es opcional.
- Tests en `api/tests/services/ExpenseService.test.ts`: crear con `origen`, repetir devuelve el mismo con `duplicado`, `origen` no válido da 400, y el `E11000` simulado devuelve el existente.

No hacen falta endpoints nuevos: cgsshoppings usa los que ya existen.

| Uso | Endpoint existente |
|---|---|
| Comprobar el token y saber de quién es | `GET /api/v1/users/me` |
| Elegir grupo (solo los de `tipo: 'personal'`) | `GET /api/v1/groups` |
| Sugerir categorías | `GET /api/v1/expenses/categories?groupId=<id>` |
| Crear el gasto | `POST /api/v1/expenses` |

## Cambios en cgsshoppings

### Configuración (`.env.example` y `docker-compose.yml`)

```sh
# URL de Trincaunt para enviar las compras como gastos. En desarrollo, http://localhost:3000
TRINCAUNT_URL=https://trincaunt.ddns.net
# Clave para cifrar los tokens de Trincaunt (32 bytes en base64: openssl rand -base64 32).
# Si se pierde, cada usuario tiene que volver a conectar. Sin ella la integración está desactivada.
INTEGRATION_KEY=
```

### Datos nuevos

Colección `integrations`, un documento por usuario (índice único en `userName`):

```ts
interface IIntegrationDb {
  _id: ObjectId;
  userName: string;
  trincaunt: {
    token: { iv: string; tag: string; data: string }; // AES-256-GCM con INTEGRATION_KEY, en base64
    tokenPrefix: string;   // 'trc_abc123', para reconocerlo en Preferencias de Trincaunt
    email: string;         // de GET /users/me, para enseñar con qué cuenta está conectado
    groupId: string | null;
    groupName: string | null;
    categoria: string;     // por defecto 'Supermercado'; la de cada compra puede cambiarse en el diálogo
    status: 'ok' | 'desconectada';
    lastError: string | null;
    connectedAt: Date;
  };
}
```

El token se cifra (no basta con un hash como hace Trincaunt) porque cgsshoppings tiene que volver a usarlo. Nunca se devuelve al cliente después de guardarlo y nunca se escribe en el log.

Colección `purchases` (índices `{ userName: 1, createdAt: -1 }` y `{ 'trincaunt.status': 1, 'trincaunt.nextAttemptAt': 1 }`):

```ts
interface IPurchaseDb {
  _id: ObjectId;            // es la `ref` del origen en Trincaunt
  userName: string;
  items: { article: string; grams: number }[]; // lo que estaba marcado en la lista
  amountCents: number | null;                  // total del ticket en céntimos
  date: string;                                // AAAA-MM-DD
  store: string | null;
  categoria: string;        // la de la integración, salvo que se cambie al guardar la compra
  createdAt: Date;
  trincaunt: {
    status: 'no-enviar' | 'pendiente' | 'enviada' | 'error';
    attempts: number;
    nextAttemptAt: Date | null;
    lastError: string | null;
    expenseId: string | null;
  };
}
```

La compra se guarda también sin Trincaunt (`status: 'no-enviar'`): el historial de compras es útil por sí mismo y será la base de la fase 4.

### Rutas (con el token de sesión de cgsshoppings)

Siguen la convención de cgsshoppings: errores como `{ error }` con HTTP 200.

| Ruta | Qué hace |
|---|---|
| `GET /api/integrations/trincaunt` | `{ enabled, connected, url, email, tokenPrefix, groupId, groupName, categoria, status, lastError }`, nunca el token. `enabled: false` si el servidor no tiene `INTEGRATION_KEY`; `url` sirve para enlazar a Preferencias de Trincaunt |
| `POST /api/integrations/trincaunt` `{ token }` | Comprueba el token con `GET /users/me` y `GET /groups` y lo guarda cifrado. Devuelve los grupos personales `[{ _id, nombre }]`. Si solo hay uno, lo deja elegido |
| `GET /api/integrations/trincaunt/groups` | Los grupos personales, para el selector cuando ya está conectado |
| `PUT /api/integrations/trincaunt` `{ groupId, categoria }` | Guarda la elección. Comprueba otra vez en Trincaunt que el grupo es suyo y es personal |
| `GET /api/integrations/trincaunt/categories` | Pasa las categorías del grupo elegido (`GET /expenses/categories`) para el selector |
| `DELETE /api/integrations/trincaunt` | Olvida el token. El cliente recuerda que también conviene borrarlo en Preferencias de Trincaunt |
| `POST /api/purchases` `{ amount?, date?, store?, categoria?, send }` | Ver abajo |
| `GET /api/purchases?limit=20` | Historial con el estado de cada envío |
| `POST /api/purchases/:id/retry` | Envía ya una compra en `pendiente`, `error` o `no-enviar` (si tiene importe), con los cinco reintentos de nuevo |

`POST /api/purchases`:

1. Lee los artículos marcados (`check: true`) de `shoppings-<usuario>`. Si no hay ninguno: `{ error: 'No hay nada marcado en la lista' }`.
2. Si `send` es verdadero, exige `amount > 0` y una integración `ok` con grupo elegido.
3. Inserta la compra (`pendiente` si se envía, `no-enviar` si no).
4. Borra esos artículos de la lista y emite `remove-shopping` por cada uno a la sala del usuario, como hace ya `/api/remove-shopping`.
5. Si se envía, hace el primer intento con un tiempo máximo de 8 s y responde con la compra y su estado (`enviada`, o `pendiente` con el motivo).

### Envío y reintentos (`src/trincaunt.ts`)

Una función `sendPurchase(purchase)` hace el `POST /expenses` con `fetch` (Node 22) y `AbortSignal.timeout(8000)`, y clasifica el resultado:

| Respuesta de Trincaunt | Estado de la compra | Integración | ¿Reintentar? |
|---|---|---|---|
| `201`, o `200` con `duplicado` | `enviada`, guarda `expenseId` | — | No |
| `400` | `error` con el mensaje | — | No: los datos están mal, reintentar no lo arregla |
| `401` | `pendiente` | `desconectada` | No hasta que el usuario vuelva a conectar; entonces se reintentan todas sus pendientes |
| `403`, `404` | `pendiente` | `lastError`: «El grupo ya no existe o no eres miembro» | No hasta que elija otro grupo |
| `429`, `5xx`, tiempo agotado, error de red | `pendiente` | — | Sí, con espera creciente |

Espera entre intentos: 1 min, 5 min, 30 min, 2 h y 12 h. Después del quinto fallo pasa a `error` y solo se reintenta a mano. Un `setInterval` de un minuto (con `.unref()`, como `AttemptLimiter`) busca las compras `pendiente` con `nextAttemptAt <= ahora`. Antes de enviar cada una la reserva con `findOneAndUpdate` moviendo `nextAttemptAt` hacia delante, para que una petición manual y el temporizador no la manden a la vez. Si aun así ocurriera, la idempotencia de Trincaunt lo resuelve. Basta con un solo proceso, como el resto de cgsshoppings.

Cada cambio de estado emite `purchase-updated` a la sala del usuario, así el cliente lo ve sin recargar.

Descripción del gasto: `Compra en <tienda> (<n> artículos)`, o `Compra (<n> artículos)` sin tienda. La lista de artículos se queda en cgsshoppings en esta fase.

### Cliente (Angular)

- **Cuenta → Trincaunt:** sin conectar, un campo para pegar el token con un enlace a Preferencias de Trincaunt y una línea que explica qué hace. Conectado: cuenta, prefijo del token, selector de grupo y de categoría, botón «Desconectar». Si está `desconectada`, un aviso para pegar un token nuevo.
- **Lista:** botón «Compra hecha» cuando hay algo marcado. Abre un diálogo con importe, fecha (hoy por defecto), tienda (opcional) y «Enviar a Trincaunt» (marcado si hay integración). El campo de importe usa `inputmode="decimal"` y acepta coma.
- **Compras:** pantalla nueva con el historial: fecha, tienda, artículos, importe y estado (Enviada, Pendiente con el motivo, Error con «Reintentar»).

## Seguridad

- El token `trc_` da acceso **completo** a la cuenta de Trincaunt (menos lo marcado como `sessionOnly`). Si alguien se llevara la base de datos de cgsshoppings y además la `INTEGRATION_KEY`, podría usar Trincaunt como el usuario. Para reducirlo: crear un token solo para esto, llamado «cgsshoppings», que se borra en Preferencias si hace falta. La fase 2 lo arregla del todo con permisos limitados.
- La URL de Trincaunt sale de `TRINCAUNT_URL`, nunca de la petición del usuario.
- El token no sale nunca hacia el cliente ni hacia los logs. Los mensajes de error guardados en `lastError` son los de Trincaunt (`message`), que no contienen el token.
- La `INTEGRATION_KEY` vive solo en el `.env` del EC2. El `.env` ya se conserva entre despliegues, porque está excluido del `rsync --delete`.

## Pruebas

- **Trincaunt:** tests de servicio para `origen`, descritos arriba.
- **cgsshoppings:** el servidor no tiene tests todavía. Propuesta: añadir Vitest solo para `src/trincaunt.ts` (clasificar respuestas, calcular la siguiente espera, cifrar y descifrar el token) con `fetch` simulado. En el cliente, specs de Karma para el diálogo y la pantalla de compras, con `ShoppingIOService` simulado como el resto.
- **De extremo a extremo en local:** Trincaunt en `:3000` y cgsshoppings en `:5200` con `TRINCAUNT_URL=http://localhost:3000`. Casos: envío correcto; apagar Trincaunt, comprar, encenderlo y ver que el reintento lo crea una sola vez; borrar el token en Trincaunt y ver la integración `desconectada`.

## Orden de despliegue

1. **Trincaunt** con `origen` e índice (PR, CI, merge). Sin cgsshoppings no cambia nada.
2. Añadir `TRINCAUNT_URL` e `INTEGRATION_KEY` al `.env` de cgsshoppings en el EC2.
3. **cgsshoppings** con la integración.

Si se desplegara cgsshoppings antes, un Trincaunt viejo ignoraría `origen` y un reintento podría duplicar el gasto.

## Criterios de aceptación

- [ ] Con un token pegado y el grupo elegido, «Compra hecha» con importe crea **un** gasto en el grupo personal con la categoría, la fecha y la tienda.
- [ ] Repetir el envío de la misma compra (reintento o carrera) no crea un segundo gasto.
- [ ] Con Trincaunt caído la compra queda pendiente y se envía sola cuando vuelve.
- [ ] Con el token borrado en Trincaunt, la integración aparece como desconectada y no se reintenta en bucle.
- [ ] Los avisos de presupuesto de Trincaunt (80 % y 100 %) saltan con los gastos que llegan de cgsshoppings.
- [ ] El token no aparece en ninguna respuesta de la API de cgsshoppings ni en sus logs.

## Decisiones tomadas

- «Compra hecha» **quita de la lista** lo marcado: ya está comprado y queda guardado en la compra.
- Hace falta **al menos un artículo marcado**. Una compra que no pasó por la lista se apunta directamente en Trincaunt.
- La **categoría** es una por usuario en la configuración, y se puede cambiar en el diálogo de cada compra.

## Implementación

Lo que cambió o se concretó al programarla:

- **Trincaunt.** `ExpenseService.createOrFindExpense` es lo único que mira si el gasto está duplicado. `createExpense` valida `origen`, y los lotes (`/expenses/batch`) no lo aceptan. El índice se crea solo al arrancar (autoIndex de Mongoose).
- **Compras pausadas.** Las compras que esperan a que el usuario arregle la conexión (`401`, `403`, `404`, o integración sin grupo) quedan en `pendiente` con `nextAttemptAt: null` y no gastan intentos. Al conectar de nuevo o elegir grupo, `resumePending` las pone en marcha.
- **Clave cambiada.** Si cambia `INTEGRATION_KEY`, el token guardado no se puede descifrar. Se trata igual que un `401`: integración desconectada.
- **Reserva.** Antes de cada envío la compra se reserva con `findOneAndUpdate`, moviendo `nextAttemptAt` 16 s hacia delante (dos veces el tiempo máximo de una petición). Así no la mandan a la vez el temporizador y un «Reintentar».
- **Datos.** cgsshoppings guarda la `categoria` en cada compra. `tokenPrefix` son los 10 primeros caracteres, los mismos que enseña Preferencias de Trincaunt.
- **Base de datos en cgsshoppings.** Se añadió `getCollection` en `src/db.ts` para usar el driver con `async/await` en el código nuevo.
- **Pruebas.** El servidor de cgsshoppings estrena Vitest (`test/`, en la CI). La prueba de extremo a extremo se hizo con las dos apps y un Mongo temporal en Docker:
  - envío correcto;
  - Trincaunt caído, con reintento manual y automático;
  - token revocado y reconexión;
  - el token no aparece en ningún log.
