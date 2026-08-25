# Diseño Técnico: Actualizaciones en Tiempo Real con WebSockets (Socket.IO)

## Propósito
Implementar un sistema de actualizaciones en vivo para que cuando un miembro de un grupo de gastos registre, actualice o elimine un gasto, el resto de miembros del grupo que tengan la aplicación abierta vean los cambios reflejados instantáneamente sin necesidad de refrescar la página manualmente. Sienta las bases para futuras implementaciones de chat en vivo o notificaciones instantáneas interactivas.

## Arquitectura y Flujo
Se ha optado por integrar **Socket.IO** en el stack (Node.js + React) por su facilidad de uso, su capacidad de recuperación automática (auto-reconnect) y su sistema integrado de "salas" (Rooms).

1. **Conexión Inicial:** Al cargar la aplicación de React (`App.tsx`), un nuevo proveedor de contexto (`SocketProvider`) establece la conexión WebSocket con el servidor backend, autenticándose con el token JWT del usuario.
2. **Suscripción a Salas:** Cuando un usuario navega a la vista de detalle de un grupo (`GroupDetailPage`), el cliente emite un evento `join_group` con el ID del grupo. El backend añade ese socket a la sala específica de ese grupo (e.g., `group_123`).
3. **Emisión de Eventos:** En el backend, las acciones de escritura de la API (`createExpense`, `updateExpense`, `deleteExpense`, y la generación por IA) emiten un evento broadcast `expenses_updated` dirigido exclusivamente a la sala correspondiente.
4. **Recepción y Refresco:** El cliente React, que está escuchando activamente el evento `expenses_updated`, intercepta la señal y ejecuta la función `fetchGroupData()`, lo que provoca una recarga transparente y en tiempo real de los gastos del grupo en la UI.

## Archivos Modificados / Creados
- **Backend (api/):**
  - `package.json`: Se instaló `socket.io`.
  - `src/config/socket.ts` (NUEVO): Configuración del servidor Socket.IO, middleware de autenticación por JWT y gestión de entrada/salida de salas.
  - `src/server.ts`: Modificado para montar el servidor HTTP base que requiere Socket.IO en lugar de depender únicamente del de Express.
  - `src/controllers/ExpenseController.ts`: Se inyectaron emisiones de socket tras cada operación exitosa en base de datos.
- **Frontend (client/):**
  - `package.json`: Se instaló `socket.io-client`.
  - `src/contexts/SocketContext.tsx` (NUEVO): Manejo global de la conexión WebSocket y la persistencia de su estado mediante la Context API.
  - `src/App.tsx`: Se envuelve la aplicación en el `<SocketProvider>`.
  - `src/pages/GroupDetailPage.tsx`: Se implementó el hook `useEffect` para gestionar el `join_group`, `leave_group` y la escucha del evento de actualización.

## Detalles Técnicos y Consideraciones
- **Autenticación en el Handshake:** Para evitar accesos no autorizados a los canales en tiempo real, el socket solo se conecta si existe un token válido. El backend intercepta la conexión en la fase de 'handshake' usando `io.use()` y valida la firma del JWT.
- **Eficiencia del Flujo Reactivo:** En lugar de enviar la "carga útil" (payload) completa del gasto a través del socket y tener que lidiar con la compleja lógica de estado local (inserciones ordenadas, recálculo de balances), el evento socket solo actúa como un *trigger* (disparador) ligero. Esto delega la responsabilidad de obtener el estado de la verdad absoluta al endpoint REST estándar, lo cual evita condiciones de carrera o desincronizaciones en el cliente.
- **Problemas superados:**
  - Fallo inicial en la inyección de código mediante scripts automatizados debido a discrepancias en el AST del código objetivo, requiriendo parches manuales forzados (`temp/patch_fix_socket.js`).
  - Resolución del problema de inyección de los *emits* en el backend debido a no controlar casos en los que la respuesta variaba, como el bucle en `addExpenseAI` o los errores de tipo en TypeScript para el parche original.
