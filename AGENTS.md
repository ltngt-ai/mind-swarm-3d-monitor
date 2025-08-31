# Repository Guidelines

## Project Structure & Module Organization
- `src/`: TypeScript source for the 3D monitor (Three.js, UI, modes).
  - `camera/`, `modes/`, `ui/`, `utils/`, `ws/` plus core modules like `main.ts`, `AgentManager.ts`, `FilesystemVisualizer.ts`.
- `index.html`: Vite entry page loading `src/main.ts`.
- `scripts/`: Utility scripts (e.g., `gen-api-types.sh`).
- `schemas/`: OpenAPI schema used by generators.
- Config: `tsconfig.json`, `vite.config.ts`, `package.json`.

## Build, Test, and Development Commands
- `npm run dev`: Start Vite dev server on `http://localhost:5175`.
- `./start.sh`: Convenience launcher; installs deps if missing and sets `?server=host:port`.
- `npm run typecheck`: TypeScript strict type checking (no emit).
- `npm run build`: Type-check then build production bundle.
- `npm run preview`: Preview the production build locally.
- `npm run gen:api`: Generate TS types from OpenAPI (uses `openapi-typescript`).

Examples:
- `SERVER=myserver.local:8888 ./start.sh`
- `OPENAPI_FILE=schemas/openapi.json npm run gen:api`

## Coding Style & Naming Conventions
- TypeScript, strict mode enabled; prefer explicit types for public APIs.
- Indentation: 2 spaces; trailing commas where sensible.
- Filenames: PascalCase for classes/modules (e.g., `AgentManager.ts`); utility/types may be lower-case (e.g., `types.ts`).
- Naming: PascalCase classes, camelCase functions/vars, UPPER_SNAKE_CASE constants.
- Formatting/Linting: Prettier and ESLint available. Run `npx prettier -w .` and `npx eslint src --ext .ts` before PRs.

## Testing Guidelines
- Vitest is available; no tests yet. Place unit tests near code as `src/**/*\.test.ts`.
- Run with `npx vitest` or add a `test` script if needed.
- Aim to cover rendering-free logic (e.g., state, parsers, utilities) and WebSocket event handling.

## Commit & Pull Request Guidelines
- Commits: Imperative, concise subject lines (<=72 chars). Reference issues/PRs when relevant. Example: `Fix cycle selection to skip invalid cycle 0`.
- PRs: Clear description, linked issues, reproduction steps, and screenshots/GIFs for UI changes. Note any API or config changes.
- Before opening: `npm run typecheck && npm run build`, format, and run preview if UI changed.

## Security & Configuration Tips
- Server selection: `?server=host:port` in URL or env (`MIND_SWARM_HOST`, `MIND_SWARM_PORT`, or `SERVER=host:port` for `start.sh`).
- OpenAPI generation can target a live server via `MIND_SWARM_PORT` or a local file via `OPENAPI_FILE`.
- Default dev port is configured in `vite.config.ts` (5175).
