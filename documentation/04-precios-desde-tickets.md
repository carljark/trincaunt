# Fase 4: precios desde los tickets

**Estado:** esbozo.

**Objetivo:** que cgsshoppings sepa cuánto cuesta cada artículo, aprendido de los tickets, para estimar el precio de la lista antes de ir a comprar.

**Qué se aprende:** webhooks firmados con HMAC (la otra app empuja datos en vez de que se los pidan), emparejar datos de dos sistemas que nombran lo mismo de forma distinta y diseñar eventos versionados.

## Idea

Trincaunt ya lee tickets con Gemini (`POST /expenses/ai-draft` y `AiService.parseExpenseFromMedia`), pero hoy saca **gastos** (`descripcion`, `monto`, `categoria`), no **líneas** de ticket. Hace falta un modo que devuelva las líneas: `{ texto: 'LECHE ENT. HACENDADO 1L', cantidad: 6, importe: 5.34 }`.

Flujo propuesto:

1. En cgsshoppings, al marcar «Compra hecha» (fase 1), se puede adjuntar la foto del ticket.
2. cgsshoppings manda la foto a Trincaunt, que la lee, crea el gasto (con `origen`, como en la fase 1) y devuelve las líneas. O al revés: la foto se sube en Trincaunt y Trincaunt avisa con un webhook. Hay que decidir dónde vive la foto.
3. cgsshoppings empareja cada línea con un artículo de la compra (`items` de `purchases`). Primero por nombre normalizado, luego con ayuda de IA, y al final confirmando con el usuario las dudosas.
4. Guarda un historial de precios por artículo (`prices`: `{ userName, article, store, unitPriceCents, unit, date }`). El precio estimado es la mediana de los últimos.

## Webhooks firmados

Para el caso «el ticket se procesa en Trincaunt y avisa a cgsshoppings»:

- cgsshoppings expone `POST /api/webhooks/trincaunt` (sin sesión).
- Trincaunt firma el cuerpo con un secreto compartido. Cabecera `X-Trincaunt-Signature: t=<timestamp>,v1=<hmac-sha256(secreto, t + '.' + cuerpo)>`.
- cgsshoppings comprueba la firma con comparación en tiempo constante, rechaza timestamps de más de 5 minutos (repeticiones) y responde rápido con `2xx`. El trabajo pesado va después.
- Eventos con `id` único, `tipo` y `version`: `{ id, tipo: 'ticket.leido', version: 1, datos: {...} }`. El receptor guarda los `id` procesados (idempotencia otra vez).
- Trincaunt reintenta los avisos que fallan con la misma espera creciente de la fase 1.

## Preguntas abiertas

- Dónde se procesa el ticket. Hacerlo en Trincaunt reutiliza Gemini y su control de acceso a la IA (`aiEnabled`), pero acopla más las apps.
- Unidades: los artículos de cgsshoppings van en gramos, los tickets en unidades, kilos o litros. Hará falta guardar la unidad del precio.
- Privacidad: las líneas del ticket dicen mucho de los hábitos. ¿Se guardan en las dos apps o solo en una?
