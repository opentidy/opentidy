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

## Testing

### Backend tests (Vitest)

```bash
pnpm test                              # all tests
pnpm --filter @opentidy/backend test   # backend only
```

Tests mirror the `src/` directory structure under `tests/`. Backend tests use temporary directories for workspace data — never the real workspace.

### E2E tests (Playwright)

```bash
pnpm test:e2e
```

### Writing tests

- Every code change should include appropriate tests
- Use factory function mocking (not DI frameworks)
- Test files go in `tests/` mirroring the `src/` path
- Use `tmpdir` for any workspace/filesystem tests

## Code style

### TypeScript

- **Strict mode** everywhere
- **Zod** for validation — schemas live in `packages/shared`
- **Factory functions** — no classes. Each module exports `createX()` returning an interface. This makes mocking easy in tests.
- **Single Source of Truth** — never duplicate types, constants, or state

### Logging

Progressive logging with service prefixes:

```typescript
console.error('[launcher] Failed to spawn session', { dossierId, error: err.message });
console.warn('[receiver] Dedup collision', { hash });
console.log('[triage] Event routed to dossier', { dossierId });
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
- Ensure all tests pass
- Use the PR template

## Architecture decisions

Before making significant architectural changes, please open a discussion or issue first. OpenTidy has strong opinions about its design:

- **Claude does the thinking, code does the plumbing.** Don't add business logic, decision trees, or routing intelligence to the backend.
- **Markdown files are the state layer.** Don't replace workspace files with a database.
- **Hooks are the security layer.** Don't weaken or bypass PreToolUse hooks.

See [Architecture](architecture.md) and [Security](security.md) for full context.

## Getting help

- **Issues** — bug reports and feature requests on GitHub
- **Discussions** — questions and ideas on GitHub Discussions

## License

Coming soon.
