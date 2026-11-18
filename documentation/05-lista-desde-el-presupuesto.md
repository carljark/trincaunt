# Fase 5: lista desde el presupuesto

**Estado:** implementada en cgsshoppings, sin desplegar (2026-11-18).

**Objetivo:** con un botón «Proponer lista», cgsshoppings propone lo que se suele comprar y ya toca, hasta donde llega el presupuesto de la semana. El usuario desmarca lo que no quiere y lo añade a la lista.

**Qué se aprende:** combinar datos de dos apps (el presupuesto de Trincaunt y el historial propio) en una operación, y que los totales los calcule el código, nunca un modelo.

## Decisiones

| Tema | Decisión | Alternativas descartadas |
|---|---|---|
| Dónde vive | **En cgsshoppings**: tiene las compras, los precios y la lista. Lee el presupuesto como la barra de la fase 3 | En Trincaunt: tendría que pedir a cgsshoppings el historial, los precios y la lista, y luego mandarle la propuesta |
| Qué se suele comprar | **Las compras hechas** («Compra hecha») de los últimos 120 días: cada artículo con al menos 2 compras, sus unidades (mediana) y cada cuántos días se compra (mediana de los intervalos) | `products.frequency`: cuenta lo que se escribe, de todos los usuarios, y no dice cada cuánto |
| Qué toca | Lo que no está en la lista y ya ha pasado el **80 % de su intervalo** desde la última compra | Proponer siempre todo lo habitual: la lista saldría llena de cosas que aún quedan en casa |
| Presupuesto | **Lo que queda del ciclo entre las semanas que faltan**: el límite de la categoría si lo hay, si no el presupuesto total. Se puede escribir otro | Un importe semanal guardado en cgsshoppings: un dato más que mantener |
| Cómo se llena | Primero lo más comprado y, a igualdad, lo más atrasado. Entra mientras la lista (lo que ya hay más lo propuesto) quede por debajo del **90 %** del presupuesto; lo que no cabe se enseña aparte y algo más barato puede entrar detrás | Una IA que elige: no garantiza el total. Optimizar el total (mochila): para 20 artículos no compensa y es más difícil de explicar |
| Artículos sin precio | Se proponen, pero **no cuentan** en el total, y la ventana dice cuántos son | Dejarlos fuera: no se propondría nada hasta tener tickets |
| IA | **Ninguna** | Elegir recetas variadas con IA: cgsshoppings no tiene IA y Trincaunt tendría que recibir recetas y precios |
| Despensa | **No se tiene en cuenta**: ninguna de las dos apps la conoce. El intervalo hace de aproximación (si se compró hace poco, no toca) | Un inventario: otra fase entera |
| Recetas | **No se usan todavía**: sus ingredientes van en gramos y los precios en unidades de la lista | Convertir gramos a unidades: necesita saber cuánto pesa cada artículo |

## Cambios en cgsshoppings

### Servidor (`src/proposal.ts`, rutas en `src/integrations.ts`)

- `habitsFromPurchases`: por artículo (`articleKey`, sin mayúsculas ni tildes), los días distintos en que se compró, la mediana de unidades y la mediana de días entre compras.
- `weeklyBudgetCents`: `restante` (o `disponible`) entre `⌈diasRestantes / 7⌉` semanas, nunca menos de 0.
- `proposeList`: las reglas de arriba. Devuelve `{ budgetCents, currentCents, items, skipped, totalCents, leftCents }`; cada artículo con `{ article, units, cents, intervalDays, daysSince }`.
- `GET /api/shopping-proposal[?budget=euros]`: junta las compras, la lista, los precios (fase 4B) y el presupuesto (fase 3, misma caché y los mismos 3 s); `budgetSource` dice de dónde sale (`trincaunt`, `manual` o `null`). El día es el de España (`todayInSpain`).
- `POST /api/shopping-proposal/apply` `{ items: [{ article, units }] }`: añade a la lista lo que no esté ya (por `articleKey`), hasta 40, con unidades de 1 a 99, y avisa por el socket `shopping` como `add-shopping`, así lo ven todos los dispositivos.

### Cliente (`shopping-list/proposal-dialog`)

- Botón «Proponer lista» bajo la barra del presupuesto.
- La ventana dice el presupuesto («Presupuesto de esta semana: 60,00 € (de Trincaunt, quedan 13 días del ciclo)»), deja escribir otro y recalcular, y enumera lo propuesto: casilla, «6 × Leche», su coste o «sin precio», y «cada 7 días, hace 8».
- Debajo, el total con lo marcado: «La lista quedaría en unos 14,90 € · te sobrarían 5,10 € (1 sin precio)», y «No caben: …».
- «Añadir a la lista (N)»; al volver, «2 artículos añadidos a la lista».
- Sin nada que proponer: explica que se aprende de las compras hechas, desde la segunda vez.

## Pruebas

- Servidor: hábitos (mismo día, mayúsculas, mínimo de 2 compras), presupuesto semanal, propuesta (orden, lista, no vencidos, lo que no cabe, sin precio, sin presupuesto), el día de España, y las dos rutas (presupuesto escrito, sin Trincaunt, añadir sin repetir y avisar).
- Cliente: la ventana (textos, total al desmarcar, lo que se añade, recalcular, sin propuesta, error).
- Local (2026-11-18), con compras y precios metidos en un Mongo desechable: propone la leche y los plátanos (los dos tocan); el pan (comprado ayer), los huevos y el jamón (aún no toca) y el café (una sola compra) no. Al añadir, aparecen en la lista por el socket y la barra pasa a «Esta lista: unos 5,40 € (2 sin precio)».

## Despliegue

Sin variables nuevas ni índices. Funciona sin Trincaunt (sin presupuesto, o con uno escrito).

## Para más adelante

- Recetas para los días de la semana, cuando se sepa convertir gramos en unidades.
- Una despensa, aunque sea marcar «aún tengo» en la propuesta para que aprenda el intervalo.
- Ajustar las unidades propuestas para que quepa más en el presupuesto.
