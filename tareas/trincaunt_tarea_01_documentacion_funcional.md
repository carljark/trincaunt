# Documentación Funcional - Tarea 01: Extracción de Gastos desde Imagen (Ticket)

## Descripción
Se ha implementado una funcionalidad que permite subir una imagen de un ticket de compra y extraer automáticamente los gastos para añadirlos al grupo actual.

## Requisitos Funcionales

1.  **Subida de Imagen:** El usuario puede seleccionar una imagen (ticket) desde el detalle del grupo.
2.  **Extracción Automática (OCR):** El sistema procesa la imagen para extraer:
    *   **Conceptos:** Descripción de cada producto.
    *   **Precios:** Monto de cada producto.
    *   **Lugar:** Nombre del establecimiento (ej: ALDI).
    *   **Fecha:** Fecha de la compra (si está presente).
3.  **Deducción de Categorías:** El sistema asigna automáticamente categorías basadas en palabras clave de la descripción (ej: "PAN" -> "Comida").
4.  **Asignación de Pagador:** El usuario que sube la imagen se asigna automáticamente como el pagador.
5.  **Asignación de Participantes:** Por defecto, todos los miembros del grupo se asignan como participantes de cada gasto extraído.
6.  **Almacenamiento:** Los gastos se guardan individualmente en la base de datos de MongoDB.

## Interfaz de Usuario (UI)

*   **Acción:** Se utiliza el botón de subida de imagen ya existente en el detalle del grupo.
*   **Feedback:** Al finalizar el procesamiento, el sistema muestra un mensaje indicando cuántos gastos han sido añadidos.

## Flujo de Usuario

1.  El usuario entra en el detalle de un grupo.
2.  Hace clic en el icono de subir imagen/ticket.
3.  Selecciona la imagen del ticket.
4.  El sistema procesa la imagen en segundo plano.
5.  Los gastos aparecen reflejados en la lista de gastos del grupo.
