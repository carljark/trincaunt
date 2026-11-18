# Integración Trincaunt ↔ cgsshoppings

Documentos de diseño para conectar las dos aplicaciones. El proyecto tiene dos objetivos:

1. **Aprender a comunicar dos aplicaciones web**: tokens entre servidores, idempotencia y reintentos, OAuth, webhooks firmados.
2. **Controlar el gasto en la compra**: que lo que se compra con la lista de cgsshoppings acabe en el presupuesto de Trincaunt y que el presupuesto se vea (y mande) al hacer la lista.

## Las dos aplicaciones

| | Trincaunt | cgsshoppings |
|---|---|---|
| Repo | `carljark/trincaunt` | `carljark/cgsshoppings` (carpeta hermana `../cgsshoppings`) |
| Qué hace | Gastos compartidos y presupuesto personal por ciclos | Lista de la compra compartida en tiempo real, recetas |
| Stack | Express 4 + Mongoose, React (Vite) | Express 5 + driver de MongoDB, Angular 22 |
| URL | `https://trincaunt.ddns.net` | `https://cgsshoppings.duckdns.org` |
| Usuarios | Por email, JWT HS256 sin caducidad, tokens de API `trc_…` | Por nombre, JWT RS256 de una semana |
| Datos clave | `Expense` (`monto`, `categoria[]`, `grupo_id`), grupos `personal` con `presupuesto` | `shoppings-<usuario>` (`article`, `grams`, `check`), `recipes`, `products` (frecuencia) |
| Despliegue | Docker en el mismo EC2, puerto local 3100 | Docker en el mismo EC2, puerto local 3300 |

Las dos están detrás del nginx del EC2, cada una con su `docker compose` y su Mongo propio. **No comparten base de datos ni red de Docker**: se hablan por HTTPS con sus URLs públicas, como lo harían dos servicios de empresas distintas.

## Fases

| # | Documento | Qué se consigue | Qué se aprende | Estado |
|---|---|---|---|---|
| 1 | [Gasto desde la compra](01-gasto-desde-la-compra.md) | «Compra hecha» en cgsshoppings crea el gasto en Trincaunt | Token de servidor a servidor, idempotencia, reintentos, clasificar errores | Desplegada el 2026-11-15 ([trincaunt#71](https://github.com/carljark/trincaunt/pull/71), [cgsshoppings#1](https://github.com/carljark/cgsshoppings/pull/1)) |
| 2 | [Conectar con OAuth](02-conectar-con-oauth.md) | Botón «Conectar con Trincaunt» en vez de pegar un token, con permisos limitados | Authorization code + PKCE, `state`, scopes, cliente confidencial, revocación | Implementada, sin desplegar |
| 3 | [Presupuesto en la lista](03-presupuesto-en-la-lista.md) | cgsshoppings enseña cuánto queda del presupuesto de compra | Consumir una API ajena, caché, degradar con elegancia | Esbozo |
| 4 | [El ticket en la compra y precios](04-precios-desde-tickets.md) | A: foto del ticket en «Compra hecha», un gasto por artículo y opción «a medias». B: precio estimado de cada artículo y de la lista | Ficheros entre servidores, operaciones lentas idempotentes, repartir céntimos; webhooks firmados (HMAC) | A desplegada el 2026-11-16 ([trincaunt#74](https://github.com/carljark/trincaunt/pull/74), [cgsshoppings#2](https://github.com/carljark/cgsshoppings/pull/2)); un gasto por artículo, sin desplegar; B esbozo |
| 5 | [Lista desde el presupuesto](05-lista-desde-el-presupuesto.md) | Trincaunt propone una lista que cabe en el presupuesto | Orquestar dos APIs, IA con restricciones | Idea |

Cada fase funciona sola y deja algo útil. Las siguientes se apoyan en las anteriores: la 3 y la 4 son mucho más cómodas con los permisos limitados de la 2, y la 5 necesita los precios de la 4.

### Otra vía: Claude como intermediario

Trincaunt ya tiene servidor MCP (`mcp/` y el conector remoto `/mcp`). Si cgsshoppings tuviera el suyo, Claude podría combinar las dos sin que se conozcan («mira cuánto me queda y quita de la lista lo que no sea necesario»). Es la comunicación más barata de construir, pero solo funciona dentro de una conversación: no sirve para que las apps reaccionen solas. Queda como experimento aparte.

## Principios para todas las fases

- **De servidor a servidor.** El navegador nunca ve un token de la otra app ni la llama directamente (sin CORS, sin tokens en el `localStorage` de otra app).
- **La URL de la otra app la fija la configuración** (`TRINCAUNT_URL`, `CGSSHOPPINGS_URL`), nunca la manda el usuario: así no se puede usar un servidor para hacer peticiones a sitios arbitrarios (SSRF).
- **Toda operación que se reintenta es idempotente.** Si una petición se repite, no se duplica el gasto.
- **Cada app sigue funcionando si la otra está caída.** La integración degrada a «pendiente» o «sin datos», nunca rompe la lista ni el presupuesto.
- **Desplegar primero el lado que expone la API**, y que los cambios en ella sean compatibles hacia atrás (campos nuevos opcionales).
- **Los secretos solo en el `.env` del servidor**, nunca en el repo. Las variables nuevas se documentan en el `.env.example` de cada repo y en su `docker-compose.yml`.

## Cómo trabajar con los dos repos

Arrancar Claude Code en el repo donde va la mayor parte del trabajo de la fase y añadir el otro:

```sh
cd ~/dev/trincaunt
claude --add-dir ../cgsshoppings
```

Ramas, commits y PRs van por separado en cada repo. En cada documento de fase hay una lista de cambios por repo y el orden de despliegue.
