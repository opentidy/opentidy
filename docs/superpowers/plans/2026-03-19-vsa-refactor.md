# VSA Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize the OpenTidy monorepo into Vertical Slice Architecture for optimal agent-based maintenance.

**Architecture:** Move from layer-based (`infra/`, `launcher/`, `workspace/`, `receiver/`) to feature-based (`features/dossiers/`, `features/sessions/`, `features/triage/`, etc.) with cross-cutting code in `shared/`. Each feature directory is self-contained: route + handler + logic + tests. Frontend gets feature grouping with centralized store/API.

**Tech Stack:** TypeScript strict, Hono (routes), Vitest (tests), React 19, Zustand, Vite

**Spec:** `docs/superpowers/specs/2026-03-18-vsa-refactor-design.md`

---

## Phase 1: Backend shared/ (must run first)

### Task 1: Move infrastructure to shared/

Move all cross-cutting infra files from their current locations to `src/shared/`. Update all imports across the codebase.

**Files:**
- Move: `src/infra/database.ts` → `src/shared/database.ts`
- Move: `src/infra/locks.ts` → `src/shared/locks.ts`
- Move: `src/infra/dedup.ts` → `src/shared/dedup.ts`
- Move: `src/infra/spawn-claude.ts` → `src/shared/spawn-claude.ts`
- Move: `src/infra/claude-semaphore.ts` → `src/shared/claude-semaphore.ts`
- Move: `src/infra/claude-tracker.ts` → `src/shared/claude-tracker.ts`
- Move: `src/infra/updater.ts` → `src/shared/updater.ts`
- Move: `src/sse/emitter.ts` → `src/shared/sse.ts`
- Move: `src/middleware/auth.ts` → `src/shared/auth.ts`
- Move: `src/utils/slug.ts` → `src/shared/slug.ts`
- Move: `src/utils/memory-context.ts` → `src/shared/memory-context.ts`
- Move: `src/config.ts` → `src/shared/config.ts`
- Move: `src/paths.ts` → `src/shared/paths.ts`
- Move: `src/platform/clipboard.ts` → `src/shared/platform/clipboard.ts`
- Move: `src/platform/service-installer.ts` → `src/shared/platform/service-installer.ts`
- Move corresponding tests to colocate:
  - `tests/infra/database.test.ts` → `src/shared/database.test.ts`
  - `tests/infra/locks.test.ts` → `src/shared/locks.test.ts`
  - `tests/infra/dedup.test.ts` → `src/shared/dedup.test.ts`
  - `tests/infra/spawn-claude.test.ts` → `src/shared/spawn-claude.test.ts`
  - `tests/infra/claude-tracker.test.ts` → `src/shared/claude-tracker.test.ts`
  - `tests/infra/updater.test.ts` → `src/shared/updater.test.ts`
  - `tests/middleware/auth.test.ts` → `src/shared/auth.test.ts`
  - `tests/sse/emitter.test.ts` → `src/shared/sse.test.ts`
  - `tests/config.test.ts` → `src/shared/config.test.ts`
  - `tests/paths.test.ts` → `src/shared/paths.test.ts`
  - `tests/platform/clipboard.test.ts` → `src/shared/platform/clipboard.test.ts`
  - `tests/platform/service-installer.test.ts` → `src/shared/platform/service-installer.test.ts`
- Move: `tests/helpers/` → `src/shared/test-helpers/`

- [ ] **Step 1: Create shared/ directory structure**

```bash
cd /Users/lolo/Documents/opentidy/apps/backend
mkdir -p src/shared/platform src/shared/test-helpers
```

- [ ] **Step 2: Move infra files to shared/**

```bash
cd /Users/lolo/Documents/opentidy/apps/backend
# Move source files
mv src/infra/database.ts src/shared/database.ts
mv src/infra/locks.ts src/shared/locks.ts
mv src/infra/dedup.ts src/shared/dedup.ts
mv src/infra/spawn-claude.ts src/shared/spawn-claude.ts
mv src/infra/claude-semaphore.ts src/shared/claude-semaphore.ts
mv src/infra/claude-tracker.ts src/shared/claude-tracker.ts
mv src/infra/updater.ts src/shared/updater.ts
```

- [ ] **Step 3: Move sse, auth, utils, config, paths, platform to shared/**

```bash
cd /Users/lolo/Documents/opentidy/apps/backend
mv src/sse/emitter.ts src/shared/sse.ts
mv src/middleware/auth.ts src/shared/auth.ts
mv src/utils/slug.ts src/shared/slug.ts
mv src/utils/memory-context.ts src/shared/memory-context.ts
mv src/config.ts src/shared/config.ts
mv src/paths.ts src/shared/paths.ts
mv src/platform/clipboard.ts src/shared/platform/clipboard.ts
mv src/platform/service-installer.ts src/shared/platform/service-installer.ts
```

- [ ] **Step 4: Move test files to colocate with shared/**

```bash
cd /Users/lolo/Documents/opentidy/apps/backend
mv tests/infra/database.test.ts src/shared/database.test.ts
mv tests/infra/locks.test.ts src/shared/locks.test.ts
mv tests/infra/dedup.test.ts src/shared/dedup.test.ts
mv tests/infra/spawn-claude.test.ts src/shared/spawn-claude.test.ts
mv tests/infra/claude-tracker.test.ts src/shared/claude-tracker.test.ts
mv tests/infra/updater.test.ts src/shared/updater.test.ts
mv tests/middleware/auth.test.ts src/shared/auth.test.ts
mv tests/sse/emitter.test.ts src/shared/sse.test.ts
mv tests/config.test.ts src/shared/config.test.ts
mv tests/paths.test.ts src/shared/paths.test.ts
mv tests/platform/clipboard.test.ts src/shared/platform/clipboard.test.ts
mv tests/platform/service-installer.test.ts src/shared/platform/service-installer.test.ts
# Move test helpers
mv tests/helpers/mock-deps.ts src/shared/test-helpers/mock-deps.ts
mv tests/helpers/mock-request.ts src/shared/test-helpers/mock-request.ts
mv tests/helpers/tmpdir.ts src/shared/test-helpers/tmpdir.ts
```

- [ ] **Step 5: Update ALL import paths across the entire codebase**

Every file that imports from the moved modules needs its import path updated. The key mappings:

| Old import | New import |
|------------|-----------|
| `../infra/database.js` | `../shared/database.js` (or adjust depth) |
| `../infra/locks.js` | `../shared/locks.js` |
| `../infra/dedup.js` | `../shared/dedup.js` |
| `../infra/spawn-claude.js` | `../shared/spawn-claude.js` |
| `../infra/claude-semaphore.js` | `../shared/claude-semaphore.js` |
| `../infra/claude-tracker.js` | `../shared/claude-tracker.js` |
| `../infra/updater.js` | `../shared/updater.js` |
| `../infra/audit.js` | DO NOT update yet, moves to `features/system/audit.ts` in Task 8 |
| `../infra/notification-store.js` | DO NOT update yet, moves to `features/notifications/store.ts` in Task 7 |
| `../sse/emitter.js` | `../shared/sse.js` |
| `../middleware/auth.js` | `../shared/auth.js` |
| `../utils/slug.js` | `../shared/slug.js` |
| `../utils/memory-context.js` | `../shared/memory-context.js` |
| `./config.js` | `./shared/config.js` |
| `./paths.js` | `./shared/paths.js` |
| `../config.js` | `../shared/config.js` |
| `../paths.js` | `../shared/paths.js` |
| `../platform/clipboard.js` | `../shared/platform/clipboard.js` |
| `../platform/service-installer.js` | `../shared/platform/service-installer.js` |

Use grep to find every import reference and update it. Pay special attention to:
- `src/index.ts`: imports from many infra modules
- `src/server.ts`: imports auth
- `src/launcher/session.ts`: imports locks
- `src/launcher/checkup.ts`: imports spawn-claude, slug, memory-context
- `src/receiver/triage.ts`: imports spawn-claude, memory-context
- `src/workspace/title.ts`: imports spawn-claude
- `src/memory/agents.ts`: imports spawn-claude
- `src/notifications/telegram.ts`: no internal imports (OK)
- `src/hooks/handler.ts`: no internal imports (OK)
- `src/terminal/bridge.ts`: imports clipboard
- `src/cli/*.ts`: import config, paths
- `src/daemon.ts`: imports paths
- `src/boot/periodic-tasks.ts`: imports watchdog
- All test files; update import paths to `../../src/shared/...` or relative paths
- Test helpers (mock-deps, mock-request), update their own imports and all test files that import them

Also update imports **within** moved files:
- `src/shared/spawn-claude.ts`: imports from `./claude-semaphore.js` (same dir, no change needed)
- `src/shared/updater.ts`: imports from `./paths.js` (same dir now, adjust if needed)
- `src/shared/dedup.ts`: may import database (same dir now)

- [ ] **Step 6: Verify build passes**

```bash
cd /Users/lolo/Documents/opentidy && pnpm build
```

Expected: clean compilation

- [ ] **Step 7: Update vitest config to include src/**

Update `apps/backend/vitest.config.ts`:
```ts
include: ['src/**/*.test.ts', 'tests/**/*.test.ts']
```

(Both patterns needed during migration, tests/ still has some files)

- [ ] **Step 8: Run tests**

```bash
cd /Users/lolo/Documents/opentidy && pnpm --filter @opentidy/backend test
```

Expected: all tests pass

- [ ] **Step 9: Commit**

```bash
git add -A apps/backend/src/shared/ apps/backend/src/ apps/backend/tests/ apps/backend/vitest.config.ts
git commit -m "refactor(backend): move cross-cutting code to shared/ (VSA phase 1)"
```

---

## Phase 2: Backend features/ (parallelizable tasks)

Each task below moves one feature's source + tests to `src/features/<name>/`, updates imports, and verifies. These tasks CAN run in parallel if using worktrees. On the same branch, run them sequentially.

### Task 2: features/dossiers/

**Files:**
- Move: `src/workspace/state.ts` → `src/features/dossiers/state.ts`
- Move: `src/workspace/dossier.ts` → `src/features/dossiers/create-manager.ts`
- Move: `src/workspace/title.ts` → `src/features/dossiers/title.ts`
- Split: `src/routes/dossiers.ts` → individual route files in `src/features/dossiers/`
- Move tests:
  - `tests/workspace/state.test.ts` → `src/features/dossiers/state.test.ts`
  - `tests/workspace/dossier.test.ts` → `src/features/dossiers/create-manager.test.ts`
  - `tests/workspace/title.test.ts` → `src/features/dossiers/title.test.ts`

- [ ] **Step 1: Create directory**

```bash
mkdir -p /Users/lolo/Documents/opentidy/apps/backend/src/features/dossiers
```

- [ ] **Step 2: Move workspace files**

```bash
cd /Users/lolo/Documents/opentidy/apps/backend
mv src/workspace/state.ts src/features/dossiers/state.ts
mv src/workspace/dossier.ts src/features/dossiers/create-manager.ts
mv src/workspace/title.ts src/features/dossiers/title.ts
```

- [ ] **Step 3: Split routes/dossiers.ts into individual route files**

Read `src/routes/dossiers.ts` (149 lines). It exports `createDossierRoutes(deps)` which registers all dossier endpoints on a single Hono router. Split each endpoint into its own file:

- `src/features/dossiers/list.ts`: `GET /dossiers` route
- `src/features/dossiers/get.ts`: `GET /dossiers/:id` route
- `src/features/dossiers/create.ts`: `POST /dossiers` route
- `src/features/dossiers/instruct.ts`: `POST /dossiers/:id/instruction` route
- `src/features/dossiers/complete.ts`: `POST /dossiers/:id/complete` route
- `src/features/dossiers/resume.ts`: `POST /dossiers/:id/resume` route
- `src/features/dossiers/waiting-type.ts`: `POST /dossiers/:id/waiting-type` route
- `src/features/dossiers/upload.ts`: `POST /dossiers/:id/artifacts` route
- `src/features/dossiers/download.ts`: `GET /dossiers/:id/artifact/:filename` route

Each file exports a function like:
```ts
import { Hono } from 'hono'
import type { AppDeps } from '../../server.js'

export function listDossiersRoute(deps: AppDeps) {
  const app = new Hono()
  app.get('/dossiers', async (c) => {
    // ... handler logic from routes/dossiers.ts
  })
  return app
}
```

- [ ] **Step 4: Move tests**

```bash
cd /Users/lolo/Documents/opentidy/apps/backend
mv tests/workspace/state.test.ts src/features/dossiers/state.test.ts
mv tests/workspace/dossier.test.ts src/features/dossiers/create-manager.test.ts
mv tests/workspace/title.test.ts src/features/dossiers/title.test.ts
```

- [ ] **Step 5: Update all import paths**

Files that import from workspace/:
- `src/launcher/session.ts`: `../workspace/state.js` → `../features/dossiers/state.js` (will move later, but update now)
- `src/routes/dossiers.ts`: `../workspace/state.js` → `../features/dossiers/state.js` (if not yet deleted)
- `src/index.ts`: update workspace imports
- All moved test files, update their relative imports

Files within the moved files:
- `src/features/dossiers/title.ts`: update import from `../infra/spawn-claude.js` to `../../shared/spawn-claude.js`
- `src/features/dossiers/state.ts`: check imports

- [ ] **Step 6: Build and test**

```bash
cd /Users/lolo/Documents/opentidy && pnpm build && pnpm --filter @opentidy/backend test
```

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "refactor(backend): move dossiers to features/dossiers/ (VSA phase 2)"
```

---

### Task 3: features/sessions/

**Files:**
- Move: `src/launcher/session.ts` → `src/features/sessions/launch.ts`
- Move: `src/launcher/post-session.ts` → `src/features/sessions/post-session.ts`
- Move: `src/launcher/claude-md.ts` → `src/features/sessions/claude-md.ts`
- Move: `src/launcher/tmux-executor.ts` → `src/features/sessions/executor.ts`
- Split: `src/routes/sessions.ts` → individual route files in `src/features/sessions/`
- Move: `src/launcher/checkup.ts` → `src/features/checkup/sweep.ts` (separate feature)
- Move: `src/launcher/watchdog.ts` → `src/features/checkup/watchdog.ts`
- Move tests:
  - `tests/launcher/session.test.ts` → `src/features/sessions/launch.test.ts`
  - `tests/launcher/checkup.test.ts` → `src/features/checkup/sweep.test.ts`
  - `tests/launcher/watchdog.test.ts` → `src/features/checkup/watchdog.test.ts`

- [ ] **Step 1: Create directories**

```bash
mkdir -p /Users/lolo/Documents/opentidy/apps/backend/src/features/sessions
mkdir -p /Users/lolo/Documents/opentidy/apps/backend/src/features/checkup
```

- [ ] **Step 2: Move launcher files**

```bash
cd /Users/lolo/Documents/opentidy/apps/backend
mv src/launcher/session.ts src/features/sessions/launch.ts
mv src/launcher/post-session.ts src/features/sessions/post-session.ts
mv src/launcher/claude-md.ts src/features/sessions/claude-md.ts
mv src/launcher/tmux-executor.ts src/features/sessions/executor.ts
mv src/launcher/checkup.ts src/features/checkup/sweep.ts
mv src/launcher/watchdog.ts src/features/checkup/watchdog.ts
```

- [ ] **Step 3: Split routes/sessions.ts into individual route files**

Read `src/routes/sessions.ts` (24 lines). Split into:
- `src/features/sessions/list.ts`: `GET /sessions`
- `src/features/sessions/stop.ts`: `POST /sessions/:id/stop`

Each exports a route function taking `AppDeps`.

- [ ] **Step 4: Move tests**

```bash
cd /Users/lolo/Documents/opentidy/apps/backend
mv tests/launcher/session.test.ts src/features/sessions/launch.test.ts
mv tests/launcher/checkup.test.ts src/features/checkup/sweep.test.ts
mv tests/launcher/watchdog.test.ts src/features/checkup/watchdog.test.ts
```

- [ ] **Step 5: Update all import paths**

Key updates:
- Within `src/features/sessions/launch.ts`: update imports from `./post-session.js`, `./claude-md.js`, `../workspace/state.js` → `../dossiers/state.js`
- Within `src/features/sessions/post-session.ts`: update import from `./session.js` → `./launch.js`
- Within `src/features/sessions/executor.ts`: update import from `./session.js` → `./launch.js`
- Within `src/features/checkup/sweep.ts`: update imports from `../utils/...` → `../../shared/...`, `../infra/...` → `../../shared/...`
- `src/index.ts`: update all launcher imports
- `src/boot/periodic-tasks.ts`: update watchdog import to `../features/checkup/watchdog.js`
- `src/utils/triage-handler.ts`: update launcher import (if any)

- [ ] **Step 6: Build and test**

```bash
cd /Users/lolo/Documents/opentidy && pnpm build && pnpm --filter @opentidy/backend test
```

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "refactor(backend): move sessions+checkup to features/ (VSA phase 2)"
```

---

### Task 4: features/triage/

**Files:**
- Move: `src/receiver/triage.ts` → `src/features/triage/classify.ts`
- Move: `src/receiver/webhook.ts` → `src/features/triage/webhook.ts`
- Move: `src/receiver/mail-reader.ts` → `src/features/triage/mail-reader.ts`
- Move: `src/receiver/sms-reader.ts` → `src/features/triage/sms-reader.ts`
- Move: `src/receiver/plugin.ts` → `src/features/triage/plugin.ts`
- Move: `src/receiver/watchers.ts` → `src/features/triage/watchers.ts`
- Move: `src/utils/triage-handler.ts` → `src/features/triage/route.ts`
- Move tests:
  - `tests/receiver/triage.test.ts` → `src/features/triage/classify.test.ts`
  - `tests/receiver/webhook.test.ts` → `src/features/triage/webhook.test.ts`
  - `tests/receiver/mail-reader.test.ts` → `src/features/triage/mail-reader.test.ts`
  - `tests/receiver/sms-reader.test.ts` → `src/features/triage/sms-reader.test.ts`
  - `tests/receiver/plugin.test.ts` → `src/features/triage/plugin.test.ts`
  - `tests/receiver/watchers.test.ts` → `src/features/triage/watchers.test.ts`
  - `tests/receiver/macos-receivers.test.ts` → `src/features/triage/macos-receivers.test.ts`
- Extract: webhook route from `src/routes/hooks.ts` → `src/features/triage/webhook.ts` (merge with existing)

- [ ] **Step 1: Create directory and move files**

```bash
mkdir -p /Users/lolo/Documents/opentidy/apps/backend/src/features/triage
cd /Users/lolo/Documents/opentidy/apps/backend
mv src/receiver/triage.ts src/features/triage/classify.ts
mv src/receiver/webhook.ts src/features/triage/webhook.ts
mv src/receiver/mail-reader.ts src/features/triage/mail-reader.ts
mv src/receiver/sms-reader.ts src/features/triage/sms-reader.ts
mv src/receiver/plugin.ts src/features/triage/plugin.ts
mv src/receiver/watchers.ts src/features/triage/watchers.ts
mv src/utils/triage-handler.ts src/features/triage/route.ts
```

- [ ] **Step 2: Move tests**

```bash
cd /Users/lolo/Documents/opentidy/apps/backend
mv tests/receiver/triage.test.ts src/features/triage/classify.test.ts
mv tests/receiver/webhook.test.ts src/features/triage/webhook.test.ts
mv tests/receiver/mail-reader.test.ts src/features/triage/mail-reader.test.ts
mv tests/receiver/sms-reader.test.ts src/features/triage/sms-reader.test.ts
mv tests/receiver/plugin.test.ts src/features/triage/plugin.test.ts
mv tests/receiver/watchers.test.ts src/features/triage/watchers.test.ts
mv tests/receiver/macos-receivers.test.ts src/features/triage/macos-receivers.test.ts
```

- [ ] **Step 3: Update import paths**

Within moved files:
- `classify.ts`: `../utils/memory-context.js` → `../../shared/memory-context.js`, `../infra/spawn-claude.js` → `../../shared/spawn-claude.js`
- `route.ts` (was triage-handler): `./slug.js` → `../../shared/slug.js`, `../receiver/triage.js` → `./classify.js`
- `mail-reader.ts`, `sms-reader.ts`: `./plugin.js` stays (same dir)

External files:
- `src/index.ts`: update receiver imports
- `src/routes/hooks.ts`: update webhook import if referencing receiver

- [ ] **Step 4: Build and test**

```bash
cd /Users/lolo/Documents/opentidy && pnpm build && pnpm --filter @opentidy/backend test
```

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "refactor(backend): move triage to features/triage/ (VSA phase 2)"
```

---

### Task 5: features/memory/

**Files:**
- Move: `src/memory/manager.ts` → `src/features/memory/manager.ts`
- Move: `src/memory/agents.ts` → `src/features/memory/agents.ts`
- Move: `src/memory/lock.ts` → `src/features/memory/lock.ts`
- Delete: `src/memory/index.ts` (barrel file, no barrel files in VSA)
- Split: `src/routes/memory.ts` → individual route files in `src/features/memory/`
- Move tests:
  - `tests/memory/manager.test.ts` → `src/features/memory/manager.test.ts`
  - `tests/memory/agents.test.ts` → `src/features/memory/agents.test.ts`
  - `tests/memory/lock.test.ts` → `src/features/memory/lock.test.ts`
  - `tests/memory/adversarial.test.ts` → `src/features/memory/adversarial.test.ts`
  - `tests/api/memory.test.ts` → `src/features/memory/api.test.ts`

- [ ] **Step 1: Create directory and move files**

```bash
mkdir -p /Users/lolo/Documents/opentidy/apps/backend/src/features/memory
cd /Users/lolo/Documents/opentidy/apps/backend
mv src/memory/manager.ts src/features/memory/manager.ts
mv src/memory/agents.ts src/features/memory/agents.ts
mv src/memory/lock.ts src/features/memory/lock.ts
rm src/memory/index.ts
```

- [ ] **Step 2: Split routes/memory.ts into individual route files**

Read `src/routes/memory.ts` (87 lines). Split into:
- `src/features/memory/list.ts`: `GET /memory`
- `src/features/memory/create.ts`: `POST /memory`
- `src/features/memory/read.ts`: `GET /memory/:category/:name`
- `src/features/memory/update.ts`: `PUT /memory/:category/:name`
- `src/features/memory/archive.ts`: `POST /memory/:category/:name/archive`
- `src/features/memory/prompt.ts`: `POST /memory/prompt`

Each exports a route function taking `AppDeps`.

- [ ] **Step 3: Move tests**

```bash
cd /Users/lolo/Documents/opentidy/apps/backend
mv tests/memory/manager.test.ts src/features/memory/manager.test.ts
mv tests/memory/agents.test.ts src/features/memory/agents.test.ts
mv tests/memory/lock.test.ts src/features/memory/lock.test.ts
mv tests/memory/adversarial.test.ts src/features/memory/adversarial.test.ts
mv tests/api/memory.test.ts src/features/memory/api.test.ts
```

- [ ] **Step 4: Update import paths**

Within moved files:
- `agents.ts`: `./lock.js`, `./manager.js` stay (same dir). `../infra/spawn-claude.js` → `../../shared/spawn-claude.js`
- `manager.ts`: check for internal imports

External files:
- `src/index.ts`: update `from './memory/index.js'` to direct imports: `from './features/memory/manager.js'`, `from './features/memory/agents.js'`, `from './features/memory/lock.js'`

- [ ] **Step 5: Build and test**

```bash
cd /Users/lolo/Documents/opentidy && pnpm build && pnpm --filter @opentidy/backend test
```

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "refactor(backend): move memory to features/memory/ (VSA phase 2)"
```

---

### Task 6: features/suggestions/ + features/ameliorations/

**Files:**
- Move: `src/workspace/suggestions.ts` → `src/features/suggestions/parser.ts`
- Move: `src/workspace/gaps.ts` → `src/features/ameliorations/gaps.ts`
- Split: `src/routes/suggestions.ts` → `src/features/suggestions/list.ts`, `approve.ts`, `dismiss.ts`
- Extract: amelioration routes from `src/routes/system.ts` → `src/features/ameliorations/list.ts`, `resolve.ts`, `ignore.ts`
- Move tests:
  - `tests/workspace/suggestions.test.ts` → `src/features/suggestions/parser.test.ts`
  - `tests/workspace/gaps.test.ts` → `src/features/ameliorations/gaps.test.ts`

- [ ] **Step 1: Create directories and move files**

```bash
mkdir -p /Users/lolo/Documents/opentidy/apps/backend/src/features/suggestions
mkdir -p /Users/lolo/Documents/opentidy/apps/backend/src/features/ameliorations
cd /Users/lolo/Documents/opentidy/apps/backend
mv src/workspace/suggestions.ts src/features/suggestions/parser.ts
mv src/workspace/gaps.ts src/features/ameliorations/gaps.ts
```

- [ ] **Step 2: Split routes/suggestions.ts into route files**

Read `src/routes/suggestions.ts` (37 lines). Create:
- `src/features/suggestions/list.ts`
- `src/features/suggestions/approve.ts`
- `src/features/suggestions/dismiss.ts`

- [ ] **Step 3: Extract amelioration routes from routes/system.ts**

Read `src/routes/system.ts`. Find and extract amelioration-related endpoints into:
- `src/features/ameliorations/list.ts`
- `src/features/ameliorations/resolve.ts`

- [ ] **Step 4: Move tests**

```bash
cd /Users/lolo/Documents/opentidy/apps/backend
mv tests/workspace/suggestions.test.ts src/features/suggestions/parser.test.ts
mv tests/workspace/gaps.test.ts src/features/ameliorations/gaps.test.ts
```

- [ ] **Step 5: Update imports, build and test**

```bash
cd /Users/lolo/Documents/opentidy && pnpm build && pnpm --filter @opentidy/backend test
```

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "refactor(backend): move suggestions+ameliorations to features/ (VSA phase 2)"
```

---

### Task 7: features/hooks/ + features/notifications/ + features/terminal/

**Files:**
- Move: `src/hooks/handler.ts` → `src/features/hooks/handler.ts`
- Move: `src/notifications/telegram.ts` → `src/features/notifications/telegram.ts`
- Move: `src/infra/notification-store.ts` → `src/features/notifications/store.ts`
- Move: `src/terminal/bridge.ts` → `src/features/terminal/bridge.ts`
- Extract: notification route from `src/routes/system.ts` → `src/features/notifications/list.ts`
- Extract: terminal route from `src/routes/system.ts` → `src/features/terminal/bridge.ts` (merge with existing)
- Extract: hook route from `src/routes/hooks.ts` → `src/features/hooks/handler.ts` (merge with existing)
- Move tests:
  - `tests/hooks/handler.test.ts` → `src/features/hooks/handler.test.ts`
  - `tests/notifications/telegram.test.ts` → `src/features/notifications/telegram.test.ts`
  - `tests/infra/notification-store.test.ts` → `src/features/notifications/store.test.ts`
  - `tests/terminal/bridge.test.ts` → `src/features/terminal/bridge.test.ts`

- [ ] **Step 1: Create directories and move files**

```bash
mkdir -p /Users/lolo/Documents/opentidy/apps/backend/src/features/hooks
mkdir -p /Users/lolo/Documents/opentidy/apps/backend/src/features/notifications
mkdir -p /Users/lolo/Documents/opentidy/apps/backend/src/features/terminal
cd /Users/lolo/Documents/opentidy/apps/backend
mv src/hooks/handler.ts src/features/hooks/handler.ts
mv src/notifications/telegram.ts src/features/notifications/telegram.ts
mv src/infra/notification-store.ts src/features/notifications/store.ts
mv src/terminal/bridge.ts src/features/terminal/bridge.ts
```

- [ ] **Step 2: Merge routes into feature files**

For each feature, read the corresponding route file and merge the route definition into the feature's handler file. Each feature file should export both the logic AND the Hono route.

- [ ] **Step 3: Move tests**

```bash
cd /Users/lolo/Documents/opentidy/apps/backend
mv tests/hooks/handler.test.ts src/features/hooks/handler.test.ts
mv tests/notifications/telegram.test.ts src/features/notifications/telegram.test.ts
mv tests/infra/notification-store.test.ts src/features/notifications/store.test.ts
mv tests/terminal/bridge.test.ts src/features/terminal/bridge.test.ts
```

- [ ] **Step 4: Update imports, build and test**

```bash
cd /Users/lolo/Documents/opentidy && pnpm build && pnpm --filter @opentidy/backend test
```

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "refactor(backend): move hooks+notifications+terminal to features/ (VSA phase 2)"
```

---

### Task 8: features/system/ + remaining routes

**Files:**
- Move: `src/infra/audit.ts` → `src/features/system/audit.ts`
- Move: `src/fixtures/test-tasks.ts` → `src/features/system/test-tasks.ts`
- Extract remaining routes from `src/routes/system.ts` → `src/features/system/health.ts`, `reset.ts`, `processes.ts`, `events.ts`
- Move tests:
  - `tests/infra/audit.test.ts` → `src/features/system/audit.test.ts`
  - `tests/api/adversarial.test.ts` → `src/features/system/adversarial.test.ts`
  - `tests/edge-cases/edge-cases.test.ts` → `src/features/system/edge-cases.test.ts`
  - `tests/routes/api.test.ts` → `src/features/system/api-integration.test.ts`

- [ ] **Step 1: Create directory and move files**

```bash
mkdir -p /Users/lolo/Documents/opentidy/apps/backend/src/features/system
cd /Users/lolo/Documents/opentidy/apps/backend
mv src/infra/audit.ts src/features/system/audit.ts
mv src/fixtures/test-tasks.ts src/features/system/test-tasks.ts
```

- [ ] **Step 2: Create route files from routes/system.ts**

Split remaining routes from `src/routes/system.ts` (after ameliorations, checkup, terminal, notifications have been extracted):
- `src/features/system/health.ts`: `GET /health`
- `src/features/system/reset.ts`: `POST /reset`
- `src/features/system/processes.ts`: `GET /claude-processes` + `GET /claude-processes/:id/output`
- `src/features/system/events.ts`: `GET /events` (SSE endpoint)

Also extract checkup routes to `src/features/checkup/`:
- `src/features/checkup/trigger.ts`: `POST /checkup` + `GET /checkup/status`

- [ ] **Step 3: Move tests**

```bash
cd /Users/lolo/Documents/opentidy/apps/backend
mv tests/infra/audit.test.ts src/features/system/audit.test.ts
mv tests/api/adversarial.test.ts src/features/system/adversarial.test.ts
mv tests/edge-cases/edge-cases.test.ts src/features/system/edge-cases.test.ts
mv tests/routes/api.test.ts src/features/system/api-integration.test.ts
```

- [ ] **Step 4: Update imports, build and test**

```bash
cd /Users/lolo/Documents/opentidy && pnpm build && pnpm --filter @opentidy/backend test
```

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "refactor(backend): move system to features/system/ (VSA phase 2)"
```

---

## Phase 3: Rewrite server.ts + cleanup

### Task 9: Rewrite server.ts as pure assembler

**Files:**
- Rewrite: `src/server.ts`
- Delete: `src/routes/` (entire directory)
- Move: `tests/server.test.ts` → `src/server.test.ts`
- Move remaining root tests:
  - `tests/cli.test.ts` → `src/cli/cli.test.ts`
  - `tests/cli/uninstall.test.ts` → `src/cli/uninstall.test.ts`
  - `tests/daemon.test.ts` → `src/daemon.test.ts`

- [ ] **Step 1: Rewrite server.ts**

`server.ts` should now be a pure assembler. It imports all route functions from features and mounts them:

```ts
import { Hono } from 'hono'
import { createAuthMiddleware } from './shared/auth.js'
// Import all feature routes
import { listDossiersRoute } from './features/dossiers/list.js'
import { getDossierRoute } from './features/dossiers/get.js'
import { createDossierRoute } from './features/dossiers/create.js'
// ... all other feature routes

export interface AppDeps { /* same as current */ }

export function createApp(deps: AppDeps) {
  const app = new Hono()

  // Auth
  const auth = createAuthMiddleware(deps.config)
  app.use('/api/*', auth)

  // Mount feature routes
  app.route('/api', listDossiersRoute(deps))
  app.route('/api', getDossierRoute(deps))
  app.route('/api', createDossierRoute(deps))
  // ... all other routes

  // Error handler
  app.onError((err, c) => {
    console.error('[server] unhandled error:', err)
    return c.json({ error: 'Internal server error' }, 500)
  })

  return app
}

export function startServer(app: Hono, port: number) { /* same */ }
```

- [ ] **Step 2: Delete old routes directory**

```bash
rm -rf /Users/lolo/Documents/opentidy/apps/backend/src/routes/
```

- [ ] **Step 3: Move remaining tests to colocate**

```bash
cd /Users/lolo/Documents/opentidy/apps/backend
mv tests/server.test.ts src/server.test.ts
mv tests/cli.test.ts src/cli/cli.test.ts
mv tests/cli/uninstall.test.ts src/cli/uninstall.test.ts
mv tests/daemon.test.ts src/daemon.test.ts
# CLI setup tests (if they exist)
mv tests/cli/setup/config-shape.test.ts src/cli/setup/config-shape.test.ts 2>/dev/null || true
mv tests/cli/setup/gmail.test.ts src/cli/setup/gmail.test.ts 2>/dev/null || true
mv tests/cli/setup/user-info.test.ts src/cli/setup/user-info.test.ts 2>/dev/null || true
```

- [ ] **Step 4: Update imports in server.test.ts and other moved tests**

- [ ] **Step 5: Build and test**

```bash
cd /Users/lolo/Documents/opentidy && pnpm build && pnpm --filter @opentidy/backend test
```

**NOTE:** `src/routes/hooks.ts` contains both hook AND webhook routes. It gets carved up across Task 4 (webhook → triage) and Task 7 (hook → hooks). Do NOT delete `routes/hooks.ts` until both tasks are complete. It is safe to delete in this step (Phase 3) since all Phase 2 tasks must be finished first.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "refactor(backend): rewrite server.ts as pure assembler, delete routes/ (VSA phase 3)"
```

---

### Task 10: Update index.ts and delete old directories

**Files:**
- Modify: `src/index.ts`, update all imports to new paths
- Delete: all empty old directories

- [ ] **Step 1: Update index.ts imports**

Read `src/index.ts` and update every import to point to the new VSA paths:

| Old import | New import |
|------------|-----------|
| `./infra/*` | `./shared/*` |
| `./launcher/*` | `./features/sessions/*` or `./features/checkup/*` |
| `./workspace/*` | `./features/dossiers/*` or `./features/suggestions/*` |
| `./receiver/*` | `./features/triage/*` |
| `./memory/*` | `./features/memory/*` |
| `./hooks/*` | `./features/hooks/*` |
| `./notifications/*` | `./features/notifications/*` |
| `./terminal/*` | `./features/terminal/*` |
| `./sse/*` | `./shared/*` |
| `./config.js` | `./shared/config.js` |
| `./paths.js` | `./shared/paths.js` |

- [ ] **Step 2: Delete empty old directories**

```bash
cd /Users/lolo/Documents/opentidy/apps/backend
rm -rf src/infra/ src/launcher/ src/workspace/ src/receiver/ src/memory/ src/hooks/ src/notifications/ src/terminal/ src/sse/ src/middleware/ src/utils/ src/fixtures/ src/platform/
rm -rf tests/infra/ tests/launcher/ tests/workspace/ tests/receiver/ tests/memory/ tests/hooks/ tests/notifications/ tests/terminal/ tests/sse/ tests/middleware/ tests/api/ tests/routes/ tests/edge-cases/ tests/platform/ tests/helpers/ tests/cli/
```

- [ ] **Step 3: Finalize vitest config**

Update `apps/backend/vitest.config.ts` to only look in `src/`:

```ts
include: ['src/**/*.test.ts']
```

Remove the old `tests/` pattern.

- [ ] **Step 4: Build and run ALL tests**

```bash
cd /Users/lolo/Documents/opentidy && pnpm build && pnpm --filter @opentidy/backend test
```

Expected: all tests pass, no orphan imports, no missing files.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "refactor(backend): update index.ts, delete old directories, finalize VSA structure"
```

---

## Phase 4: Frontend reorganization

### Task 11: Move web components/pages to features/

**Files:**
- Move pages and components into `src/features/<domain>/`
- Move shared components to `src/shared/`
- Move store, api, i18n, utils to `src/shared/`
- Move unit tests to colocate
- Keep E2E tests in `tests/e2e/`

- [ ] **Step 1: Create frontend feature directories**

```bash
cd /Users/lolo/Documents/opentidy/apps/web
mkdir -p src/features/dossiers src/features/sessions src/features/ameliorations src/features/memory src/features/terminal src/features/nouveau src/features/home
mkdir -p src/shared/utils src/shared/i18n/locales
```

- [ ] **Step 2: Move pages and components to features/**

```bash
cd /Users/lolo/Documents/opentidy/apps/web
# Dossiers
mv src/pages/DossierDetail.tsx src/features/dossiers/DossierDetail.tsx
mv src/components/DossierCard.tsx src/features/dossiers/DossierCard.tsx
mv src/components/Sidebar.tsx src/features/dossiers/Sidebar.tsx
mv src/components/StateRenderer.tsx src/features/dossiers/StateRenderer.tsx
# Sessions
mv src/components/SessionCard.tsx src/features/sessions/SessionCard.tsx
mv src/components/SessionOutput.tsx src/features/sessions/SessionOutput.tsx
# Ameliorations
mv src/pages/Ameliorations.tsx src/features/ameliorations/Ameliorations.tsx
mv src/components/AmeliorationCard.tsx src/features/ameliorations/AmeliorationCard.tsx
# Memory
mv src/pages/Memory.tsx src/features/memory/Memory.tsx
# Terminal
mv src/pages/Terminal.tsx src/features/terminal/Terminal.tsx
mv src/components/terminal/PlainTextOutput.tsx src/features/terminal/PlainTextOutput.tsx
mv src/components/terminal/ProcessOutput.tsx src/features/terminal/ProcessOutput.tsx
mv src/components/terminal/LiveProcessOutput.tsx src/features/terminal/LiveProcessOutput.tsx
# Nouveau
mv src/pages/Nouveau.tsx src/features/nouveau/Nouveau.tsx
# Home
mv src/pages/Home.tsx src/features/home/Home.tsx
```

- [ ] **Step 3: Move shared components, store, api, utils, i18n**

```bash
cd /Users/lolo/Documents/opentidy/apps/web
# Shared components
mv src/components/Layout.tsx src/shared/Layout.tsx
mv src/components/ErrorBanner.tsx src/shared/ErrorBanner.tsx
mv src/components/DesktopNav.tsx src/shared/DesktopNav.tsx
mv src/components/MobileNav.tsx src/shared/MobileNav.tsx
mv src/components/InstructionBar.tsx src/shared/InstructionBar.tsx
mv src/components/SuggestionCard.tsx src/shared/SuggestionCard.tsx
# Store & API
mv src/store.ts src/shared/store.ts
mv src/api.ts src/shared/api.ts
# Utils
mv src/utils/format.ts src/shared/utils/format.ts
mv src/utils/status-colors.ts src/shared/utils/status-colors.ts
# i18n
mv src/i18n/i18n.ts src/shared/i18n/i18n.ts
mv src/i18n/locales/en.json src/shared/i18n/locales/en.json
mv src/i18n/locales/fr.json src/shared/i18n/locales/fr.json
```

- [ ] **Step 4: Move unit tests to colocate**

```bash
cd /Users/lolo/Documents/opentidy/apps/web
mv tests/components/DossierCard.test.tsx src/features/dossiers/DossierCard.test.tsx
mv tests/components/SuggestionCard.test.tsx src/shared/SuggestionCard.test.tsx
mv tests/pages/Home.test.tsx src/features/home/Home.test.tsx
mv tests/pages/Ameliorations.test.tsx src/features/ameliorations/Ameliorations.test.tsx
mv tests/store/store.test.ts src/shared/store.test.ts
mv tests/api/api.test.ts src/shared/api.test.ts
```

- [ ] **Step 5: Update ALL import paths**

Every file needs its import paths updated. Key patterns:
- `../components/X` → `../shared/X` or `./X` (if same feature)
- `../store` → `../shared/store`
- `../api` → `../shared/api`
- `../pages/X` → `../features/<domain>/X`
- `../utils/format` → `../shared/utils/format`
- `../utils/status-colors` → `../shared/utils/status-colors`
- `../i18n/i18n` → `../shared/i18n/i18n`

Critical files to update:
- `src/App.tsx`: all page imports change
- `src/main.tsx`: store and i18n imports change
- Every component/page, cross-imports change
- All test files, source imports change

- [ ] **Step 6: Update vitest config**

Update `apps/web/vitest.config.ts`:
```ts
include: ['src/**/*.test.{ts,tsx}']
```

- [ ] **Step 7: Delete old directories**

```bash
cd /Users/lolo/Documents/opentidy/apps/web
rm -rf src/pages/ src/components/ src/utils/ src/i18n/
rm -rf tests/components/ tests/pages/ tests/store/ tests/api/
```

- [ ] **Step 8: Build and test**

```bash
cd /Users/lolo/Documents/opentidy && pnpm build && pnpm --filter @opentidy/web test
```

- [ ] **Step 9: Run E2E tests**

```bash
cd /Users/lolo/Documents/opentidy && pnpm --filter @opentidy/web test:e2e
```

E2E tests import from `fixtures/mock-api.ts` only; they should pass without changes since they test via the browser, not direct imports.

- [ ] **Step 10: Commit**

```bash
git add -A && git commit -m "refactor(web): reorganize into features/ + shared/ (VSA)"
```

---

## Phase 5: Final verification

### Task 12: Full build + test + cleanup

- [ ] **Step 1: Full monorepo build**

```bash
cd /Users/lolo/Documents/opentidy && pnpm build
```

- [ ] **Step 2: Backend tests**

```bash
pnpm --filter @opentidy/backend test
```

- [ ] **Step 3: Web unit tests**

```bash
pnpm --filter @opentidy/web test
```

- [ ] **Step 4: Shared package tests**

```bash
pnpm --filter @opentidy/shared test
```

- [ ] **Step 5: Verify no orphan imports**

```bash
cd /Users/lolo/Documents/opentidy
# Check for any remaining imports to old paths
grep -r "from '\.\./infra/" apps/backend/src/ || echo "OK: no infra imports"
grep -r "from '\.\./launcher/" apps/backend/src/ || echo "OK: no launcher imports"
grep -r "from '\.\./workspace/" apps/backend/src/ || echo "OK: no workspace imports"
grep -r "from '\.\./receiver/" apps/backend/src/ || echo "OK: no receiver imports"
grep -r "from '\.\./memory/" apps/backend/src/ || echo "OK: no memory imports"
grep -r "from '\.\./hooks/" apps/backend/src/ || echo "OK: no hooks imports"
grep -r "from '\.\./notifications/" apps/backend/src/ || echo "OK: no notifications imports"
grep -r "from '\.\./sse/" apps/backend/src/ || echo "OK: no sse imports"
grep -r "from '\.\./middleware/" apps/backend/src/ || echo "OK: no middleware imports"
grep -r "from '\.\./utils/" apps/backend/src/ || echo "OK: no utils imports"
grep -r "from '\.\./pages/" apps/web/src/ || echo "OK: no pages imports"
grep -r "from '\.\./components/" apps/web/src/ || echo "OK: no components imports"
```

- [ ] **Step 6: Verify no empty directories remain**

```bash
find apps/backend/src -type d -empty
find apps/backend/tests -type d -empty 2>/dev/null
find apps/web/src -type d -empty
```

Expected: no output (all empty dirs deleted)

- [ ] **Step 7: Update CLAUDE.md path references**

The main `CLAUDE.md` at repo root references old paths (`apps/backend/src/infra/`, `apps/backend/src/launcher/`, `apps/backend/src/workspace/`, etc.). Update all path references to match the new VSA structure:

- `src/infra/` → `src/shared/`
- `src/launcher/` → `src/features/sessions/` and `src/features/checkup/`
- `src/workspace/` → `src/features/dossiers/`, `src/features/suggestions/`, `src/features/ameliorations/`
- `src/receiver/` → `src/features/triage/`
- `src/memory/` → `src/features/memory/`
- `src/hooks/` → `src/features/hooks/`
- `src/notifications/` → `src/features/notifications/`
- `src/terminal/` → `src/features/terminal/`
- `src/sse/` → `src/shared/sse.ts`
- `src/middleware/` → `src/shared/auth.ts`
- `src/utils/` → `src/shared/`
- `tests/` mirrors → colocated in `src/`

Also update `docs/specification.md` if it references internal paths.

- [ ] **Step 8: Final commit**

```bash
git add -A && git commit -m "refactor: complete VSA migration, verify clean build and tests"
```
