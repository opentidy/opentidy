# SQLite Infrastructure — Persistent State for Alfred

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all volatile in-memory state (notifications, dedup, sessions) with SQLite persistence, and add a claude process tracker for full observability of all Claude invocations.

**Architecture:** Single `better-sqlite3` database at `workspace/_data/alfred.db`. 4 tables. Existing module interfaces preserved — callers don't change. New `claude-tracker` module wraps all 5 places that invoke Claude.

**Tech Stack:** `better-sqlite3` (sync, no async overhead), existing factory function pattern.

---

## File Structure

### New files
| File | Responsibility |
|------|---------------|
| `apps/backend/src/infra/database.ts` | SQLite init, schema creation, `getDb()` accessor |
| `apps/backend/src/infra/claude-tracker.ts` | Track all Claude process invocations (start/complete/fail/list) |
| `apps/backend/tests/infra/database.test.ts` | DB init and schema tests |
| `apps/backend/tests/infra/claude-tracker.test.ts` | Tracker tests |

### Modified files
| File | Changes |
|------|---------|
| `apps/backend/src/infra/notification-store.ts` | Replace Array with SQLite table |
| `apps/backend/src/infra/dedup.ts` | Replace Set with SQLite table |
| `apps/backend/src/launcher/session.ts` | Persist sessions to SQLite, load on recovery |
| `apps/backend/src/receiver/triage.ts` | Add tracker.start/complete around Claude call |
| `apps/backend/src/workspace/title.ts` | Add tracker.start/complete around Claude call |
| `apps/backend/src/memory/agents.ts` | Add tracker.start/complete around Claude call |
| `apps/backend/src/launcher/autonomous-executor.ts` | Add tracker.start on spawn, complete on exit |
| `apps/backend/src/launcher/checkup.ts` | Add tracker.start/complete around Claude call |
| `apps/backend/src/index.ts` | Create DB, wire tracker to all modules |
| `apps/backend/src/server.ts` | Add `GET /api/claude-processes` endpoint |
| `packages/shared/src/types.ts` | Add `ClaudeProcess` type |
| `apps/web/src/pages/Terminal.tsx` | Display claude processes list |
| `apps/web/src/api.ts` | Add fetchClaudeProcesses |
| `apps/web/src/store.ts` | Add claudeProcesses state |

---

## Chunk 1: Database and Claude Tracker (Backend Foundation)

### Task 1: Install better-sqlite3 and create database module

**Files:**
- Create: `apps/backend/src/infra/database.ts`
- Create: `apps/backend/tests/infra/database.test.ts`
- Modify: `apps/backend/package.json` (add dependency)

- [ ] **Step 1: Install better-sqlite3**

```bash
cd apps/backend && pnpm add better-sqlite3 && pnpm add -D @types/better-sqlite3
```

- [ ] **Step 2: Write failing tests for database init**

Test: creates file, creates 4 tables, idempotent (can call twice).

- [ ] **Step 3: Implement database module**

`createDatabase(dataDir)` — creates dir, opens SQLite with WAL mode, creates 4 tables (claude_processes, notifications, dedup_hashes, sessions) with IF NOT EXISTS, returns the db instance.

Schema:
```sql
claude_processes (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, dossier_id TEXT, pid INTEGER, started_at TEXT NOT NULL DEFAULT (datetime('now')), ended_at TEXT, status TEXT NOT NULL DEFAULT 'running', exit_code INTEGER)
notifications (id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp TEXT NOT NULL DEFAULT (datetime('now')), message TEXT NOT NULL, link TEXT NOT NULL, dossier_id TEXT)
dedup_hashes (content_hash TEXT PRIMARY KEY, created_at TEXT NOT NULL DEFAULT (datetime('now')))
sessions (dossier_id TEXT PRIMARY KEY, session_name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', mode TEXT NOT NULL DEFAULT 'autonomous', started_at TEXT NOT NULL DEFAULT (datetime('now')), claude_session_id TEXT, pid INTEGER)
```

Indexes on claude_processes(type), claude_processes(status), notifications(timestamp).

- [ ] **Step 4: Run tests, verify pass**
- [ ] **Step 5: Commit**

---

### Task 2: Create Claude process tracker

**Files:**
- Create: `apps/backend/src/infra/claude-tracker.ts`
- Create: `apps/backend/tests/infra/claude-tracker.test.ts`
- Modify: `packages/shared/src/types.ts`

- [ ] **Step 1: Add ClaudeProcess type to shared types**

```typescript
export type ClaudeProcessType = 'autonomous' | 'triage' | 'checkup' | 'title' | 'memory-injection' | 'memory-extraction' | 'memory-prompt' | 'interactive';
export type ClaudeProcessStatus = 'running' | 'done' | 'error';
export interface ClaudeProcess {
  id: number; type: ClaudeProcessType; dossierId?: string; pid?: number;
  startedAt: string; endedAt?: string; status: ClaudeProcessStatus; exitCode?: number;
}
```

- [ ] **Step 2: Write tracker tests**

Test: start returns id, complete sets status/exitCode/endedAt, fail sets error, list with type filter, list with limit, list most recent first, cleanup removes old completed entries.

- [ ] **Step 3: Implement tracker**

`createClaudeTracker(db)` with prepared statements. Returns `{ start, complete, fail, list, cleanup }`. Logs with `[claude-tracker]` prefix.

- [ ] **Step 4: Build shared + backend, run tests**
- [ ] **Step 5: Commit**

---

## Chunk 2: Migrate In-Memory Stores to SQLite

### Task 3: Migrate notification-store to SQLite

**Files:**
- Modify: `apps/backend/src/infra/notification-store.ts`
- Modify: `apps/backend/tests/infra/notification-store.test.ts`
- Modify: `apps/backend/src/index.ts`

- [ ] **Step 1: Rewrite notification-store**

Same interface: `record(input)` returns NotificationRecord, `list()` returns NotificationRecord[]. Internals use SQLite INSERT/SELECT instead of array push/slice. List returns last 200 ordered by id DESC.

- [ ] **Step 2: Update tests to use real SQLite db in tmpdir**
- [ ] **Step 3: Update index.ts to pass db**
- [ ] **Step 4: Build + test**
- [ ] **Step 5: Commit**

---

### Task 4: Migrate dedup to SQLite

**Files:**
- Modify: `apps/backend/src/infra/dedup.ts`
- Modify: `apps/backend/tests/infra/dedup.test.ts`
- Modify: `apps/backend/src/index.ts`

- [ ] **Step 1: Rewrite dedup**

Same interface: `isDuplicate(content)` and `record(content)`. Uses SHA256 hash as primary key. Add `cleanup()` method that deletes hashes older than 7 days.

- [ ] **Step 2: Update tests**
- [ ] **Step 3: Update index.ts**
- [ ] **Step 4: Build + test**
- [ ] **Step 5: Commit**

---

### Task 5: Persist sessions to SQLite

**Files:**
- Modify: `apps/backend/src/launcher/session.ts`
- Modify: `apps/backend/tests/launcher/session.test.ts`
- Modify: `apps/backend/src/index.ts`

- [ ] **Step 1: Add db to createLauncher deps**

- [ ] **Step 2: Add internal helpers persistSession/removePersistedSession**

Prepared statements for INSERT OR REPLACE and DELETE on sessions table. Called alongside every `sessions.set()` and `sessions.delete()`.

- [ ] **Step 3: Update recover() to read persisted sessions from DB**

On boot, load rows from sessions table. These represent sessions that died with the backend. Clear them from DB, then proceed with existing recovery logic (tmux reconcile + orphan relaunch).

- [ ] **Step 4: Update tests**
- [ ] **Step 5: Update index.ts — pass db**
- [ ] **Step 6: Build + test**
- [ ] **Step 7: Commit**

---

## Chunk 3: Wire Claude Tracker to All Invocation Points

### Task 6: Wire tracker to triage, title, memory agents, autonomous executor, checkup

**Files:**
- Modify: `apps/backend/src/receiver/triage.ts`
- Modify: `apps/backend/src/workspace/title.ts`
- Modify: `apps/backend/src/memory/agents.ts`
- Modify: `apps/backend/src/launcher/autonomous-executor.ts`
- Modify: `apps/backend/src/launcher/checkup.ts`
- Modify: `apps/backend/src/index.ts`

The pattern for each is identical:
1. Add optional `tracker` to the module's deps
2. Call `tracker.start(type, dossierId?, pid?)` before spawning Claude
3. Call `tracker.complete(id, exitCode)` on success
4. Call `tracker.fail(id)` on error

- [ ] **Step 1: Wire triage.ts** — type='triage'
- [ ] **Step 2: Wire title.ts** — type='title'
- [ ] **Step 3: Wire memory/agents.ts** — type='memory-injection', 'memory-extraction', or 'memory-prompt'
- [ ] **Step 4: Wire autonomous-executor.ts** — type='autonomous', include pid
- [ ] **Step 5: Wire checkup.ts** — type='checkup'
- [ ] **Step 6: Wire all in index.ts** — pass tracker to each module
- [ ] **Step 7: Build + test**
- [ ] **Step 8: Commit**

---

## Chunk 4: API and Frontend

### Task 7: Add API endpoint and frontend display

**Files:**
- Modify: `apps/backend/src/server.ts`
- Modify: `apps/web/src/api.ts`
- Modify: `apps/web/src/store.ts`
- Modify: `apps/web/src/pages/Terminal.tsx`

- [ ] **Step 1: Add GET /api/claude-processes endpoint**

Accepts optional query params `type` and `limit` (default 100). Returns ClaudeProcess[].

- [ ] **Step 2: Add fetchClaudeProcesses to api.ts**
- [ ] **Step 3: Add claudeProcesses state + fetch action to store.ts**

Refresh on SSE events `session:started` and `session:ended`.

- [ ] **Step 4: Update Terminal page**

Read current Terminal.tsx first. Replace or augment with a process list showing: status dot (green pulse for running, grey for done, red for error), type badge, dossier name, start time, duration if completed.

- [ ] **Step 5: Build**
- [ ] **Step 6: Commit**

---

## Chunk 5: Boot Wiring and Cleanup

### Task 8: Wire DB in index.ts, periodic cleanup, graceful shutdown

**Files:**
- Modify: `apps/backend/src/index.ts`
- Modify: `.gitignore`

- [ ] **Step 1: Create DB at boot**

```typescript
import { createDatabase } from './infra/database.js';
const DATA_DIR = path.join(WORKSPACE_DIR, '_data');
const db = createDatabase(DATA_DIR);
```

- [ ] **Step 2: Wire db to all modules that need it**

notification-store, dedup, launcher (sessions), tracker. All receive `db` as a parameter.

- [ ] **Step 3: Add periodic cleanup**

Every 24h: `tracker.cleanup(30)` (processes older than 30 days), `dedup.cleanup()` (hashes older than 7 days).

- [ ] **Step 4: Add graceful shutdown**

`db.close()` in the existing graceful shutdown handler.

- [ ] **Step 5: Add workspace/_data/ to .gitignore**

- [ ] **Step 6: Build + full test suite**
- [ ] **Step 7: Commit + push**
