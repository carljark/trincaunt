# Refactorización IA: Múltiples Gastos y Sistema de Notificaciones Asíncrono

## Propósito
El diseño original de la IA obligaba al usuario a esperar la respuesta y solo procesaba un gasto. Dado que los tickets (ej. Mercadona) pueden contener múltiples ítems y el tiempo de inferencia de la IA puede bloquear la experiencia del usuario (UX), se necesita un procesamiento asíncrono en segundo plano. Además, el backend debe insertar los gastos automáticamente en bloque, y el frontend debe informar del progreso mediante un nuevo sistema de notificaciones (campana con contador).

## Arquitectura/Flujo
1. **Backend - Modificación de AiService:** El prompt de Gemini se modificará para devolver un **Array** de objetos JSON `[{ descripcion, monto }]`.
2. **Backend - Modificación de ExpenseController:** En lugar de devolver el JSON parseado al frontend, el controlador iterará sobre el array devuelto por la IA y ejecutará `ExpenseService.createExpense` para cada ítem de forma automática. Devolverá un 200 OK cuando todo esté guardado.
3. **Frontend - NotificationContext:** Se creará un nuevo Contexto global en React (`NotificationProvider`) que mantendrá un estado de tareas en segundo plano (`{ id, status: 'loading' | 'success' | 'error', message }`).
4. **Frontend - QuickExpenseFAB:** Al seleccionar la foto/audio, el componente despachará la petición HTTP al contexto de notificaciones e instantáneamente cerrará el menú para no bloquear al usuario.
5. **Frontend - NotificationBell:** Un nuevo componente en la barra de navegación o cabecera que mostrará un contador numérico rojo si hay notificaciones nuevas/en progreso, y un menú desplegable para ver el historial.

## Archivos a Modificar / Crear
- **Backend:**
  - `api/src/services/AiService.ts` (Modificar prompt y validación para Array).
  - `api/tests/services/AiService.test.ts` (Adaptar TDD a Array).
  - `api/src/controllers/ExpenseController.ts` (Insertar en BD).
  - `api/tests/controllers/ExpenseController.test.ts` (Adaptar TDD).
- **Frontend:**
  - `client/src/contexts/NotificationContext.tsx` (NUEVO).
  - `client/src/components/NotificationBell.tsx` (NUEVO).
  - `client/src/components/QuickExpenseFAB.tsx` (Refactor para delegar al contexto).

## Detalles Técnicos
- **Inserción Directa:** Al no requerir confirmación manual, si la IA se equivoca, el usuario usará el sistema de edición/borrado rápido (Swipe-to-Action) implementado en tareas anteriores.
- **Asincronía en React:** El backend seguirá resolviendo la petición de forma síncrona en la conexión HTTP (esperando a Gemini), pero el *Frontend* no bloqueará la UI; la promesa HTTP quedará viva dentro del Contexto Global, actualizando el estado de la notificación al resolverse (o fallar).
