# Contributing to OpenTidy

Thank you for your interest in contributing! This guide covers everything you need to set up a development environment and submit changes.

## Development setup

### Prerequisites

- **Node.js** >= 22
- **pnpm** >= 10.6 (`corepack enable` to get it)
- **Claude Code** CLI (for running integration tests)
- **Git**

### Clone and install

```bash
git clone https://github.com/opentidy/opentidy.git
cd opentidy
pnpm install
pnpm build
```

> `pnpm install` automatically builds the shared package via the `prepare` script.
> If you see `Cannot find module @opentidy/shared`, run `pnpm --filter @opentidy/shared build`.

### Project structure

```
opentidy/
├── pnpm-workspace.yaml
├── packages/
│   └── shared/              # TypeScript types, Zod schemas (SSOT)
├── apps/
│   ├── backend/             # Hono API, daemon, launcher, receiver
│   └── web/                 # React 19 SPA, Vite
├── plugins/
│   └── opentidy-hooks/      # PreToolUse hook scripts
├── bin/
│   └── opentidy             # CLI wrapper
├── workspace/               # Runtime data (gitignored)
└── docs/                    # Documentation
```

This is a **pnpm monorepo** with three workspaces:
- `@opentidy/shared` — shared types and Zod schemas
- `@opentidy/backend` — the main backend server
- `@opentidy/web` — the web dashboard

### Running in development

```bash
pnpm dev                    # starts backend + web in parallel
```

Or individually:

```bash
pnpm --filter @opentidy/backend dev    # backend only
pnpm --filter @opentidy/web dev        # web dashboard only
pnpm --filter @opentidy/shared build   # rebuild shared types
```

The backend runs on `http://localhost:5175`, the web dashboard on `http://localhost:5173`.

### Useful scripts

```bash
./scripts/reset-dev.sh      # kill processes, wipe workspace, restart clean
```

For manual E2E testing against a realistic workspace, see `apps/backend/scripts/README-smoke.md`.

## Quality checks

Run these before submitting a PR:

```bash
pnpm lint                   # ESLint on all workspaces
pnpm format:check           # Prettier format check
pnpm typecheck              # tsc --noEmit on all workspaces
pnpm test                   # unit tests (backend + web)
pnpm test:e2e               # Playwright E2E tests
```

To auto-fix formatting:

```bash
pnpm format                 # Prettier auto-fix
```

CI runs `lint`, `build`, and `test` on every pull request.

## Testing

### Backend tests (Vitest)

```bash
pnpm test                              # all tests
pnpm --filter @opentidy/backend test   # backend only
```

Tests are colocated with source files (`create.ts` + `create.test.ts` in the same directory).

### E2E tests (Playwright)

```bash
pnpm test:e2e
```

E2E tests run against a mock API — no real backend needed. See `apps/web/tests/e2e/fixtures/mock-api.ts` for the mock data setup.

### Writing tests

- Every code change should include appropriate tests
- Use factory function mocking (not DI frameworks)
- Test files are colocated: `feature.ts` → `feature.test.ts` in the same directory
- Use the `makeDeps()` helper from `shared/test-helpers/mock-deps.ts` for backend tests
- Use `useTmpDir()` from `shared/test-helpers/tmpdir.ts` for filesystem tests
- Use `createTestApp()` and `req()` from `shared/test-helpers/mock-request.ts` for route tests

### Adding a new feature (VSA pattern)

OpenTidy uses **Vertical Slice Architecture** — each feature is self-contained. To add a new feature:

1. **Define types and schemas** in `packages/shared/src/` (types in `types.ts`, Zod schemas in `schemas.ts`)
2. **Create the feature directory** under `apps/backend/src/features/<name>/`
3. **Implement route handlers** as factory functions: `export function featureRoutes(deps: AppDeps) { ... }`
4. **Wire routes** in `apps/backend/src/server.ts`
5. **Write colocated tests** (`handler.ts` + `handler.test.ts`)
6. **Add the SPDX header** to every new `.ts`/`.tsx` file:
   ```typescript
   // SPDX-License-Identifier: AGPL-3.0-only
   // Copyright (c) 2026 Loaddr Ltd
   ```

Look at `features/modules/` or `features/suggestions/` for well-structured examples.

## Code style

### TypeScript

- **Strict mode** everywhere
- **Zod** for validation — schemas live in `packages/shared`
- **Factory functions** — no classes. Each module exports `createX()` returning an interface. This makes mocking easy in tests.
- **Single Source of Truth** — never duplicate types, constants, or state

### Logging

Progressive logging with service prefixes:

```typescript
console.error('[launcher] Failed to spawn session', { jobId, error: err.message });
console.warn('[receiver] Dedup collision', { hash });
console.log('[triage] Event routed to job', { jobId });
```

- `console.error` / `console.warn` — always, with enough context to diagnose
- `console.log` — at key boundaries (API route entry, Claude spawn, hook handler)
- Prefix: `[service-name]` (e.g., `[launcher]`, `[receiver]`, `[triage]`)
- No logging inside tight loops or large payloads

### Frontend (React 19)

- **Never** use `useMemo`, `useCallback`, or `React.memo` — React Compiler handles memoization
- Tailwind CSS v4 (CSS-first configuration)
- Zustand for state management
- SSE via native EventSource

## Git conventions

### Commits

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope): message
```

**Types:** `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `ci`

**Scopes:** `backend`, `web`, `shared`, `cli`, `hooks`, `docs`

Examples:
```
feat(backend): add crash recovery for orphaned sessions
fix(web): SSE reconnection after network drop
test(backend): add launcher integration tests
docs: update architecture guide
```

### Branches

- `main` is the default branch
- Create feature branches from `main`: `feat/my-feature`, `fix/my-bug`
- Keep branches focused — one feature or fix per branch

### Pull requests

- Keep PRs focused and reviewable (< 500 lines when possible)
- Include a clear description of what changed and why
- Ensure all checks pass (CI runs lint + build + test)
- Use the PR template

## Architecture decisions

Before making significant architectural changes, please open a discussion or issue first. OpenTidy has strong opinions about its design:

- **Claude does the thinking, code does the plumbing.** Don't add business logic, decision trees, or routing intelligence to the backend.
- **Markdown files are the state layer.** Don't replace workspace files with a database.
- **Hooks are the security layer.** Don't weaken or bypass PreToolUse hooks.

See [Architecture](architecture.md) and [Security](security.md) for full context.

## Troubleshooting

**Build fails with `Cannot find module @opentidy/shared`?**
Run `pnpm --filter @opentidy/shared build` — the shared package must be built before backend/web can use it.

**`pnpm lint` fails?**
Make sure you ran `pnpm install` at the root — ESLint is installed as a root dependency.

**E2E tests fail with browser errors?**
Run `pnpm exec playwright install` to install browser binaries.

## Getting help

- **Issues** — bug reports and feature requests on GitHub
- **Discussions** — questions and ideas on GitHub Discussions

## License

OpenTidy is licensed under [AGPL-3.0](../LICENSE). By contributing, you agree to the [Contributor License Agreement](../CLA.md) — the CLA Assistant bot will guide you through signing on your first PR.
