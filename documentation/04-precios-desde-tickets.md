# Fase 4: el ticket en la compra y precios desde los tickets

**Estado:** parte A implementada, sin desplegar ([trincaunt#74](https://github.com/carljark/trincaunt/pull/74), [cgsshoppings#2](https://github.com/carljark/cgsshoppings/pull/2)); parte B esbozo.

La fase tiene dos partes que se pueden desplegar por separado:

- **A. El ticket en «Compra hecha».** Se adjunta la foto (o el PDF) del ticket, Trincaunt la lee y apunta el gasto con cada artículo por separado. Una casilla «A medias» apunta solo la mitad.
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
    │                    │                                               │ crea UN gasto con sus líneas
    │                    │◄──────────── 201 { gasto, líneas } ───────────┤ (× parte si es a medias)
    │◄── «En Trincaunt» ─┤ purchase → enviada (por socket)               │
    │                    │                                               │
    │      (si falla: los mismos reintentos y errores que la fase 1)
```

A diferencia de la fase 1, la petición a Trincaunt se hace **después** de responder al usuario: leer un ticket con IA tarda de 5 a 30 segundos y no tiene sentido dejar la ventana esperando. La compra queda «pendiente» y pasa a «En Trincaunt» por el socket `purchase-updated`, que ya existe.

### Decisiones

| Tema | Decisión | Alternativas descartadas |
|---|---|---|
| Cómo queda en Trincaunt | **Un gasto** («Compra en Mercadona») con el total y un campo nuevo `lineas` con cada artículo y su importe | Un gasto por artículo: un ticket de 25 artículos llenaría la lista de gastos con 25 entradas pequeñas. Un gasto por categoría: presupuesto por categoría exacto, pero el detalle de cada artículo se pierde |
| Dónde vive la foto | En **cgsshoppings**, con la compra. Trincaunt la lee y la descarta (no la guarda ni la escribe en el log) | En Trincaunt: el gasto llevaría el ticket adjunto, pero Trincaunt no guarda ficheros hoy. En ninguna: más simple y privado, pero no se puede volver a mirar el ticket |
| Quién lee el ticket | **Trincaunt**, con su `AiService` (Gemini, con OpenRouter de respaldo) | cgsshoppings con su propia IA: duplicaría la clave, el prompt y el control de quién puede usar IA |
| «A medias» | Se apunta **solo tu mitad** en tu presupuesto personal (`parte: 0.5`) | Mandar el ticket entero a un grupo compartido, pagado por ti y repartido: Trincaunt llevaría la cuenta de lo que te deben, pero obliga a tener ese grupo y elegirlo en cada compra. Se puede añadir más tarde como otra opción |
| El importe | Opcional si hay ticket: el total sale del ticket. Si el usuario lo escribe, manda el suyo | Obligatorio siempre: es pedir un dato que la foto ya tiene |
| Formato del envío | `multipart/form-data`: el fichero tal cual más un campo `datos` con JSON | JSON con la foto en base64: un 33 % más grande y todo el fichero en memoria como texto |

### Cambios en Trincaunt

#### Modelo `Expense`

Dos campos opcionales; los gastos que ya existen no cambian.

```ts
lineas?: {
  texto: string;        // tal como sale en el ticket: 'LECHE ENT. HACENDADO 1L'
  cantidad?: number;    // 6 (unidades) o 0.734 (kilos), si el ticket lo dice
  importe: number;      // lo que se apunta de esta línea, ya multiplicado por `parte`
}[];
parte?: number;         // 0.5 si es a medias. Si falta, 1
```

- `monto` sigue siendo lo que cuenta para el presupuesto: **ya es tu parte** (`total × parte`). Así nada del presupuesto, los avisos ni los informes tiene que saber que existen las líneas.
- La suma de `lineas[].importe` es exactamente `monto`. Si el ticket no cuadra (ver abajo), no se guardan líneas.

#### `POST /api/v1/expenses/from-receipt`

Con `protect` (token `trc_…`), `uploadMedia.single('ticket')` (el multer de `ai-draft`, 15 MB) y `requireGroupMember('body', 'grupo_id')`.

Campos del formulario:

- `ticket`: el fichero (`image/jpeg`, `image/png`, `image/webp` o `application/pdf`).
- `datos`: JSON con lo mismo que `POST /expenses` de la fase 1 (`grupo_id`, `fecha`, `categoria`, `localization`, `assumeExpense`, `origen`), más `parte` (`1` o `0.5`) y `monto` **opcional**.

Pasos, en este orden:

1. Validar `datos` y `origen` (como `parseOrigen`).
2. **Buscar si ya existe un gasto con ese `origen`.** Si existe, devolver `200 { data, duplicado: true }` **sin llamar a la IA**. Es lo que hace barato reintentar: si la primera petición creó el gasto pero la respuesta se perdió, el reintento no paga otra lectura del ticket.
3. Comprobar que el usuario puede usar IA (`role === 'admin' || aiEnabled`, como en `ai-draft`). Si no: `403 { codigo: 'ia_desactivada' }`.
4. Leer el ticket con un método nuevo, `AiService.parseReceipt(buffer, mimeType)`, que devuelve `{ tienda?, fecha?, total, lineas: [{ texto, cantidad?, importe }] }`. Prompt propio: líneas de un ticket de supermercado, descuentos como líneas negativas, sin inventar líneas que no se leen.
5. Si la IA contesta pero no hay total (no es un ticket o no se lee): `422 { codigo: 'ticket_ilegible' }`. Si la IA falla o su respuesta no es JSON (Gemini y OpenRouter), es un 500: un fallo pasajero que cgsshoppings reintenta.
6. Calcular el total: el `monto` del usuario si lo mandó; si no, el `total` del ticket.
7. **Cuadrar las líneas.** Si la suma de las líneas difiere del total del ticket en más de 2 céntimos (la IA se ha saltado o inventado algo), se crea el gasto **sin líneas** y la respuesta lo dice (`lineasDescartadas: true`). Mejor un gasto correcto sin detalle que un detalle que no suma.
8. Aplicar `parte` (ver «Repartir los céntimos»), crear el gasto con `createOrFindExpense` (la carrera E11000 de la fase 1 sigue cubierta) y responder `201 { data, ticket, lineasDescartadas }`. `data.lineas` son las líneas guardadas (con la parte aplicada); `ticket` es lo que se leyó, entero, para la parte B.

La descripción la manda cgsshoppings, como en la fase 1 («Compra en Mercadona (3 artículos)»), y si es a medias termina en « · a medias». El número de artículos es el de la lista, no el de líneas del ticket.

Solo este endpoint pone `lineas` y `parte`: `ExpenseService.createExpense` los ignora si llegan en el cuerpo de un `POST /expenses` normal, para que nadie guarde líneas que no suman el monto.

#### Repartir los céntimos

Con `parte: 0.5`, un ticket de 10,01 € con tres líneas (3,33 + 3,33 + 3,35):

1. Todo en céntimos enteros. `monto = ⌈1001 × 0,5⌉ = 501` (el céntimo suelto se redondea hacia arriba: lo pagas tú).
2. Los 501 céntimos se reparten **en proporción** a cada línea: `501 × 333/1001 = 166,67`, `166,67` y `501 × 335/1001 = 167,67`. Se toma la parte entera (`166 / 166 / 167` = 499) y los 2 céntimos que faltan van a las líneas con mayor resto, en orden si empatan (método del mayor resto): `167 / 166 / 168` = 501.
3. Se guarda en euros dividiendo entre 100 al final, nunca antes.

Así la suma de las líneas es siempre exactamente `monto`, sin errores de coma flotante. Repartir en proporción (y no «cada línea a la mitad») sirve igual para cualquier `parte`, para los descuentos (líneas negativas) y para los tickets que descuadran 1 o 2 céntimos por redondeo. Está en `api/src/services/ReceiptService.ts` (`splitCents`, `buildReceiptExpense`).

#### Cliente

No hay pantalla de detalle del gasto, así que va en la propia fila (`SwipeableExpenseItem`): si tiene `lineas`, un botón «Ticket · 12 artículos · a medias» despliega debajo cada artículo con su cantidad e importe, y la nota «A medias: de cada artículo se apunta la mitad» si `parte` es 0,5. Edición de líneas: fuera de esta fase (al editar el `monto` a mano, se borran las líneas para que no dejen de cuadrar).

#### MCP

`list_expenses` devuelve `lineas` y `parte` si existen, y su búsqueda por `texto` mira también los artículos, para que Claude pueda responder «¿cuánto me gasto en leche?».

### Cambios en cgsshoppings

#### Datos

`purchases` gana dos campos opcionales:

```ts
ticket?: { fileId: ObjectId; mimeType: string; size: number } | null;
shared?: boolean;     // «A medias»
trincaunt: {
  // ...los de la fase 1, más:
  useTicket?: boolean;     // false tras «Enviar sin ticket»
  lines?: number | null;   // líneas que guardó Trincaunt
  linesDropped?: boolean;  // las leyó pero no cuadraban con el total
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
- `classifyResponse` aprende dos casos, los dos **finales** (no se reintentan, igual que el 400):
  - `403` con `codigo: 'ia_desactivada'` → «Tu cuenta de Trincaunt no tiene la IA activada». Hoy un 403 es «problema de grupo»; el `codigo` los distingue.
  - `422` con `codigo: 'ticket_ilegible'` → «Trincaunt no ha podido leer el ticket».
  En los dos casos la compra muestra un botón **«Enviar sin ticket»**, que la reenvía por `/expenses` con el importe que escriba el usuario. Mismo `origen`, así que no puede acabar duplicada.

#### Cliente

En la ventana «Compra hecha»:

- **Ticket**: «Añadir foto del ticket», un `<input type="file" accept="image/*,application/pdf">`. Sin `capture`, para que el móvil ofrezca tanto la cámara como la galería. Se ve una miniatura (o «Ticket en PDF») con «Quitar ticket». La reducción a 1600 px está en `shrink-ticket.ts`.
- **A medias**: casilla, junto a «Enviar a Trincaunt». Si está marcada, el texto de ayuda dice qué se apuntará («la mitad del ticket y de cada artículo» o «la mitad del importe»).
- **Importe**: deja de ser obligatorio si hay ticket. Si no hay ticket, sigue siéndolo para enviar.

En **Compras**, cada compra con ticket tiene «Ver ticket» (despliega la foto o un enlace al PDF), la etiqueta «a medias» y, cuando vuelve de Trincaunt, el número de artículos leídos. Si se descartaron por no cuadrar, lo dice. Mientras Trincaunt lee, el estado es «Trincaunt está leyendo el ticket». Tras un error del ticket aparece un campo de importe con «Enviar sin ticket».

### Seguridad y privacidad

- La foto viaja de servidor a servidor por HTTPS, nunca del navegador de cgsshoppings a Trincaunt.
- Trincaunt no guarda la foto ni la escribe en el log; solo guarda las líneas en el gasto.
- Los tickets pueden llevar los últimos dígitos de la tarjeta y la hora: la foto solo la ve su dueño en cgsshoppings, y el prompt pide **no** devolver nada que no sean líneas de artículos.
- Los límites de multer (5 MB en cgsshoppings, 15 MB en Trincaunt) y la reducción en el cliente evitan que un fichero enorme llene la memoria del EC2.

### Pruebas

- Trincaunt (`ReceiptService.test.ts`, `ExpenseController.test.ts`, `ExpenseService.test.ts`): reparto de céntimos (impar, descuentos negativos, descuadre de 2 céntimos, importe del usuario distinto del ticket); `from-receipt` con origen repetido no llama a la IA; sin `aiEnabled` → 403 con `codigo`; sin total → 422; ticket que no cuadra → gasto sin líneas; un `POST /expenses` normal no puede poner líneas; cambiar el monto borra las líneas. La IA se sustituye por un doble.
- cgsshoppings: `classifyResponse` con los dos códigos nuevos y las líneas; tipo del fichero por sus bytes; `sendPurchase` manda multipart a `from-receipt` y JSON a `/expenses` tras «Enviar sin ticket»; foto perdida → error final; «A medias» con y sin ticket. En el cliente, la ventana (foto reducida a JPEG, PDF, fichero no válido, «A medias») y Compras (ver ticket, líneas, «Enviar sin ticket»).
- E2E local (2026-11-16), con un Mongo desechable y Gemini de verdad: ticket JPEG generado de 10,01 € con 5 líneas (una de descuento), «A medias» y sin importe. `POST /purchases` respondió en 96 ms; Gemini leyó las 5 líneas; el gasto quedó en 5,01 € con `parte: 0.5` y líneas que suman 5,01; repetir el mismo `origen` contestó el mismo gasto en 45 ms, sin IA; la foto se devuelve intacta. Falta probar un ticket real fotografiado y un PDF.

### Orden de despliegue

1. Trincaunt: modelo, `from-receipt`, `parseReceipt`, líneas en la fila del gasto. No cambia nada para quien no lo usa.
2. cgsshoppings: GridFS, ventana con ticket y «A medias», envío nuevo. Necesita la dependencia nueva `multer` (va en la imagen) y nada nuevo en el `.env`.

Para usar el ticket, la cuenta de Trincaunt tiene que tener la IA activada (o ser admin).

### Criterios de aceptación

- Con ticket y sin importe, aparece en Trincaunt un único gasto con el total del ticket y sus líneas.
- Con «A medias», el gasto es la mitad (con el céntimo suelto hacia arriba) y las líneas suman exactamente eso.
- Reintentar una compra que ya llegó no vuelve a llamar a la IA ni duplica el gasto.
- Sin IA o con un ticket ilegible, la compra lo dice y se puede enviar sin ticket.
- La foto se puede volver a ver en Compras y no queda guardada en Trincaunt.

### Preguntas abiertas

- **Vista previa de las líneas** antes de guardar, para corregir lo que la IA lea mal. Obligaría a esperar a la IA dentro de la ventana; se deja para cuando se vea cuánto se equivoca.
- **Categoría por línea** (alimentación, limpieza, droguería) para que el presupuesto por categoría se reparta solo. Hoy el gasto tiene una categoría; necesitaría que `BudgetService` sume líneas en vez de gastos.
- **«A medias» con otra persona**: enviar el ticket completo a un grupo compartido en vez de solo tu mitad.

## B. Precios desde los tickets

**Objetivo:** que cgsshoppings sepa cuánto cuesta cada artículo para estimar el precio de la lista antes de ir a comprar. Se apoya en las líneas que devuelve la parte A.

### Idea

1. Tras la parte A, cgsshoppings recibe las líneas en la respuesta de `from-receipt`.
2. Empareja cada línea con un artículo de la compra (`items` de `purchases`). Primero por nombre normalizado, luego con ayuda de IA, y al final confirmando con el usuario las dudosas.
3. Guarda un historial de precios por artículo (`prices`: `{ userName, article, store, unitPriceCents, unit, date }`). El precio estimado es la mediana de los últimos. Se guarda el precio **del ticket completo**, aunque la compra sea a medias.

### Webhooks firmados

Para cuando un ticket se procese en Trincaunt sin pasar por cgsshoppings (por ejemplo, desde el botón de foto de Trincaunt) y haya que avisar:

- cgsshoppings expone `POST /api/webhooks/trincaunt` (sin sesión).
- Trincaunt firma el cuerpo con un secreto compartido. Cabecera `X-Trincaunt-Signature: t=<timestamp>,v1=<hmac-sha256(secreto, t + '.' + cuerpo)>`.
- cgsshoppings comprueba la firma con comparación en tiempo constante, rechaza timestamps de más de 5 minutos (repeticiones) y responde rápido con `2xx`. El trabajo pesado va después.
- Eventos con `id` único, `tipo` y `version`: `{ id, tipo: 'ticket.leido', version: 1, datos: {...} }`. El receptor guarda los `id` procesados (idempotencia otra vez).
- Trincaunt reintenta los avisos que fallan con la misma espera creciente de la fase 1.

### Preguntas abiertas

- Unidades: los artículos de cgsshoppings van en gramos, los tickets en unidades, kilos o litros. Hará falta guardar la unidad del precio.
- Privacidad: las líneas del ticket dicen mucho de los hábitos. Con la parte A ya se guardan en Trincaunt; ¿también en cgsshoppings o solo los precios?
