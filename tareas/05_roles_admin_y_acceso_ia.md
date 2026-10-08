# Roles de Administrador y Control de Acceso a IA

## Propósito
Restringir el uso de la Inteligencia Artificial (IA) para que no suponga un coste descontrolado. Solamente el administrador y los usuarios a los que él autorice expresamente podrán utilizar la funcionalidad de IA. El usuario `elcal.lico@gmail.com` será promovido automáticamente a Administrador.

## Backend
1. **Modelo User:** 
   - Añadir `role` (String, default: 'user', enum: ['user', 'admin']).
   - Añadir `aiEnabled` (Boolean, default: false).
2. **Semilla/Script:**
   - Crear un script o lógica de inicialización que detecte si el usuario con email `elcal.lico@gmail.com` existe y, de ser así, hacerle `role: 'admin'` y `aiEnabled: true`. Si no existe, al registrarse se le asignará el rol de admin automáticamente en el controlador.
3. **UserController:**
   - Modificar el registro para dar rol de `admin` a `elcal.lico@gmail.com`.
   - Crear endpoints `GET /users/admin/all` y `PATCH /users/admin/:id/ai` protegidos con un middleware `requireAdmin`.
4. **ExpenseController:**
   - En `parseExpenseWithAI`, verificar si `req.user.aiEnabled === true` o `req.user.role === 'admin'`. Si no, lanzar `AppError('Acceso denegado a las funciones de IA', 403)`.

## Frontend
1. **Tipos:**
   - Actualizar `IUser` en React para incluir `role` y `aiEnabled`.
2. **Componente QuickExpenseFAB:**
   - Solo mostrar el botón `✨` de IA si `user.role === 'admin' || user.aiEnabled`.
3. **Página de Administración (AdminPage):**
   - Crear una nueva página `/admin` accesible solo por administradores.
   - Listar todos los usuarios.
   - Mostrar un `Toggle` o `Switch` para encender/apagar el flag `aiEnabled` de cada usuario.
   - Guardar el estado mediante llamada a `PATCH /api/users/admin/:id/ai`.
