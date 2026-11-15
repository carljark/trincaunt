# Fase 2: conectar con OAuth

**Estado:** esbozo. Se detalla cuando la fase 1 esté en producción.

**Objetivo:** cambiar «pega aquí un token» por un botón «Conectar con Trincaunt», y que el token que recibe cgsshoppings solo pueda hacer lo que necesita.

**Qué se aprende:** el flujo authorization code con PKCE de principio a fin, el parámetro `state` contra CSRF, redirecciones entre dominios y permisos (scopes).

## Lo que ya existe en Trincaunt

Trincaunt ya es un servidor OAuth para el conector MCP de Claude:

- Registro dinámico de clientes (`POST /oauth/register`, RFC 7591). Los clientes son **públicos**, sin secreto, con PKCE obligatorio (modelo `OAuthClient`).
- `GET /oauth/authorize` lleva a la pantalla de permiso (`/oauth/consent`, `OAuthConsentPage`), y `POST /oauth/token` canjea el código.
- El token que entrega es un **token de API normal** (`trc_…`, nombre `Conector: <cliente>`), así que ya vale para `/api/v1` y el usuario lo ve y lo borra en Preferencias.
- El único scope anunciado es `trincaunt`, que da acceso a todo.

Es decir, cgsshoppings podría usar OAuth hoy mismo sin tocar Trincaunt. Lo que falta es **limitar** lo que puede hacer el token.

## Cambios en Trincaunt

- **Scopes en los tokens de API.** Campo `scopes: string[]` en `ApiToken`. Vacío o ausente significa todo, para que los tokens actuales sigan igual.
  - `gastos:crear`: `POST /expenses` (fase 1).
  - `grupos:leer`: `GET /groups`, `GET /users/me`, `GET /expenses/categories`.
  - `presupuesto:leer`: `GET /groups/:id/budget` (fase 3).
  - `gastos:leer`: listados de gastos (fase 4).
- **Middleware `requireScope('gastos:crear')`** en esas rutas. Una ruta sin scope declarado rechaza los tokens que tienen scopes. Así un endpoint nuevo queda cerrado por defecto.
- `/oauth/authorize` acepta `scope` y la pantalla de permiso enumera en castellano lo que se va a permitir.
- **Cliente registrado a mano** para cgsshoppings, con `redirect_uri` fija (`https://cgsshoppings.duckdns.org/api/integrations/trincaunt/callback`). Por ejemplo, con una migración o un endpoint de administración. Opcional: hacerlo **confidencial** (con `client_secret`), porque cgsshoppings tiene servidor y puede guardar un secreto. Sería un buen ejercicio de diferencias entre cliente público y confidencial.
- En Preferencias, los tokens con scopes muestran qué permiten.

## Cambios en cgsshoppings

1. `POST /api/integrations/trincaunt/oauth/start` (con sesión): genera `state` y `code_verifier`, los guarda 10 minutos junto con el `userName` y devuelve la URL de `authorize`.
2. El cliente navega a esa URL. El usuario entra en Trincaunt si hace falta y acepta.
3. `GET /api/integrations/trincaunt/callback?code&state` (**sin** sesión: el navegador llega desde Trincaunt sin el JWT de cgsshoppings, que va en una cabecera y no en una cookie). El `state` identifica al usuario. Si no existe o ha caducado, error. Después canjea el código y guarda el token cifrado como en la fase 1.
4. Redirige a `/account?trincaunt=ok` (o `=error`), donde se elige grupo y categoría.

Pegar un token sigue valiendo como alternativa.

## Puntos a comprobar al detallarla

- Si `OAuthConsentPage` sirve tal cual para un cliente que no es Claude (textos).
- La caducidad de los tokens: hoy los `trc_` no caducan. Con OAuth es habitual un token corto más un refresh token. ¿Merece la pena aquí?
- Qué pasa con el token de la fase 1 al reconectar: cgsshoppings debería avisar de que el viejo se puede borrar.
