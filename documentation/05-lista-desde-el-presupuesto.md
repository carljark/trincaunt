# Fase 5: lista desde el presupuesto

**Estado:** idea. Depende de los precios de la fase 4.

**Objetivo:** en Trincaunt se fija cuánto se quiere gastar en la compra (por ejemplo, 60 € por semana) y se genera una propuesta de lista que cabe en ese importe, que se manda a cgsshoppings.

**Qué se aprende:** orquestar dos APIs en una operación de varios pasos y usar la IA con restricciones duras (el total no puede pasarse).

## Ingredientes

- **Presupuesto:** el límite de la categoría de compra en el grupo personal (`limitesCategoria`), repartido entre las semanas que quedan del ciclo. O un importe semanal propio.
- **Qué se suele comprar:** `products` de cgsshoppings (`frequency`) y el historial de `purchases` de la fase 1.
- **Recetas:** `recipes` de cgsshoppings, con sus ingredientes en gramos.
- **Precios:** el historial de la fase 4.

## Esbozo

1. Trincaunt (o cgsshoppings, hay que decidirlo) pide a la otra app lo que le falta: frecuencias, recetas y precios, o presupuesto.
2. Se monta la propuesta: primero lo imprescindible (alta frecuencia), luego recetas para los días de la semana, ajustando hasta que el total estimado quede por debajo del presupuesto con un margen.
3. La IA puede ayudar a elegir recetas variadas, pero **el total lo calcula el código**, no el modelo.
4. El usuario revisa la propuesta y la envía. cgsshoppings la añade a la lista (`add-shopping` por artículo, o un endpoint nuevo por lotes), sin duplicar lo que ya está.

## Preguntas abiertas

- ¿Dónde vive esta lógica? En cgsshoppings tiene los datos de productos y recetas a mano. En Trincaunt tiene el presupuesto y la IA. Lo natural parece cgsshoppings, consultando el presupuesto como en la fase 3.
- ¿Cómo se trata lo que ya hay en la despensa? Hoy ninguna de las dos apps lo sabe.
