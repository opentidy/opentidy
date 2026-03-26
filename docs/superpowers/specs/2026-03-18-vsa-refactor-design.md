# VSA Refactor: OpenTidy Backend + Frontend Reorganization

**Date:** 2026-03-18
**Status:** Approved
**Scope:** Backend (full VSA), Frontend (feature grouping, shared store/API), Shared package (unchanged)

## Goal

Reorganize the OpenTidy codebase to follow Vertical Slice Architecture (VSA) principles, optimized for agent-based maintenance (Claude Code). An agent should be able to open one feature directory and have full context: route, handler, logic, and tests.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Slice granularity | Hybrid domain + use-case | Domain folders with per-use-case files. Avoids 50+ micro-slices (pure use-case) and monolithic slices (pure domain). |
| Route placement | Colocalized in slice | Each feature file exports its Hono route. `server.ts` assembles them. Agent sees route + handler + logic in one file. |
| Cross-cutting code | Flat `shared/` | DB, locks, SSE, spawn-claude, config, all < 100 lines each. No sub-folders needed. |
| Tests | Colocalized | `create.ts` + `create.test.ts` in same directory. Agent opens one folder, sees everything. |
| Frontend | Feature grouping only | Components/pages grouped by domain. Store and API stay centralized (app is small, store is interconnected). |
| Shared package | Unchanged | 275 lines total. Agent reads it in one shot. |
| CLI | Unchanged | Entry point, not a domain. Already well-organized after setup split. |

## Cross-Feature Dependency Rules

Features may import from `shared/` freely. Cross-feature imports follow a strict unidirectional graph:

```
triage → sessions → dossiers
checkup → sessions → dossiers
notifications (standalone, receives deps via DI)
hooks (standalone, receives deps via DI)
system (standalone)
memory (standalone)
suggestions (standalone)
ameliorations (standalone)
terminal (standalone)
```

**Allowed:** `features/triage/route.ts` imports from `features/sessions/launch.ts`.
**Forbidden:** `features/dossiers/*` imports from `features/sessions/*`.

Cross-feature dependencies are injected via the `deps` parameter (same factory pattern as today), not direct imports. The dependency graph above documents which features' deps include references to other features.

## Backend Target Structure

```
apps/backend/src/
  features/
    dossiers/
      create.ts                 # POST /api/dossiers
      list.ts                   # GET /api/dossiers
      get.ts                    # GET /api/dossiers/:id
      instruct.ts               # POST /api/dossiers/:id/instruction
      complete.ts               # POST /api/dossiers/:id/complete
      upload.ts                 # POST /api/dossiers/:id/artifacts
      download.ts               # GET /api/dossiers/:id/artifacts/:name
      state.ts                  # state.md parser (internal to slice)
      title.ts                  # title generation via claude -p
      create.test.ts
      list.test.ts
      get.test.ts
      instruct.test.ts
      complete.test.ts
      state.test.ts
      title.test.ts
    sessions/
      launch.ts                 # POST /api/sessions/:id/launch
      stop.ts                   # POST /api/sessions/:id/stop
      list.ts                   # GET /api/sessions
      take-over.ts              # POST /api/sessions/:id/take-over
      hand-back.ts              # POST /api/sessions/:id/hand-back
      recover.ts                # crash recovery at boot
      post-session.ts           # handleAutonomousExit, memory extraction
      claude-md.ts              # dossier CLAUDE.md generation
      executor.ts               # tmux CLI wrapper
      launch.test.ts
      stop.test.ts
      recover.test.ts
      post-session.test.ts
      executor.test.ts
    triage/
      webhook.ts                # POST /api/webhooks/gmail
      mail-reader.ts            # AppleScript Mail.app polling
      sms-reader.ts             # AppleScript Messages.app polling
      macos-receivers.ts        # macOS-specific receiver helpers
      plugin.ts                 # receiver plugin loader
      classify.ts               # one-shot claude -p triage
      route.ts                  # dispatch triage result
      watchers.ts               # polling watcher abstraction
      webhook.test.ts
      classify.test.ts
      route.test.ts
      watchers.test.ts
      mail-reader.test.ts
      sms-reader.test.ts
      macos-receivers.test.ts
      plugin.test.ts
    memory/
      list.ts                   # GET /api/memory
      create.ts                 # POST /api/memory
      read.ts                   # GET /api/memory/:category/:name
      update.ts                 # PUT /api/memory/:category/:name
      archive.ts                # POST /api/memory/:category/:name/archive
      prompt.ts                 # POST /api/memory/prompt
      manager.ts                # file I/O, INDEX.md
      agents.ts                 # injection + extraction prompts
      lock.ts                   # memory process lock
      api.test.ts               # integration tests (was tests/api/memory.test.ts)
      adversarial.test.ts       # security tests (was tests/memory/adversarial.test.ts)
      manager.test.ts
      agents.test.ts
      lock.test.ts
    suggestions/
      list.ts                   # GET /api/suggestions
      approve.ts                # POST /api/suggestions/:slug/approve
      dismiss.ts                # POST /api/suggestions/:slug/ignore
      parser.ts                 # suggestion file reader
      list.test.ts
      approve.test.ts
      dismiss.test.ts
      parser.test.ts
    ameliorations/
      list.ts                   # GET /api/ameliorations
      resolve.ts                # POST /api/ameliorations/resolve
      gaps.ts                   # gaps.md parser
      list.test.ts
      resolve.test.ts
      gaps.test.ts
    hooks/
      handler.ts                # POST /api/hooks
      handler.test.ts
    notifications/
      telegram.ts               # send checkpoint/completion/escalation
      list.ts                   # GET /api/notifications/recent
      store.ts                  # notification record DB
      telegram.test.ts
      store.test.ts
    checkup/
      sweep.ts                  # periodic workspace analyzer + POST /api/checkup
      watchdog.ts               # fs.watch debouncer (used by boot/)
      sweep.test.ts
      watchdog.test.ts
    terminal/
      bridge.ts                 # ttyd spawner + GET /api/terminal/:session/port
      bridge.test.ts
    system/
      health.ts                 # GET /api/health
      reset.ts                  # POST /api/reset
      test-tasks.ts             # POST /api/test-tasks + fixture definitions
      audit.ts                  # GET /api/audit + JSONL logger
      processes.ts              # GET /api/claude-processes
      events.ts                 # GET /api/events (SSE)
      adversarial.test.ts       # cross-feature security tests
      edge-cases.test.ts        # cross-module edge case tests
      audit.test.ts
      processes.test.ts
  shared/
    database.ts                 # SQLite schema + migrations
    auth.ts                     # bearer token middleware
    locks.ts                    # PID-based dossier locks
    dedup.ts                    # content hash dedup
    spawn-claude.ts             # claude spawner + semaphore
    claude-semaphore.ts         # concurrency limiter
    claude-tracker.ts           # SQLite process tracking
    sse.ts                      # SSE emitter
    slug.ts                     # slug generator
    memory-context.ts           # format memory entries
    config.ts                   # config loader
    paths.ts                    # path resolver
    platform/
      clipboard.ts              # clipboard command resolver
      service-installer.ts      # LaunchAgent/systemd generator
      clipboard.test.ts
      service-installer.test.ts
    test-helpers/
      mock-deps.ts              # shared makeDeps()
      mock-request.ts           # shared req() helper
      tmpdir.ts                 # shared useTmpDir()
    database.test.ts
    auth.test.ts
    locks.test.ts
    dedup.test.ts
    spawn-claude.test.ts
    claude-tracker.test.ts
    sse.test.ts
    slug.test.ts
    config.test.ts
    paths.test.ts
  cli/
    cli.ts                      # CLI router (was src/cli.ts)
    setup.ts                    # setup orchestrator
    setup/                      # (already split, unchanged)
    doctor.ts
    status.ts
    logs.ts
    update.ts
    uninstall.ts
    install-service.ts
    cli.test.ts
    uninstall.test.ts
  boot/
    periodic-tasks.ts           # intervals + watchdog + crash recovery + updater
    updater.ts                  # GitHub release checker (if kept separate)
  server.ts                     # pure assembler; imports feature routes, mounts them
  server.test.ts                # server-level tests
  index.ts                      # boot orchestrator; deps → server → periodic → listen
  daemon.ts                     # process supervisor
  daemon.test.ts
```

## Frontend Target Structure

```
apps/web/src/
  features/
    dossiers/
      DossierCard.tsx
      DossierCard.test.tsx
      DossierDetail.tsx
      Sidebar.tsx
      StateRenderer.tsx
    sessions/
      SessionCard.tsx
      SessionOutput.tsx
    ameliorations/
      AmeliorationCard.tsx
      Ameliorations.tsx
    memory/
      Memory.tsx
    terminal/
      Terminal.tsx
      PlainTextOutput.tsx
      ProcessOutput.tsx
      LiveProcessOutput.tsx
    nouveau/
      Nouveau.tsx
    home/
      Home.tsx
  shared/
    Layout.tsx
    ErrorBanner.tsx
    DesktopNav.tsx
    MobileNav.tsx
    InstructionBar.tsx
    SuggestionCard.tsx           # used by both home/ and nouveau/
    SuggestionCard.test.tsx
    store.ts                     # single Zustand store (not fragmented)
    store.test.ts
    api.ts                       # single API client (not fragmented)
    api.test.ts
    utils/
      format.ts
      status-colors.ts
    i18n/
      i18n.ts
      locales/en.json
      locales/fr.json
  App.tsx
  main.tsx
  index.css                      # global Tailwind CSS
  tests/
    e2e/                         # E2E tests stay separate (cross-feature by nature)
      fixtures/mock-api.ts
      *.spec.ts
```

## Migration Map

### Backend

| Current Path | VSA Path |
|--------------|----------|
| `routes/dossiers.ts` | Split → `features/dossiers/create.ts`, `list.ts`, `get.ts`, `instruct.ts`, `complete.ts`, `upload.ts`, `download.ts` |
| `routes/sessions.ts` | Split → `features/sessions/launch.ts`, `stop.ts`, `list.ts` |
| `routes/memory.ts` | Split → `features/memory/list.ts`, `create.ts`, `read.ts`, `update.ts`, `archive.ts`, `prompt.ts` |
| `routes/suggestions.ts` | Split → `features/suggestions/list.ts`, `approve.ts`, `dismiss.ts` |
| `routes/hooks.ts` | → `features/hooks/handler.ts` |
| `routes/system.ts` | Split → `features/system/health.ts`, `reset.ts`, `test-tasks.ts`, `audit.ts`, `processes.ts`, `events.ts` |
| `launcher/session.ts` | → `features/sessions/launch.ts` |
| `launcher/post-session.ts` | → `features/sessions/post-session.ts` |
| `launcher/claude-md.ts` | → `features/sessions/claude-md.ts` |
| `launcher/tmux-executor.ts` | → `features/sessions/executor.ts` |
| `launcher/checkup.ts` | → `features/checkup/sweep.ts` |
| `launcher/watchdog.ts` | → `boot/periodic-tasks.ts` (already partially there) |
| `workspace/state.ts` | → `features/dossiers/state.ts` |
| `workspace/dossier.ts` | Merged into `features/dossiers/create.ts` |
| `workspace/gaps.ts` | → `features/ameliorations/gaps.ts` |
| `workspace/suggestions.ts` | → `features/suggestions/parser.ts` |
| `workspace/title.ts` | → `features/dossiers/title.ts` |
| `receiver/webhook.ts` | → `features/triage/webhook.ts` |
| `receiver/triage.ts` | → `features/triage/classify.ts` |
| `receiver/mail-reader.ts` | → `features/triage/mail-reader.ts` |
| `receiver/sms-reader.ts` | → `features/triage/sms-reader.ts` |
| `receiver/watchers.ts` | → `features/triage/watchers.ts` |
| `receiver/plugin.ts` | → `features/triage/plugin.ts` |
| `memory/manager.ts` | → `features/memory/manager.ts` |
| `memory/agents.ts` | → `features/memory/agents.ts` |
| `memory/lock.ts` | → `features/memory/lock.ts` |
| `hooks/handler.ts` | → `features/hooks/handler.ts` |
| `notifications/telegram.ts` | → `features/notifications/telegram.ts` |
| `infra/notification-store.ts` | → `features/notifications/store.ts` |
| `infra/database.ts` | → `shared/database.ts` |
| `infra/locks.ts` | → `shared/locks.ts` |
| `infra/dedup.ts` | → `shared/dedup.ts` |
| `infra/spawn-claude.ts` | → `shared/spawn-claude.ts` |
| `infra/claude-semaphore.ts` | → `shared/claude-semaphore.ts` |
| `infra/claude-tracker.ts` | → `shared/claude-tracker.ts` |
| `infra/audit.ts` | → `features/system/audit.ts` |
| `infra/updater.ts` | → `boot/periodic-tasks.ts` (merged) |
| `sse/emitter.ts` | → `shared/sse.ts` |
| `terminal/bridge.ts` | → `features/terminal/bridge.ts` |
| `middleware/auth.ts` | → `shared/auth.ts` |
| `utils/slug.ts` | → `shared/slug.ts` |
| `utils/memory-context.ts` | → `shared/memory-context.ts` |
| `utils/triage-handler.ts` | → `features/triage/route.ts` |
| `fixtures/test-tasks.ts` | → `features/system/test-tasks.ts` (merged) |
| `config.ts` | → `shared/config.ts` |
| `paths.ts` | → `shared/paths.ts` |
| `platform/clipboard.ts` | → `shared/platform/clipboard.ts` |
| `platform/service-installer.ts` | → `shared/platform/service-installer.ts` |
| `memory/index.ts` | Deleted, no barrel files in VSA, direct imports only |

### Frontend

| Current Path | VSA Path |
|--------------|----------|
| `pages/Home.tsx` | → `features/home/Home.tsx` |
| `pages/DossierDetail.tsx` | → `features/dossiers/DossierDetail.tsx` |
| `pages/Ameliorations.tsx` | → `features/ameliorations/Ameliorations.tsx` |
| `pages/Memory.tsx` | → `features/memory/Memory.tsx` |
| `pages/Terminal.tsx` | → `features/terminal/Terminal.tsx` |
| `pages/Nouveau.tsx` | → `features/nouveau/Nouveau.tsx` |
| `components/DossierCard.tsx` | → `features/dossiers/DossierCard.tsx` |
| `components/SessionCard.tsx` | → `features/sessions/SessionCard.tsx` |
| `components/SessionOutput.tsx` | → `features/sessions/SessionOutput.tsx` |
| `components/Sidebar.tsx` | → `features/dossiers/Sidebar.tsx` |
| `components/StateRenderer.tsx` | → `features/dossiers/StateRenderer.tsx` |
| `components/SuggestionCard.tsx` | → `shared/SuggestionCard.tsx` (used by both home/ and nouveau/) |
| `components/AmeliorationCard.tsx` | → `features/ameliorations/AmeliorationCard.tsx` |
| `components/terminal/PlainTextOutput.tsx` | → `features/terminal/PlainTextOutput.tsx` |
| `components/terminal/ProcessOutput.tsx` | → `features/terminal/ProcessOutput.tsx` |
| `components/terminal/LiveProcessOutput.tsx` | → `features/terminal/LiveProcessOutput.tsx` |
| `components/Layout.tsx` | → `shared/Layout.tsx` |
| `components/ErrorBanner.tsx` | → `shared/ErrorBanner.tsx` |
| `components/DesktopNav.tsx` | → `shared/DesktopNav.tsx` |
| `components/MobileNav.tsx` | → `shared/MobileNav.tsx` |
| `components/InstructionBar.tsx` | → `shared/InstructionBar.tsx` |
| `store.ts` | → `shared/store.ts` |
| `api.ts` | → `shared/api.ts` |
| `utils/format.ts` | → `shared/utils/format.ts` |
| `utils/status-colors.ts` | → `shared/utils/status-colors.ts` |
| `i18n/` | → `shared/i18n/` |

### Tests Migration

All test files move from `apps/backend/tests/` to colocate with their source in `features/` or `shared/`:

| Current Test Path | VSA Path |
|-------------------|----------|
| `tests/workspace/state.test.ts` | `features/dossiers/state.test.ts` |
| `tests/workspace/dossier.test.ts` | `features/dossiers/create.test.ts` |
| `tests/workspace/gaps.test.ts` | `features/ameliorations/gaps.test.ts` |
| `tests/workspace/suggestions.test.ts` | `features/suggestions/parser.test.ts` |
| `tests/workspace/title.test.ts` | `features/dossiers/title.test.ts` |
| `tests/launcher/session.test.ts` | `features/sessions/launch.test.ts` |
| `tests/launcher/checkup.test.ts` | `features/checkup/sweep.test.ts` |
| `tests/launcher/watchdog.test.ts` | `features/checkup/watchdog.test.ts` |
| `tests/memory/manager.test.ts` | `features/memory/manager.test.ts` |
| `tests/memory/agents.test.ts` | `features/memory/agents.test.ts` |
| `tests/memory/lock.test.ts` | `features/memory/lock.test.ts` |
| `tests/memory/adversarial.test.ts` | `features/memory/adversarial.test.ts` |
| `tests/receiver/webhook.test.ts` | `features/triage/webhook.test.ts` |
| `tests/receiver/triage.test.ts` | `features/triage/classify.test.ts` |
| `tests/receiver/watchers.test.ts` | `features/triage/watchers.test.ts` |
| `tests/receiver/mail-reader.test.ts` | `features/triage/mail-reader.test.ts` |
| `tests/receiver/sms-reader.test.ts` | `features/triage/sms-reader.test.ts` |
| `tests/receiver/plugin.test.ts` | `features/triage/plugin.test.ts` |
| `tests/hooks/handler.test.ts` | `features/hooks/handler.test.ts` |
| `tests/notifications/telegram.test.ts` | `features/notifications/telegram.test.ts` |
| `tests/infra/audit.test.ts` | `features/system/audit.test.ts` |
| `tests/infra/database.test.ts` | `shared/database.test.ts` |
| `tests/infra/locks.test.ts` | `shared/locks.test.ts` |
| `tests/infra/dedup.test.ts` | `shared/dedup.test.ts` |
| `tests/infra/spawn-claude.test.ts` | `shared/spawn-claude.test.ts` |
| `tests/infra/claude-tracker.test.ts` | `shared/claude-tracker.test.ts` |
| `tests/infra/notification-store.test.ts` | `features/notifications/store.test.ts` |
| `tests/infra/updater.test.ts` | (merged into boot/) |
| `tests/terminal/bridge.test.ts` | `features/terminal/bridge.test.ts` |
| `tests/middleware/auth.test.ts` | `shared/auth.test.ts` or inline in server |
| `tests/sse/emitter.test.ts` | `shared/sse.test.ts` |
| `tests/api/memory.test.ts` | `features/memory/api.test.ts` |
| `tests/api/adversarial.test.ts` | Split across relevant features or `features/system/adversarial.test.ts` |
| `tests/routes/api.test.ts` | Split across relevant features |
| `tests/server.test.ts` | `server.test.ts` (stays at root) |
| `tests/edge-cases/edge-cases.test.ts` | `features/system/edge-cases.test.ts` |
| `tests/helpers/` | → `shared/test-helpers/` |
| `tests/config.test.ts` | → `shared/config.test.ts` |
| `tests/cli.test.ts` | → `cli/cli.test.ts` |
| `tests/cli/uninstall.test.ts` | → `cli/uninstall.test.ts` |
| `tests/daemon.test.ts` | → `daemon.test.ts` (stays at root) |
| `tests/paths.test.ts` | → `shared/paths.test.ts` |
| `tests/platform/clipboard.test.ts` | → `shared/platform/clipboard.test.ts` |
| `tests/platform/service-installer.test.ts` | → `shared/platform/service-installer.test.ts` |
| `tests/receiver/macos-receivers.test.ts` | → `features/triage/macos-receivers.test.ts` |

### Frontend Tests Migration

| Current Test Path | VSA Path |
|-------------------|----------|
| `tests/api/api.test.ts` | → `shared/api.test.ts` |
| `tests/components/DossierCard.test.tsx` | → `features/dossiers/DossierCard.test.tsx` |
| `tests/components/SuggestionCard.test.tsx` | → `shared/SuggestionCard.test.tsx` |
| `tests/pages/Ameliorations.test.tsx` | → `features/ameliorations/Ameliorations.test.tsx` |
| `tests/pages/Home.test.tsx` | → `features/home/Home.test.tsx` |
| `tests/store/store.test.ts` | → `shared/store.test.ts` |
| `tests/e2e/` | Stays at `tests/e2e/`, E2E tests are cross-feature by nature, no colocation benefit |
| `tests/e2e/fixtures/mock-api.ts` | Stays at `tests/e2e/fixtures/mock-api.ts` |

## Migration Order

Each step must end with passing tests. Steps can be parallelized where noted.

1. **Move `shared/`**: `infra/*` → `shared/`, `utils/*` → `shared/`, `middleware/auth.ts` → `shared/auth.ts`, `config.ts` → `shared/config.ts`, `paths.ts` → `shared/paths.ts`, `platform/*` → `shared/platform/`. Update all imports. No functional changes.
2. **Move features (parallelizable)**: each feature is independent:
   - `features/dossiers/` ← `workspace/state.ts`, `workspace/dossier.ts`, `workspace/title.ts` + dossier routes from `routes/dossiers.ts`
   - `features/sessions/` ← `launcher/*` + session routes from `routes/sessions.ts`
   - `features/triage/` ← `receiver/*` + `utils/triage-handler.ts` + webhook route from `routes/hooks.ts`
   - `features/memory/` ← `memory/*` + memory routes from `routes/memory.ts`
   - `features/suggestions/` ← `workspace/suggestions.ts` + routes from `routes/suggestions.ts`
   - `features/ameliorations/` ← `workspace/gaps.ts` + amelioration routes from `routes/system.ts`
   - `features/hooks/` ← `hooks/handler.ts` + hook route from `routes/hooks.ts`
   - `features/notifications/` ← `notifications/telegram.ts` + `infra/notification-store.ts` + notification route from `routes/system.ts`
   - `features/checkup/` ← `launcher/checkup.ts` + `launcher/watchdog.ts` + checkup route from `routes/system.ts`
   - `features/terminal/` ← `terminal/bridge.ts` + terminal route from `routes/system.ts`
   - `features/system/` ← remaining routes from `routes/system.ts` + `fixtures/test-tasks.ts` + `infra/audit.ts`
3. **Rewrite `server.ts`**: import all feature routes, mount with `app.route()`
4. **Colocate tests**: move each test file next to its source
5. **Update vitest configs**: change include patterns
6. **Delete old directories**: `routes/`, `launcher/`, `workspace/`, `receiver/`, `memory/`, `infra/`, `hooks/`, `notifications/`, `terminal/`, `sse/`, `middleware/`, `utils/`, `fixtures/`, `tests/` (backend), `pages/`, `components/` (web)
7. **Frontend reorganization**: move web files into `features/` and `shared/`
8. **Delete `memory/index.ts`**: no barrel files in VSA

## Barrel File Policy

No barrel files (`index.ts` re-exports) in the VSA structure. All imports go directly to the source file. This makes it explicit for an agent which file provides what.

## Vitest Config Updates

Both `apps/backend/vitest.config.ts` and `apps/web/vitest.config.ts` need updated include patterns:

```ts
// backend
include: ['src/**/*.test.ts']

// web
include: ['src/**/*.test.{ts,tsx}']
```

## server.ts Assembler Pattern

```ts
import { Hono } from 'hono'
// Feature routes
import { createDossierRoute } from './features/dossiers/create.js'
import { listDossiersRoute } from './features/dossiers/list.js'
// ... all feature routes
export function createApp(deps: AppDeps) {
  const app = new Hono()
  // Auth middleware
  app.use('/api/*', bearerAuth(deps.config))
  // Mount features
  app.route('/api', createDossierRoute(deps))
  app.route('/api', listDossiersRoute(deps))
  // ...
  return app
}
```

## What Does NOT Change

- `packages/shared/`: types.ts, schemas.ts, index.ts (275 lines, SSOT)
- `cli/`: entry point structure (setup/, doctor, status, logs, update, uninstall)
- `boot/periodic-tasks.ts`: already extracted
- `daemon.ts`: process supervisor
- `plugins/opentidy-hooks/`: external hooks
- `bin/opentidy`: CLI wrapper
- External API surface; all HTTP endpoints keep same paths and behavior
- Factory function pattern: `createX()` stays, dependency injection stays

## Constraints

- TypeScript strict everywhere
- Factory functions, no classes
- Progressive logging with `[feature]` prefixes
- Claude timeouts: 1h minimum (3_600_000) on all `claude -p` calls
- SSOT: no type/constant duplication
- React 19: no useMemo/useCallback/React.memo
- Tests must pass after each migration step
