# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

AGENTS.md has a file index of `api/` and `client/`, but it is stale in places: tests use **Vitest** (not Jest, there is no `jest.config.js`) and the DB is MongoDB via Mongoose.

## Layout
- npm everywhere; root, `api/` and `client/` each have their own `package-lock.json` and `node_modules` (no workspaces). Root also holds Cypress E2E (`cypress/e2e`).
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
- `docker-compose.yml`: mongo on host port 27019, app on 3100.

## Gotchas
- Gemini (`AiService`) is initialised lazily to avoid a dotenv timing bug. Don't instantiate `GoogleGenAI` at module top level.
- `server.ts` runs DB migrations (`api/src/migrations/runner`) on startup; Socket.IO shares the HTTP server (`api/src/config/socket`).
- In production the Express server serves `client/dist` via `path.join(__dirname, '../../client/dist')` in `api/src/app.ts`. `tsc` emits flat to `api/dist/` (so `dist/server.js`), which matches the Dockerfile layout (`/app/api/dist` + `/app/client/dist`). Ignore any stale `dist/src/`.
- Styles: SCSS, one co-located `.scss` per component/page, shared variables in `client/src/styles/abstracts/_variables.scss`.
- Any style change uses **BEM** (one block per component, `block__element--modifier`) and migrates the touched component off the old global classes. Load the `styles-bem` skill before editing `.scss` or `className`s.

## Git
- Branches: `feature/<name>`; PRs target `main`.
- `scripts/ship.sh` does the whole flow from a clean `feature/*` branch: push, PR, wait for CI, merge, `./deploy.sh` from `main` (`--no-deploy` to stop after the merge).
- Claude may merge its own PRs without asking (`.claude/settings.json` allows `gh pr merge`), but only after `gh pr checks <n> --watch` shows every check passing. Always `--merge` (never squash, never `--admin`), run `gh pr merge` as its own command, then `git checkout main && git pull` before deploying.
- Commit messages: Conventional Commits with a scope, e.g. `feat(api): ...`, `fix(client): ...`, `style(client): ...`.
