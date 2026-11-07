# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

AGENTS.md has a file index of `api/` and `client/`, but it is stale in places: tests use **Vitest** (not Jest, there is no `jest.config.js`) and the DB is MongoDB via Mongoose.

## Layout
- npm everywhere; root, `api/` and `client/` each have their own `package-lock.json` and `node_modules` (no workspaces). Root also holds Cypress E2E (`cypress/e2e`).
- `mcp/` is a separate npm package (ESM, own lockfile): a stdio MCP server that calls the production API with a personal API token (`trc_…`, created in Preferencias, model `ApiToken`, only the sha256 is stored). Tokens can carry an `admin` flag (only admins can create them); admin routes use `requireAdmin` (role admin and, with a token, that flag) and `hasAdminAccess(req)`. It is not part of the Docker image. When adding or changing API routes the MCP uses, update `mcp/src/tools.ts`. `npx vitest run` + `npm run build` there; CI runs it too.
- Stray ad-hoc scripts exist at the root and in `api/`. Put any new temporary scripts or patches in `/temp/` (gitignored).

## Commands
- Root: `npm start` runs api dev + client together; `npm run cy:run` / `cy:open` for Cypress.
- api (`cd api`): `npm run dev` (nodemon). `npm start` is ts-node, not a production start. `npm run build` -> `dist/`, `npm run start:prod`. No lint script.
- client (`cd client`): `npm start` runs Vite (there is **no** `dev` script, despite the README). `npm run build` = `tsc && vite build`. `npm run lint` uses `--max-warnings 0`.
- `npm test` is **watch mode** in both packages. Use `npx vitest run` for a single pass, or `npx vitest run path/to/file.test.ts -t "name"` for one test.
- api tests live in `api/tests/{controllers,services}`; client tests sit next to the source. `api/tsconfig.json` only includes `src/**`, so tests are not type-checked by `tsc`.

## Environment
- `api/.env`: `JWT_SECRET`, `GEMINI_API_KEY`; also reads `MONGO_URI` (default `mongodb://localhost:27017/trincaunt`), `PORT` (default 3000), `NODE_ENV`. Copy `api/.env.example` and `client/.env.example` to `.env`.
- `client/.env*`: `VITE_API_HOST` (and `VITE_API_BASE_URL`).
- `docker-compose.yml` runs the production image `ghcr.io/carljark/trincaunt:latest`: app on `127.0.0.1:3100` only (host nginx proxies it), mongo has no published port (reachable only inside the compose network, own `mongo_data` volume). For local dev use root `npm start` against a local mongo on 27017; to test on a phone, run the client with `npm start --prefix client -- --host`.

## Gotchas
- Gemini (`AiService`) is initialised lazily to avoid a dotenv timing bug. Don't instantiate `GoogleGenAI` at module top level.
- `server.ts` runs DB migrations (`api/src/migrations/runner`) on startup; Socket.IO shares the HTTP server (`api/src/config/socket`).
- In production the Express server serves `client/dist` via `path.join(__dirname, '../../client/dist')` in `api/src/app.ts`. `tsc` emits flat to `api/dist/` (so `dist/server.js`), which matches the Dockerfile layout (`/app/api/dist` + `/app/client/dist`). Ignore any stale `dist/src/`.
- Styles: SCSS, one co-located `.scss` per component/page, shared variables in `client/src/styles/abstracts/_variables.scss`.
- Any style change uses **BEM** (one block per component, `block__element--modifier`) and migrates the touched component off the old global classes. Load the `styles-bem` skill before editing `.scss` or `className`s.

## Git
- Branches: `feature/<name>`; PRs target `main`.
- **Merging into `main` deploys to production.** `.github/workflows/deploy.yml` runs after CI passes on `main`: it builds the image on a GitHub runner (amd64), pushes it to GHCR (`ghcr.io/carljark/trincaunt:sha-<commit>` and `:latest`), rsyncs the commit to the EC2 and runs `scripts/remote_up.sh` there (pull, `docker compose up -d --no-build`, prune, nginx). It can also be run by hand from the Actions tab with a `ref` (rollback). Repo config: secret `EC2_SSH_KEY` (a key only for this workflow), variables `EC2_HOST`, `EC2_USER`, `EC2_KNOWN_HOSTS`, `DOMAIN`.
- `./deploy.sh` is the entry point. From a clean `feature/*` branch: push, PR, wait for CI, merge, then follow the Deploy run until it finishes and check the site answers 200. From `main`: dispatches the Deploy workflow for `main`. `--local` (only from `main`) is the fallback without GitHub Actions: builds on this machine (needs Docker) via `scripts/sync_to_ec2.sh`, `docker save | docker load` over SSH. There is no `--merge-only` any more.
- Both paths ship exactly the commit (`git archive`) and sync with `rsync --delete`, so the EC2 copy mirrors it; uncommitted and untracked files are never deployed. Anything that must live only on the server needs an `--exclude` in both `deploy.yml` and `sync_to_ec2.sh`, or it gets deleted. The EC2 (~900 MB RAM) never builds. Keep the Dockerfile build stages on `--platform=$BUILDPLATFORM`: esbuild crashes under QEMU (`fatal error: lfstack.push`) when emulating amd64 on an arm64 Mac (matters for `--local`).
- Since merging deploys, Claude merges (with `./deploy.sh` or `gh pr merge`) **only when the user asks to deploy or to merge**; otherwise it stops at an open PR with green checks. Before merging, `gh pr checks <n> --watch` must show every check passing. Always `--merge` (never squash, never `--admin`), run `gh pr merge` as its own command, then `git checkout main && git pull`.
- Commit messages: Conventional Commits with a scope, e.g. `feat(api): ...`, `fix(client): ...`, `style(client): ...`.
