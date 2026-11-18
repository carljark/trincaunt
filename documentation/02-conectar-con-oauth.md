# Fase 2: conectar con OAuth

**Estado:** desplegada el 2026-11-18 ([trincaunt#76](https://github.com/carljark/trincaunt/pull/76), [cgsshoppings#4](https://github.com/carljark/cgsshoppings/pull/4)).

**Objetivo:** cambiar «pega aquí un token» por un botón «Conectar con Trincaunt», y que el token que recibe cgsshoppings solo pueda hacer lo que necesita.

**Qué se aprende:** el flujo authorization code con PKCE de principio a fin, el parámetro `state` contra CSRF, redirecciones entre dominios, permisos (scopes), cliente público frente a confidencial y revocación de tokens.

## Lo que ya existía en Trincaunt

Trincaunt ya era un servidor OAuth para el conector MCP de Claude:

- Registro dinámico de clientes (`POST /oauth/register`, RFC 7591). Los clientes son **públicos**, sin secreto, con PKCE obligatorio (modelo `OAuthClient`).
- `GET /oauth/authorize` lleva a la pantalla de permiso (`/oauth/consent`, `OAuthConsentPage`), y `POST /oauth/token` canjea el código.
- El token que entrega es un **token de API normal** (`trc_…`, nombre `Conector: <cliente>`), así que vale para `/api/v1` y el usuario lo ve y lo borra en Preferencias.
- El único scope era `trincaunt`, que da acceso a todo.

Faltaba **limitar** lo que puede hacer el token y que cgsshoppings, que tiene servidor, se identificara con un secreto.

## Flujo

```
 Navegador                  cgsshoppings (servidor)                     Trincaunt
    │ «Conectar con Trincaunt»       │                                         │
    ├──── POST oauth/start ─────────►│ guarda hash(state), verifier, usuario   │
    │◄──── { url } ──────────────────┤ (10 min)                                │
    ├──── GET /api/oauth/authorize?client_id=cgsshoppings&scope=…&state&code_challenge ─►│
    │◄─── 302 /oauth/consent ─────────────────────────────────────────────────┤
    │  (entra si hace falta; ve «cgsshoppings quiere acceder solo para: …»)    │
    ├──── «Permitir» ─────────────────────────────────────────────────────────►│ código de un solo uso
    │◄─── 302 cgsshoppings/api/integrations/trincaunt/callback?code&state ────┤ (10 min)
    ├──── GET callback (sin sesión) ►│ state → usuario                         │
    │                                ├── POST /oauth/token (Basic + verifier) ►│ token trc_ con scopes
    │                                │◄──────── { access_token, scope } ───────┤
    │                                │ lo guarda cifrado (fase 1)              │
    │◄──── 302 /account?trincaunt=ok ┤                                         │
```

## Decisiones

| Tema | Decisión | Alternativas descartadas |
|---|---|---|
| Qué puede hacer el token | **Scopes** en el token de API. Una ruta los declara con `requireScope`, y un token con scopes no entra en una ruta que no declare ninguno (**cerrado por defecto**) | Lista de rutas permitidas en un sitio aparte: se desincroniza de las rutas. Comprobar el scope solo donde se acuerde uno: una ruta nueva quedaría abierta |
| Cómo se registra cgsshoppings | **Cliente confidencial fijado por la configuración**: `client_id` `cgsshoppings`, la URL de vuelta sale de `CGSSHOPPINGS_URL` y el secreto de `CGSSHOPPINGS_CLIENT_SECRET`. Sin el secreto no existe | Registro dinámico como Claude: cualquiera podría registrar un cliente llamado «cgsshoppings». Una migración o un endpoint de administración: guardaría el secreto en la base de datos y habría que pasarlo a mano al otro servidor |
| Caducidad | Los `trc_` siguen **sin caducar**; se revocan | Token corto + refresh token: más piezas (rotación, guardar dos tokens) para dos servidores propios. Queda como posible ejercicio |
| Reconectar | El token nuevo de un cliente confidencial **sustituye** a los anteriores de ese usuario | Acumular tokens: Preferencias se llenaría de «Conector: cgsshoppings» que nadie usa |
| Desconectar | cgsshoppings **revoca** el token (RFC 7009, `POST /oauth/revoke`) | Pedir al usuario que lo borre en Preferencias, como con un token pegado |
| Pegar un token | Sigue valiendo, como alternativa («o pega un token») | Quitarlo: los servidores sin el secreto se quedarían sin integración |

## Cambios en Trincaunt

### Scopes

`api/src/services/scopes.ts`:

| Scope | Rutas | Texto en la pantalla de permiso |
|---|---|---|
| `grupos:leer` | `GET /users/me`, `GET /groups`, `GET /expenses/categories` | Ver tus grupos, tu email y las categorías que usas |
| `gastos:crear` | `POST /expenses`, `POST /expenses/from-receipt` | Apuntar gastos en tus grupos |
| `presupuesto:leer` | `GET /groups/:groupId/budget` (fase 3) | Ver tu presupuesto personal |

- `ApiToken` gana `scopes?: string[]` (vacío o ausente es todo, así los tokens que ya existen no cambian) y `cliente?: string` (el `client_id` que lo pidió).
- `requireScope(scope)` va después de `protect`. Deja pasar la sesión de la app, los tokens sin scopes y los que tienen ese scope; si no, `403 { codigo: 'scope_insuficiente' }`.
- **Cerrado por defecto:** `protect` mira en `req.route.stack` si la ruta lleva un `requireScope` (marcado con un `Symbol`). Si no lo lleva y el token tiene scopes, `403`. Funciona porque `protect` va en cada ruta, nunca en un `router.use`.
- `scope` en OAuth: permisos separados por espacios. Vacío o `trincaunt` es acceso completo (el conector de Claude sigue igual). Uno desconocido es `invalid_scope`.

### Cliente confidencial

- `configuredClients()` en `OAuthService`: si están `CGSSHOPPINGS_URL` y `CGSSHOPPINGS_CLIENT_SECRET`, existe el cliente `cgsshoppings` con su única URL de vuelta (`<CGSSHOPPINGS_URL>/api/integrations/trincaunt/callback`) y sus scopes permitidos. Si no pide scopes recibe esos; no puede pedir acceso completo ni otros.
- `POST /oauth/token` acepta `client_secret_basic` (cabecera `Authorization: Basic`) y `client_secret_post`. Para un cliente con secreto, sin él o con otro: `401 invalid_client`. El secreto se compara en tiempo constante (`timingSafeEqual` sobre los sha256).
- El token se guarda con sus `scopes` y `cliente`, y antes se borran los que ese cliente le dio a ese usuario.
- `POST /oauth/revoke` (RFC 7009): solo clientes confidenciales, solo sus tokens; responde `200` aunque el token no exista.
- Metadatos (`/.well-known/oauth-authorization-server`): `scopes_supported`, `revocation_endpoint` y los métodos de autenticación del cliente.

### Cliente web

- La pantalla de permiso enumera los permisos («cgsshoppings quiere acceder a tu cuenta solo para: …»). Sin scopes, el texto de siempre.
- En Preferencias, un token con scopes dice «Solo puede: …».

## Cambios en cgsshoppings

- `src/trincaunt-oauth.ts`:
  - `startAuthorization(userName)`: genera `state` y `code_verifier`, guarda `{ stateHash, verifier, userName, expiresAt }` en `oauthStates` (índice TTL de 10 minutos; solo el hash del `state`) y devuelve la URL de `authorize`.
  - `takeState(state)`: lo busca por su hash y lo borra (de un solo uso).
  - `exchangeCode(code, verifier)` y `revokeToken(token)`, con el secreto en `Authorization: Basic`.
- `POST /api/integrations/trincaunt/oauth/start` (con sesión) devuelve `{ url }`.
- `GET /api/integrations/trincaunt/callback` va **antes** del middleware del token: el navegador llega desde Trincaunt sin el JWT de cgsshoppings (va en una cabecera, no en una cookie). El `state` dice quién es. Canjea el código, comprueba el token y lo guarda como en la fase 1 (`connectWithToken`, que comparte con «pegar un token»), con `viaOAuth: true`. Redirige a `/account?trincaunt=ok`, `cancelado` o `error`. Con `&tokenViejo=1` si antes había un token pegado, que ya se puede borrar.
- «Desconectar» revoca el token si vino de OAuth; pegar un token después de conectar con OAuth también revoca el anterior.
- En Cuenta: botón **«Conectar con Trincaunt»** y debajo «o pega un token». Al volver, el mensaje y se limpia `?trincaunt=` de la dirección.
- Variables: `TRINCAUNT_CLIENT_SECRET` (el mismo secreto que en Trincaunt) y `APP_URL`. Sin ellas solo se puede pegar un token.

## Seguridad

- El `code_verifier` y el secreto no salen del servidor de cgsshoppings. El navegador solo ve el `state`, el `code_challenge` y el código, que sin el verifier y el secreto no sirve.
- `state` de un solo uso y con caducidad: un enlace de callback fabricado por otro (CSRF) no tiene un `state` guardado, y no se puede repetir uno usado.
- La URL de vuelta es fija en Trincaunt: no se puede pedir un código para otra dirección.
- Un token filtrado de cgsshoppings no puede leer ni borrar gastos, ni gestionar tokens o grupos.

## Pruebas

- Trincaunt: `scopes` en el código y el token; cliente público con y sin scopes; cliente confidencial (solo si está configurado, URL fija, sus scopes, secreto por Basic y por cuerpo, secreto incorrecto); sustituir tokens al reconectar; revocar; `requireScope` y el cierre por defecto, también montados en un `Router` de Express de verdad; la pantalla de permiso y Preferencias con permisos.
- cgsshoppings: la URL de `authorize` (PKCE, `state` guardado solo por su hash), `state` de un solo uso y caducado, canje con Basic, revocar sin lanzar, el callback (conecta, `tokenViejo`, cancelado, `state` desconocido, código rechazado) y el componente de Cuenta.
- E2E local (2026-11-18) con los dos servidores y un Mongo desechable, sin navegador (las peticiones del navegador hechas a mano): el botón da la URL con los scopes; `authorize` manda a la pantalla de permiso, que enumera los tres permisos; al permitir vuelve al callback con un código; el callback conecta con el grupo personal y avisa del token pegado; repetirlo no hace nada; Trincaunt guarda un token con los scopes; una compra se envía con él; reconectar deja un solo token; cancelar vuelve como `cancelado`; desconectar borra el token en Trincaunt y deja el pegado.

## Despliegue

1. Generar el secreto **en el EC2** (`openssl rand -base64 32`) y ponerlo en `~/trincaunt/.env` como `CGSSHOPPINGS_CLIENT_SECRET` y en `~/cgsshoppings/.env` como `TRINCAUNT_CLIENT_SECRET`, sin enseñarlo. `CGSSHOPPINGS_URL` ya tiene valor por defecto en el `docker-compose.yml`.
2. Desplegar Trincaunt. Los tokens que ya existen no tienen scopes y siguen funcionando igual.
3. Desplegar cgsshoppings. Quien ya está conectado con un token pegado sigue conectado; el botón aparece al desconectar o si Trincaunt deja de aceptar el token.

## Para más adelante

- Token corto con refresh token.
- Que cgsshoppings ofrezca pasar de un token pegado a OAuth sin desconectar.
