# Documentación Funcional - Tarea 00: Pestaña de Comparativa de Gastos

## Descripción
Se requiere añadir una nueva pestaña llamada "Comparativa" en el detalle del grupo. Esta pestaña permitirá comparar los gastos de diferentes categorías entre dos meses seleccionados (de distintos años si se desea).

## Requisitos Funcionales

1.  **Pestaña de Comparativa:** Añadir un nuevo botón de pestaña "Comparativa" en la interfaz de `GroupDetailPage`.
2.  **Selección de Períodos:**
    *   Dos selectores para elegir el primer mes y año (Período 1).
    *   Dos selectores para elegir el segundo mes y año (Período 2).
3.  **Selección de Categorías:**
    *   Un selector de selección múltiple para elegir qué categorías comparar (ej: Comida, Ocio, Facturas).
4.  **Visualización de Datos:**
    *   Un gráfico de barras que muestre la comparación de los gastos totales por categoría para los dos períodos seleccionados.
    *   El gráfico debe diferenciar visualmente los dos períodos (ej: diferentes colores).
5.  **Interactividad:**
    *   El gráfico debe actualizarse automáticamente al cambiar los períodos o las categorías seleccionadas.

## Interfaz de Usuario (UI)

*   **Ubicación:** Pestaña adicional junto a "Gráfico", "Notas", etc.
*   **Controles:**
    *   Fila 1: Selectores para el Período 1 (Mes, Año).
    *   Fila 2: Selectores para el Período 2 (Mes, Año).
    *   Fila 3: Multi-select para categorías.
*   **Gráfico:** Debajo de los controles, ocupando el espacio principal.

## Flujo de Usuario

1.  El usuario entra en el detalle de un grupo.
2.  Hace clic en la pestaña "Comparativa".
3.  Selecciona el Mes 1 y Año 1.
4.  Selecciona el Mes 2 y Año 2.
5.  Selecciona las categorías que desea comparar.
6.  Observa el gráfico de barras comparativo.
