# Fase 3: presupuesto en la lista

**Estado:** esbozo.

**Objetivo:** mientras se hace la lista, cgsshoppings enseña cuánto queda del presupuesto de compra de este ciclo: «Te quedan 87 € de Supermercado hasta el día 1».

**Qué se aprende:** usar una API ajena como fuente de datos, cachear y degradar con elegancia cuando la otra app no responde.

## De dónde salen los datos

`GET /api/v1/groups/:groupId/budget` ya devuelve el resumen del ciclo (`BudgetSummary` en `api/src/services/BudgetService.ts`):

- `ciclo.fin` y `ciclo.diasRestantes`: hasta cuándo.
- `limitesCategoria[]`: `{ categoria, limite, gastado, restante, porcentaje }`. Si el usuario ha puesto un límite a la categoría de la compra, este es el número bueno.
- `disponible`, `porSemana`: lo que queda del presupuesto total, como respaldo si no hay límite de categoría.

No hacen falta cambios en Trincaunt, salvo el scope `presupuesto:leer` de la fase 2.

## Cambios en cgsshoppings

- `GET /api/integrations/trincaunt/budget`: llama a Trincaunt y devuelve solo lo necesario, `{ categoria, limite, gastado, restante, porcentaje, fin, diasRestantes, disponible }`. **Caché en memoria de 5 minutos por usuario**, que se invalida al enviar una compra (fase 1).
- Si Trincaunt no responde en 3 s, devuelve el último dato cacheado con `stale: true`, o nada. La lista funciona igual sin él.
- Cliente: una barra fina encima de la lista con lo que queda y el porcentaje. Se pone en amarillo al 80 % y en rojo al pasarse, los mismos umbrales que los avisos de Trincaunt.

## Ideas para después

- Con los precios de la fase 4: «esta lista cuesta unos 42 €, te quedarían 45 €».
- En lugar de consultar, que Trincaunt avise a cgsshoppings cuando cambie el presupuesto (webhook, ver la fase 4). Para una barra que se mira de vez en cuando, la caché de 5 minutos basta.
