# Fase 3: presupuesto en la lista

**Estado:** implementada, sin desplegar (2026-11-18).

**Objetivo:** mientras se hace la lista, cgsshoppings enseña cuánto queda del presupuesto de compra de este ciclo: «Supermercado: te quedan 48,00 € · 13 días».

**Qué se aprende:** usar una API ajena como fuente de datos, cachear y degradar con elegancia cuando la otra app no responde.

## De dónde salen los datos

`GET /api/v1/groups/:groupId/budget` ya devolvía el resumen del ciclo (`BudgetSummary` en `api/src/services/BudgetService.ts`):

- `ciclo.fin` (excluido) y `ciclo.diasRestantes` (incluye hoy).
- `limitesCategoria[]`: `{ categoria, limite, gastado, restante, porcentaje }`. Si el usuario ha puesto un límite a la categoría de la compra, este es el número bueno.
- `disponible`: lo que queda del presupuesto total, como respaldo si no hay límite de categoría.

En Trincaunt solo cambia el scope `presupuesto:leer` en esa ruta (fase 2). Con un token pegado (sin scopes) funciona igual.

## Cambios en cgsshoppings

### Servidor (`src/budget.ts`, ruta en `src/integrations.ts`)

- `GET /api/integrations/trincaunt/budget` devuelve `{ budget, stale }`. `budget` tiene solo lo que enseña la barra, `{ categoria, limite, gastado, restante, porcentaje, disponible, diasRestantes, fin }`. El resto del resumen (ingresos, facturas…) no sale del servidor.
- El límite se busca por la categoría de las compras (la de Cuenta), sin distinguir mayúsculas ni tildes, como compara Trincaunt. Si no hay límite para ella, `categoria: null` y cuenta `disponible`.
- **Caché en memoria de 5 minutos por usuario** (un solo proceso). Se borra al enviarse una compra (`sendPurchase`, también la del bucle de reintentos y la de un ticket leído en segundo plano), al conectar y al cambiar de grupo o categoría.
- Si Trincaunt no responde en **3 s** o falla, devuelve el último dato con `stale: true`, o `budget: null`. Sin conexión, sin grupo o con el token rechazado (`status` distinto de `ok`), `budget: null` sin llamar a Trincaunt.

### Cliente (`shopping-list/budget-bar`)

- Una línea encima de la lista, con una barra fina si hay límite de categoría:
  - «Supermercado: te quedan 48,00 € · 13 días», o «te has pasado 12,00 €».
  - Sin límite: «Te quedan 412,50 € del presupuesto · último día».
  - « (sin actualizar)» si el dato es `stale`.
- La barra está en verde, en amarillo desde el 80 % y en rojo desde el 100 %, los mismos umbrales que los avisos de Trincaunt. Se llena hasta el 100 % como mucho.
- Se recarga tras cada «Compra hecha» y cuando llega por el socket `purchase-updated` una compra `enviada` (un ticket leído o un reintento).
- Si no hay `budget` o el servidor falla, no se enseña nada: la lista funciona igual.

## Pruebas

- cgsshoppings, servidor:
  - `budgetView`: categoría sin mayúsculas ni tildes, sin límite, resumen raro;
  - caché fresca y caducada;
  - la ruta: caché, `stale` y `null` si Trincaunt falla, nada sin grupo o con el token rechazado;
  - una compra enviada borra la caché.
- cgsshoppings, cliente: los textos, el color, la barra topada al 100 %, sin límite, `stale`, sin datos, y la recarga por compra y por socket.
- E2E local (2026-11-18), con un límite de 60 € en Supermercado: antes, 60 € y 0 %; tras una compra de 50 €, 10 € y 83 % (la caché se borró al enviar). En el navegador la barra sale en amarillo con «Supermercado: te quedan 10,00 € · 13 días».

## Despliegue

Sin variables nuevas. Con un token pegado funciona ya; con uno de OAuth necesita la fase 2 desplegada en Trincaunt (`presupuesto:leer`).

## Ideas para después

- Con los precios de la fase 4: «esta lista cuesta unos 42 €, te quedarían 6 €».
- En lugar de consultar, que Trincaunt avise a cgsshoppings cuando cambie el presupuesto (webhook, ver la fase 4). Para una barra que se mira de vez en cuando, la caché de 5 minutos basta.
