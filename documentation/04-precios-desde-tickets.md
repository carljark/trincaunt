# Fase 4: el ticket en la compra y precios desde los tickets

**Estado:** parte A desplegada el 2026-11-16 ([trincaunt#74](https://github.com/carljark/trincaunt/pull/74), [cgsshoppings#2](https://github.com/carljark/cgsshoppings/pull/2)) con un gasto con líneas; el 2026-11-17 se cambia a **un gasto por artículo** ([trincaunt#75](https://github.com/carljark/trincaunt/pull/75), [cgsshoppings#3](https://github.com/carljark/cgsshoppings/pull/3), desplegado). Parte B desplegada el 2026-11-18 ([trincaunt#77](https://github.com/carljark/trincaunt/pull/77), [cgsshoppings#6](https://github.com/carljark/cgsshoppings/pull/6)), sin probar con la IA de verdad (Gemini daba 503).

La fase tiene dos partes que se pueden desplegar por separado:

- **A. El ticket en «Compra hecha».** Se adjunta la foto (o el PDF) del ticket, Trincaunt la lee y apunta cada artículo como un gasto propio. Una casilla «A medias» apunta solo la mitad.
- **B. Precios desde los tickets.** cgsshoppings aprende de las líneas de los tickets cuánto cuesta cada artículo, para estimar la lista antes de ir a comprar.

**Qué se aprende:** enviar ficheros de servidor a servidor (`multipart/form-data`), operaciones lentas y caras dentro de un flujo con reintentos (la idempotencia evita pagar dos veces la IA), repartir céntimos sin perder ninguno y, en la parte B, webhooks firmados con HMAC.

## A. El ticket en «Compra hecha»

### Flujo

```
 Usuario            cgsshoppings                                   Trincaunt API
    │                    │                                               │
    │ «Compra hecha»     │                                               │
    │ + foto del ticket  │                                               │
    │ + «A medias»       │                                               │
    ├───────────────────►│ guarda la foto (GridFS) y la compra           │
    │                    │ (pendiente), quita lo marcado de la lista     │
    │◄── «Guardada» ─────┤                                               │
    │                    │ POST /expenses/from-receipt ─────────────────►│ ¿ya existe ese origen? → 200
    │                    │   (foto + datos + origen + parte)             │ lee el ticket con IA
    │                    │                                               │ crea un gasto por artículo
    │                    │◄──────────── 201 { gastos, ticket } ──────────┤ (× parte si es a medias)
    │◄── «En Trincaunt» ─┤ purchase → enviada (por socket)               │
    │                    │                                               │
    │      (si falla: los mismos reintentos y errores que la fase 1)
```

A diferencia de la fase 1, la petición a Trincaunt se hace **después** de responder al usuario: leer un ticket con IA tarda de 5 a 30 segundos y no tiene sentido dejar la ventana esperando. La compra queda «pendiente» y pasa a «En Trincaunt» por el socket `purchase-updated`, que ya existe.

### Decisiones

| Tema | Decisión | Alternativas descartadas |
|---|---|---|
| Cómo queda en Trincaunt | **Un gasto por artículo** («Leche entera Hacendado 1 L», 1,08 €), cada uno con su categoría: es como el usuario ya apuntaba sus tickets a mano, y el presupuesto por categoría sale solo | Un gasto con el total y un campo `lineas` con los artículos (lo que se desplegó primero, el 2026-11-16): el detalle quedaba escondido dentro de un gasto y las categorías no se repartían. Un gasto por categoría: el detalle de cada artículo se pierde |
| Dónde vive la foto | En **cgsshoppings**, con la compra. Trincaunt la lee y la descarta (no la guarda ni la escribe en el log) | En Trincaunt: el gasto llevaría el ticket adjunto, pero Trincaunt no guarda ficheros hoy. En ninguna: más simple y privado, pero no se puede volver a mirar el ticket |
| Quién lee el ticket | **Trincaunt**, con su `AiService` (Gemini, con OpenRouter de respaldo) | cgsshoppings con su propia IA: duplicaría la clave, el prompt y el control de quién puede usar IA |
| «A medias» | Se apunta **solo tu mitad** en tu presupuesto personal (`parte: 0.5`) | Mandar el ticket entero a un grupo compartido, pagado por ti y repartido: Trincaunt llevaría la cuenta de lo que te deben, pero obliga a tener ese grupo y elegirlo en cada compra. Se puede añadir más tarde como otra opción |
| El importe | Opcional si hay ticket: el total sale del ticket. Si el usuario lo escribe, manda el suyo | Obligatorio siempre: es pedir un dato que la foto ya tiene |
| Formato del envío | `multipart/form-data`: el fichero tal cual más un campo `datos` con JSON | JSON con la foto en base64: un 33 % más grande y todo el fichero en memoria como texto |

### Cambios en Trincaunt

#### Modelo `Expense`

Sin cambios: cada artículo es un gasto normal. Lo que lo une a la compra es su `origen`: `{ app: 'cgsshoppings', ref: '<id de la compra>#<n>' }`, con `n` = 1, 2, 3… en el orden del ticket. El índice único de la fase 1 (`grupo_id` + `origen.app` + `origen.ref`) sigue impidiendo duplicados, sin migración.

#### `POST /api/v1/expenses/from-receipt`

Con `protect` (token `trc_…`), `uploadMedia.single('ticket')` (el multer de `ai-draft`, 15 MB) y `requireGroupMember('body', 'grupo_id')`.

Campos del formulario:

- `ticket`: el fichero (`image/jpeg`, `image/png`, `image/webp` o `application/pdf`).
- `datos`: JSON con lo mismo que `POST /expenses` de la fase 1 (`grupo_id`, `fecha`, `categoria`, `localization`, `assumeExpense`, `origen`), más `parte` (`1` o `0.5`) y `monto` **opcional**.

Pasos, en este orden:

1. Validar `datos` y `origen` (como `parseOrigen`).
2. **Buscar si ya existen gastos con ese `origen`** (el `ref` tal cual o `ref#n`, `ExpenseService.findByOrigen`). Si existen, devolver `200 { data: [...], duplicado: true }` **sin llamar a la IA**. Es lo que hace barato reintentar: si la primera petición creó el gasto pero la respuesta se perdió, el reintento no paga otra lectura del ticket.
3. Comprobar que el usuario puede usar IA (`role === 'admin' || aiEnabled`, como en `ai-draft`). Si no: `403 { codigo: 'ia_desactivada' }`.
4. Leer el ticket con un método nuevo, `AiService.parseReceipt(buffer, mimeType)`, que devuelve `{ tienda?, fecha?, total, lineas: [{ texto, nombre?, categoria?, cantidad?, importe }] }`. Prompt propio: líneas de un ticket de supermercado, descuentos como líneas negativas, sin inventar líneas que no se leen. `nombre` es el artículo legible («LECHE ENT. HACEND. 1L» → «Leche entera Hacendado 1 L») y `categoria` una o dos palabras (Comida, Bebidas, Limpieza, Higiene…).
5. Si la IA contesta pero no hay total (no es un ticket o no se lee): `422 { codigo: 'ticket_ilegible' }`. Si la IA falla o su respuesta no es JSON (Gemini y OpenRouter), es un 500: un fallo pasajero que cgsshoppings reintenta.
6. Calcular el total: el `monto` del usuario si lo mandó; si no, el `total` del ticket.
7. **Juntar los descuentos** con el artículo de encima (en los tickets el descuento va debajo de lo que rebaja; uno al principio se suma al primero): `foldDiscounts`.
8. **Cuadrar.** Si la suma de las líneas difiere del total del ticket en más de 2 céntimos (la IA se ha saltado o inventado algo), si el importe del usuario no es el del ticket o si un descuento deja un artículo a 0 o menos, se crea **un solo gasto** con el total y la descripción de la compra, y la respuesta lo dice (`lineasDescartadas: true`). Mejor un gasto correcto sin detalle que un detalle que no suma.
9. Aplicar `parte` (ver «Repartir los céntimos») y crear todos los gastos de una vez con `createOrFindExpenses` (`insertMany` en orden: si otra petición igual ganó la carrera, falla el primero por el índice único, no se guarda ninguno y se devuelven los suyos). Responder `201 { data: [gastos], ticket, lineasDescartadas }`; `ticket` es lo que se leyó, entero, para la parte B.

Cada artículo se apunta con:

- `descripcion`: el `nombre` (o el `texto` si la IA no lo dio), con las unidades delante si son varias («2 Pan de barra») y « · a medias» al final si lo es.
- `monto`: su parte del total, en euros.
- `categoria`: la de la IA y las de la compra sin repetir (`['Comida', 'Supermercado']`).
- `fecha`, `localization` (la tienda), `assumeExpense`: los de la compra, iguales para todos.

Se manda **un solo aviso** (push y socket) por ticket, con la descripción de la compra («Compra en Mercadona (3 artículos)») y el total.

#### Repartir los céntimos

Con `parte: 0.5`, un ticket de 10,01 € con tres artículos (3,33 + 3,33 + 3,35):

1. Todo en céntimos enteros. `monto = ⌈1001 × 0,5⌉ = 501` (el céntimo suelto se redondea hacia arriba: lo pagas tú).
2. Los 501 céntimos se reparten **en proporción** a cada artículo: `501 × 333/1001 = 166,67`, `166,67` y `501 × 335/1001 = 167,67`. Se toma la parte entera (`166 / 166 / 167` = 499) y los 2 céntimos que faltan van a los artículos con mayor resto, en orden si empatan (método del mayor resto): `167 / 166 / 168` = 501.
3. Se guarda en euros dividiendo entre 100 al final, nunca antes.

Así los gastos de un ticket suman siempre exactamente su parte del total, sin errores de coma flotante. Repartir en proporción (y no «cada artículo a la mitad») sirve igual para cualquier `parte` y para los tickets que descuadran 1 o 2 céntimos por redondeo. Si un artículo de 1 céntimo se queda en 0 al repartir, no se apunta (los demás siguen sumando el total). Está en `api/src/services/ReceiptService.ts` (`splitCents`, `foldDiscounts`, `buildReceiptItems`).

#### Cliente y MCP

Sin cambios: los artículos son gastos normales, con su fila, su categoría y su búsqueda por texto en `list_expenses`.

### Cambios en cgsshoppings

#### Datos

`purchases` gana dos campos opcionales:

```ts
ticket?: { fileId: ObjectId; mimeType: string; size: number } | null;
shared?: boolean;     // «A medias»
trincaunt: {
  // ...los de la fase 1, más:
  useTicket?: boolean;     // false tras «Enviar sin ticket»
  lines?: number | null;   // gastos que creó Trincaunt, uno por artículo
  linesDropped?: boolean;  // los leyó pero no cuadraban: un solo gasto con el total
}
```

Con ticket, `amountCents` puede ser `null`: el total lo lee Trincaunt.

La foto se guarda en un bucket de **GridFS** (`tickets`) del Mongo de cgsshoppings: no hace falta disco ni servicio nuevo y entra en las copias de seguridad de la base de datos. El EC2 tiene poca memoria y disco, así que el cliente **reduce la foto antes de subirla** (lado mayor 1600 px, JPEG calidad 0,8: unos 300 KB). Los PDF se aceptan tal cual hasta 5 MB.

#### Rutas (con el token de sesión de cgsshoppings)

- `POST /api/purchases` pasa a aceptar `multipart/form-data` (`multer`, en memoria, hasta 5 MB) con un `ticket` opcional; sigue aceptando JSON sin ticket. El tipo se decide por los primeros bytes del fichero (JPEG, PNG, WebP o PDF; `sniffTicketType` en `src/tickets.ts`), nunca por el nombre ni por la cabecera que manda el navegador.
- `GET /api/purchases/:id/ticket`: devuelve la foto, solo a su dueño, con `Cache-Control: private`. El cliente la pide con `HttpClient` (un `<img>` no puede mandar el token de sesión) y la enseña con una URL `blob:`.
- `POST /api/purchases/:id/retry` acepta `{ withoutTicket: true, amount? }` para «Enviar sin ticket».

#### Envío (`src/trincaunt.ts`)

- Si la compra tiene `ticket` (y no se pidió «Enviar sin ticket»), `sendPurchase` lee el fichero de GridFS y llama a `/expenses/from-receipt` con `FormData`; si no, sigue usando `/expenses` como en la fase 1. Si la foto ya no está en GridFS, es un error final.
- Con ticket, `POST /api/purchases` responde **sin esperar** a Trincaunt: la compra vuelve «pendiente» y el resultado llega por el socket `purchase-updated`. Sin ticket sigue esperando, como en la fase 1.
- Tiempo máximo de la petición: **60 s** para el ticket (los 8 s de la fase 1 se quedan cortos para la IA). La reserva de la compra (`nextAttemptAt` al reclamarla) dura el doble, 120 s, para que el bucle de reintentos no la mande otra vez mientras la IA lee.
- «A medias» sin ticket manda la mitad del importe (céntimo suelto hacia arriba, igual que Trincaunt); con ticket manda el importe entero (si lo hay) y `parte: 0.5`.
- `classifyResponse` acepta `data` como lista (ticket: guarda el id del primero y cuántos son) o como un gasto (sin ticket), y aprende dos casos, los dos **finales** (no se reintentan, igual que el 400):
  - `403` con `codigo: 'ia_desactivada'` → «Tu cuenta de Trincaunt no tiene la IA activada». Hoy un 403 es «problema de grupo»; el `codigo` los distingue.
  - `422` con `codigo: 'ticket_ilegible'` → «Trincaunt no ha podido leer el ticket».
  En los dos casos la compra muestra un botón **«Enviar sin ticket»**, que la reenvía por `/expenses` con el importe que escriba el usuario. Mismo `origen`, así que no puede acabar duplicada.

#### Cliente

En la ventana «Compra hecha»:

- **Ticket**: «Añadir foto del ticket», un `<input type="file" accept="image/*,application/pdf">`. Sin `capture`, para que el móvil ofrezca tanto la cámara como la galería. Se ve una miniatura (o «Ticket en PDF») con «Quitar ticket». La reducción a 1600 px está en `shrink-ticket.ts`.
- **A medias**: casilla, junto a «Enviar a Trincaunt». Si está marcada, el texto de ayuda dice qué se apuntará («la mitad del ticket y de cada artículo» o «la mitad del importe»).
- **Importe**: deja de ser obligatorio si hay ticket. Si no hay ticket, sigue siéndolo para enviar.

En **Compras**, cada compra con ticket tiene «Ver ticket» (despliega la foto o un enlace al PDF), la etiqueta «a medias» y, cuando vuelve de Trincaunt, «Apuntada en 12 gastos, uno por artículo». Si se descartaron por no cuadrar, lo dice. Mientras Trincaunt lee, el estado es «Trincaunt está leyendo el ticket». Tras un error del ticket aparece un campo de importe con «Enviar sin ticket».

### Seguridad y privacidad

- La foto viaja de servidor a servidor por HTTPS, nunca del navegador de cgsshoppings a Trincaunt.
- Trincaunt no guarda la foto ni la escribe en el log; solo guarda los artículos como gastos.
- Los tickets pueden llevar los últimos dígitos de la tarjeta y la hora: la foto solo la ve su dueño en cgsshoppings, y el prompt pide **no** devolver nada que no sean líneas de artículos.
- Los límites de multer (5 MB en cgsshoppings, 15 MB en Trincaunt) y la reducción en el cliente evitan que un fichero enorme llene la memoria del EC2.

### Pruebas

- Trincaunt (`ReceiptService.test.ts`, `ExpenseController.test.ts`, `ExpenseService.test.ts`): reparto de céntimos (impar, descuadre de 2 céntimos, importe del usuario distinto del ticket, artículo que se queda en 0); descuentos sumados al artículo de encima; un gasto por artículo con nombre, unidades, categorías y `ref#n`; `from-receipt` con origen repetido no llama a la IA; sin `aiEnabled` → 403 con `codigo`; sin total → 422; ticket que no cuadra → un gasto con el total; `findByOrigen` no confunde `ref` con otro que empiece igual; `createOrFindExpenses` valida todos antes de guardar y devuelve los del ganador de una carrera. La IA se sustituye por un doble.
- cgsshoppings: `classifyResponse` con los dos códigos nuevos y la lista de gastos; tipo del fichero por sus bytes; `sendPurchase` manda multipart a `from-receipt` y JSON a `/expenses` tras «Enviar sin ticket»; foto perdida → error final; «A medias» con y sin ticket. En el cliente, la ventana (foto reducida a JPEG, PDF, fichero no válido, «A medias») y Compras (ver ticket, líneas, «Enviar sin ticket»).
- E2E local (2026-11-16), con un Mongo desechable y Gemini de verdad: ticket JPEG generado de 10,01 € con 5 líneas (una de descuento), «A medias» y sin importe. `POST /purchases` respondió en 96 ms; Gemini leyó las 5 líneas; el gasto quedó en 5,01 € con `parte: 0.5` y líneas que suman 5,01; repetir el mismo `origen` contestó el mismo gasto en 45 ms, sin IA; la foto se devuelve intacta. Falta probar un ticket real fotografiado y un PDF.

### Orden de despliegue

1. Trincaunt: `from-receipt`, `parseReceipt`. No cambia nada para quien no lo usa. (Al pasar a un gasto por artículo, `from-receipt` contesta una lista: va primero, y la cgsshoppings anterior no lo entendería hasta desplegar la nueva; como nadie mandaba tickets todavía, no importa.)
2. cgsshoppings: GridFS, ventana con ticket y «A medias», envío nuevo. Necesita la dependencia nueva `multer` (va en la imagen) y nada nuevo en el `.env`.

Para usar el ticket, la cuenta de Trincaunt tiene que tener la IA activada (o ser admin).

### Criterios de aceptación

- Con ticket y sin importe, aparece en Trincaunt un gasto por artículo, con su nombre y su categoría, y entre todos suman el total del ticket.
- Con «A medias», cada artículo es la mitad, y entre todos suman exactamente la mitad del ticket (con el céntimo suelto hacia arriba).
- Reintentar una compra que ya llegó no vuelve a llamar a la IA ni duplica el gasto.
- Sin IA o con un ticket ilegible, la compra lo dice y se puede enviar sin ticket.
- La foto se puede volver a ver en Compras y no queda guardada en Trincaunt.

### Preguntas abiertas

- **Vista previa de las líneas** antes de guardar, para corregir lo que la IA lea mal. Obligaría a esperar a la IA dentro de la ventana; se deja para cuando se vea cuánto se equivoca.
- **Agrupar los artículos de un ticket** en la lista de gastos (plegados bajo «Compra en Mercadona»), si 25 filas sueltas resultan demasiadas. El `ref#n` ya permite saber cuáles van juntos.
- **«A medias» con otra persona**: envi## B. Precios desde los tickets

**Objetivo:** que cgsshoppings sepa cuánto cuesta cada artículo para estimar la lista antes de ir a comprar: «Esta lista: unos 42,00 € · te quedarían 6,00 €».

### Decisiones

| Tema | Decisión | Alternativas descartadas |
|---|---|---|
| Quién empareja cada línea con un artículo de la lista | **La IA de Trincaunt, en la misma lectura del ticket**: cgsshoppings manda la lista (`datos.articulos`) y cada línea vuelve con `articulo`, que solo puede ser uno de la lista tal cual | Emparejar en cgsshoppings por nombre: «LECHE ENT. HACEND.» no se parece a «leche». Una segunda llamada a la IA: más cara y más lenta. Confirmar los dudosos a mano: más pantallas; si la IA duda, la línea se queda sin artículo |
| Qué se guarda en cgsshoppings | **Solo el precio por artículo** (`prices`: artículo, tienda, céntimos por unidad, fecha, compra) | Las líneas del ticket: dicen mucho de los hábitos y ya están como gastos en Trincaunt |
| Unidades | **El precio de la línea entre sus unidades** si son unidades enteras; una línea pesada (kilos) cuenta como una unidad de la lista. Sin convertir a gramos | Convertir kilos y litros: la lista cuenta unidades, no pesos |
| El precio estimado | **La mediana de las últimas 5 veces** (del último año), por unidad, × las unidades de la lista | La media: una oferta o un error de la IA la mueve mucho. El último precio: igual |
| «A medias» | Se guarda el precio **del ticket entero** | La mitad: el artículo cuesta lo que cuesta |
| Webhooks firmados | **No se hacen todavía** | Solo hacen falta si un ticket se lee en Trincaunt sin pasar por cgsshoppings, y hoy no pasa |

### Cambios en Trincaunt

- `datos.articulos` (opcional) en `POST /expenses/from-receipt`: los artículos de la compra, sin repetir, hasta 100 de 60 caracteres (`parseArticulos`).
- `AiService.parseReceipt(buffer, mimeType, articulos)`: con lista, el prompt pide `articulo` en cada línea, exactamente como está en la lista y solo si es seguro.
- `validateReceipt(data, articulos)`: un `articulo` que no esté en la lista se descarta (la IA no puede inventarse otro).
- La respuesta `201` ya devolvía `ticket` entero; ahora sus líneas llevan `articulo`.

### Cambios en cgsshoppings

- `receiptBody` manda `articulos` (los `items` de la compra).
- `classifyResponse` guarda el `ticket` de la respuesta; `sendPurchase` llama a `recordPrices` **antes** de avisar por el socket, para que la estimación ya los tenga. Un fallo al guardar precios no cambia el estado de la compra.
- `src/prices.ts`:
  - `pricesFromReceipt`: junta los descuentos con la línea de encima (como `foldDiscounts`), suma las líneas del mismo artículo y divide entre sus unidades. Las líneas sin artículo o que quedan a 0 no enseñan nada.
  - `recordPrices`: `upsert` por compra y artículo (idempotente). Colección `prices` con índices `{userName, date}` y único `{purchaseId, key}`.
  - `priceTable`: mediana de las últimas 5 por artículo. `articleKey` compara sin mayúsculas, tildes ni espacios de más.
- `GET /api/prices` → `{ prices: [{ key, cents, samples, date }] }`.
- Cliente: la barra de la fase 3 recibe la lista (`[items]`) y añade una línea «Esta lista: unos 7,90 € · te quedarían 40,10 € (1 sin precio)», o «te pasarías…». Sin Trincaunt sale solo la estimación; sin ningún precio, nada. Los precios se recargan con el presupuesto (tras «Compra hecha» y al llegar una compra a Trincaunt).

### Límites

- Si la respuesta de `from-receipt` se pierde, el reintento recibe `duplicado: true` sin `ticket`: esa compra no deja precios.
- Una compra enviada sin ticket no deja precios.

### Pruebas

- Trincaunt: `parseArticulos`; `validateReceipt` solo acepta artículos de la lista; el controlador pasa la lista a la IA.
- cgsshoppings, servidor: precio por unidad con descuentos, varias líneas del mismo artículo, líneas pesadas, línea a 0, mediana de las últimas 5; `receiptBody` manda `articulos`; `sendPurchase` guarda los precios antes de avisar.
- cgsshoppings, cliente: la estimación con y sin presupuesto, «te pasarías», artículos sin precio, sin precios.
- **Sin E2E con la IA de verdad:** el 2026-11-18 Gemini contestaba 503. Queda por comprobar con el primer ticket real que la IA rellena `articulo` bien.

### Para más adelante

- Webhooks firmados (HMAC con timestamp, eventos con `id` para la idempotencia) si Trincaunt llega a leer tickets que no vienen de cgsshoppings.
- Ver el precio de cada artículo en la lista, o el historial por tienda.
