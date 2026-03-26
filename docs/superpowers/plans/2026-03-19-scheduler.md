# Scheduler — Agent Agenda Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unified scheduling system with MCP tools for agent actions and a calendar UI for user visibility.

**Architecture:** SQLite table `schedules` + 10s polling engine replaces the checkup's timing role. An MCP server embedded in the Hono backend exposes structured tools (`schedule_create`, `suggestion_create`, `gap_report`) for agent-backend communication. FullCalendar renders the agent's agenda. The checkup becomes a recurring schedule entry.

**Tech Stack:** better-sqlite3 (existing), `@modelcontextprotocol/sdk` + `@hono/mcp`, `@fullcalendar/react` + timegrid + daygrid + interaction

**Spec:** `docs/design/scheduler.md`

**Note:** The design spec references `features/mcp/` for the MCP server, but `features/mcp/` already exists (MCP management routes: list, toggle, add, remove). The MCP server lives in `features/mcp-server/` to avoid collision.

---

## File Structure

### Backend — new files

```
apps/backend/src/features/scheduler/
  scheduler.ts            — createScheduler() factory: polling engine, fire, dispatch
  routes.ts               — 4 Hono routes (CRUD)
  routes.test.ts          — route tests
  scheduler.test.ts       — unit tests

apps/backend/src/features/mcp-server/
  server.ts               — createMcpServer() factory: registers tools, mounts on Hono
  server.test.ts          — integration tests
  tools/
    schedule.ts           — schedule_create, schedule_list, schedule_delete tool handlers
    schedule.test.ts      — tests
    suggestion.ts         — suggestion_create tool handler
    suggestion.test.ts    — tests
    gap.ts                — gap_report tool handler
    gap.test.ts           — tests
```

### Backend — modified files

```
apps/backend/src/shared/database.ts          — add schedules table DDL
apps/backend/src/shared/agent-config.ts      — add opentidy curated MCP to generateClaudeSettings()
apps/backend/src/boot/periodic-tasks.ts      — remove checkup setInterval, add scheduler.start()
apps/backend/src/features/checkup/sweep.ts   — remove NEXT ACTION guard + sendMessage()
apps/backend/src/server.ts                   — mount scheduler routes + MCP endpoint
apps/backend/src/index.ts                    — wire scheduler + MCP server
```

### Shared — modified files

```
packages/shared/src/types.ts                 — Schedule type, SSE event types, McpConfigV2 curated.opentidy
packages/shared/src/schemas.ts               — CreateScheduleSchema, UpdateScheduleSchema, CuratedMcpStateSchema for opentidy
```

### Frontend — new files

```
apps/web/src/features/schedule/
  SchedulePage.tsx         — FullCalendar week/month/day view
  ScheduleEventModal.tsx   — create/edit/delete modal
```

### Frontend — modified files

```
apps/web/src/App.tsx                         — add /schedule route
apps/web/src/shared/DesktopNav.tsx           — add Schedule nav item
apps/web/src/shared/MobileNav.tsx            — add Schedule nav item
apps/web/src/shared/i18n/locales/en.json     — schedule labels
apps/web/src/shared/i18n/locales/fr.json     — schedule labels
```

---

## Task 1: Shared types and schemas

**Files:**
- Modify: `packages/shared/src/types.ts`
- Modify: `packages/shared/src/schemas.ts`
- Test: `packages/shared/tests/schemas.test.ts`

- [ ] **Step 1: Add Schedule types to types.ts**

Add after the `Session` interface (~line 95):

```typescript
// === Schedule (scheduler) ===
export type ScheduleType = 'once' | 'recurring';
export type ScheduleCreatedBy = 'system' | 'agent' | 'user';

export interface Schedule {
  id: number;
  dossierId: string | null;
  type: ScheduleType;
  runAt: string | null;       // ISO 8601 UTC for one-shot
  intervalMs: number | null;  // milliseconds for recurring
  lastRunAt: string | null;
  instruction: string | null;
  label: string;
  createdBy: ScheduleCreatedBy;
  createdAt: string;
}
```

- [ ] **Step 2: Add SSE event types**

Add to the `SSEEventType` union (~line 123):

```typescript
  | 'schedule:created'
  | 'schedule:fired'
  | 'schedule:deleted'
```

- [ ] **Step 3: Add opentidy to McpConfigV2 curated (optional until Task 7)**

Update the `McpConfigV2` interface (~line 253) — `opentidy` is optional for backward compat with existing configs:

```typescript
export interface McpConfigV2 {
  curated: {
    gmail: McpServiceState;
    camoufox: McpServiceState;
    whatsapp: WhatsAppMcpState;
    opentidy?: McpServiceState;
  };
  marketplace: Record<string, MarketplaceMcp>;
}
```

- [ ] **Step 4: Add Zod schemas to schemas.ts**

Add after the `MemoryCreateSchema` (~line 71):

```typescript
// === Schedule schemas ===
export const CreateScheduleSchema = z.object({
  dossierId: z.string().nullable().default(null),
  type: z.enum(['once', 'recurring']),
  runAt: z.string().datetime().nullable().default(null),
  intervalMs: z.number().int().positive().nullable().default(null),
  instruction: z.string().nullable().default(null),
  label: z.string().min(1),
  createdBy: z.enum(['system', 'agent', 'user']).default('user'),
}).refine(
  (d) => (d.type === 'once' && d.runAt) || (d.type === 'recurring' && d.intervalMs),
  { message: 'once requires runAt, recurring requires intervalMs' },
);

export const UpdateScheduleSchema = z.object({
  label: z.string().min(1).optional(),
  runAt: z.string().datetime().nullable().optional(),
  intervalMs: z.number().int().positive().nullable().optional(),
  instruction: z.string().nullable().optional(),
});

export type CreateScheduleInput = z.infer<typeof CreateScheduleSchema>;
export type UpdateScheduleInput = z.infer<typeof UpdateScheduleSchema>;
```

Update `McpConfigV2Schema` curated to include opentidy (optional with default for existing configs):

```typescript
export const McpConfigV2Schema = z.object({
  curated: z.object({
    gmail: CuratedMcpStateSchema,
    camoufox: CuratedMcpStateSchema,
    whatsapp: CuratedMcpStateSchema.extend({
      wacliPath: z.string(),
      mcpServerPath: z.string(),
    }),
    opentidy: CuratedMcpStateSchema.optional().default({ enabled: true, configured: true }),
  }),
  marketplace: z.record(z.string(), MarketplaceMcpSchema),
});
```

- [ ] **Step 5: Add schema tests**

In `packages/shared/tests/schemas.test.ts`, add tests for `CreateScheduleSchema` validation (once requires runAt, recurring requires intervalMs, rejects invalid combos).

- [ ] **Step 6: Run tests and build**

Run: `pnpm --filter @opentidy/shared test && pnpm --filter @opentidy/shared build`
Expected: All pass, clean build.

- [ ] **Step 7: Commit**

```
git add packages/shared/src/types.ts packages/shared/src/schemas.ts packages/shared/tests/schemas.test.ts
git commit -m "feat(shared): add Schedule types, schemas, and SSE events for scheduler"
```

---

## Task 2: Database — schedules table

**Files:**
- Modify: `apps/backend/src/shared/database.ts`

- [ ] **Step 1: Add schedules table DDL**

Add inside the `db.exec()` block after the `sessions` table (~line 51):

```sql
    CREATE TABLE IF NOT EXISTS schedules (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      dossier_id  TEXT,
      type        TEXT NOT NULL CHECK(type IN ('once', 'recurring')),
      run_at      TEXT,
      interval_ms INTEGER,
      last_run_at TEXT,
      instruction TEXT,
      label       TEXT NOT NULL,
      created_by  TEXT NOT NULL DEFAULT 'system',
      created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    );

    CREATE INDEX IF NOT EXISTS idx_schedules_dossier ON schedules(dossier_id);
```

- [ ] **Step 2: Run backend tests**

Run: `pnpm --filter @opentidy/backend test`
Expected: All existing tests pass (table creation is additive).

- [ ] **Step 3: Commit**

```
git add apps/backend/src/shared/database.ts
git commit -m "feat(backend): add schedules table to SQLite schema"
```

---

## Task 3: Scheduler engine

**Files:**
- Create: `apps/backend/src/features/scheduler/scheduler.ts`
- Create: `apps/backend/src/features/scheduler/scheduler.test.ts`

- [ ] **Step 1: Write scheduler test**

Test file at `apps/backend/src/features/scheduler/scheduler.test.ts`. Test cases:
1. `createScheduler` returns `start()`, `stop()`, `create()`, `list()`, `update()`, `delete()`, `deleteByDossier()`
2. `create()` inserts into DB and returns the schedule
3. `list()` returns all schedules with computed `nextRun`
4. `delete()` removes by id, rejects system schedules
5. `deleteByDossier()` removes all schedules for a dossier
6. Polling fires overdue one-shot: calls `launcher.launchSession()`, deletes schedule
7. Polling fires overdue recurring: calls `checkup.runCheckup()`, updates `last_run_at`
8. Polling skips locked dossiers (once stays in DB for retry)
9. `start()` seeds checkup if no system schedule exists
10. SSE events emitted on create/fire/delete

Use a real SQLite in-memory DB (`new Database(':memory:')`), mock launcher/checkup/locks/sse.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @opentidy/backend test -- scheduler`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement createScheduler()**

File: `apps/backend/src/features/scheduler/scheduler.ts`

Factory function `createScheduler(deps)` with:
- `deps`: `{ db, launcher, checkup, locks, sse }`
- Internal: prepared statements for INSERT, SELECT, UPDATE, DELETE
- `start()`: seed checkup if missing, start `setInterval(checkSchedules, 10_000)`
- `stop()`: clear interval
- `checkSchedules()`: query overdue rows, for each call `fire(schedule)`
- `fire(schedule)`: if `dossierId` then `launcher.launchSession()` (skip if locked, keep once in DB for retry), else `checkup.runCheckup()`. After success: once = DELETE, recurring = UPDATE `last_run_at`. Emit SSE.
- `create(input)`: INSERT, emit SSE `schedule:created`, return schedule
- `list()`: SELECT all, compute `nextRun` for each
- `update(id, input)`: UPDATE, reject if `created_by === 'system'`
- `delete(id)`: DELETE, reject if `created_by === 'system'`, emit SSE
- `deleteByDossier(dossierId)`: DELETE WHERE `dossier_id = ?`

Estimated ~150 lines.

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @opentidy/backend test -- scheduler`
Expected: All pass.

- [ ] **Step 5: Commit**

```
git add apps/backend/src/features/scheduler/
git commit -m "feat(backend): add scheduler engine with polling, fire, and CRUD"
```

---

## Task 4: Scheduler API routes

**Files:**
- Create: `apps/backend/src/features/scheduler/routes.ts`
- Modify: `apps/backend/src/server.ts`

- [ ] **Step 1: Create routes**

File: `apps/backend/src/features/scheduler/routes.ts`

4 routes following existing pattern (see `features/mcp/add.ts` for reference):

```typescript
export interface SchedulerDeps {
  scheduler: ReturnType<typeof createScheduler>;
}

export function schedulerRoutes(deps: SchedulerDeps) {
  const app = new Hono();

  app.get('/schedules', ...);       // list all with computed nextRun
  app.post('/schedules', ...);      // create with CreateScheduleSchema validation
  app.patch('/schedules/:id', ...); // update with UpdateScheduleSchema, reject system
  app.delete('/schedules/:id', ...);// delete, reject system

  return app;
}
```

- [ ] **Step 2: Mount in server.ts**

Add import and mount after the checkup routes (~line 193):

```typescript
import { schedulerRoutes, type SchedulerDeps } from './features/scheduler/routes.js';
```

In `createApp()` deps interface, add `scheduler` field. Mount:

```typescript
if (deps.scheduler) {
  app.route('/api', schedulerRoutes({ scheduler: deps.scheduler }));
}
```

- [ ] **Step 3: Run backend tests**

Run: `pnpm --filter @opentidy/backend test`
Expected: All pass.

- [ ] **Step 4: Commit**

```
git add apps/backend/src/features/scheduler/routes.ts apps/backend/src/server.ts
git commit -m "feat(backend): add scheduler CRUD API routes"
```

---

## Task 5: MCP server — all tools

**Files:**
- Create: `apps/backend/src/features/mcp-server/server.ts`
- Create: `apps/backend/src/features/mcp-server/server.test.ts`
- Create: `apps/backend/src/features/mcp-server/tools/schedule.ts`
- Create: `apps/backend/src/features/mcp-server/tools/schedule.test.ts`
- Create: `apps/backend/src/features/mcp-server/tools/suggestion.ts`
- Create: `apps/backend/src/features/mcp-server/tools/suggestion.test.ts`
- Create: `apps/backend/src/features/mcp-server/tools/gap.ts`
- Create: `apps/backend/src/features/mcp-server/tools/gap.test.ts`

- [ ] **Step 1: Install MCP packages**

```bash
pnpm --filter @opentidy/backend add @modelcontextprotocol/sdk @hono/mcp
```

- [ ] **Step 2: Write schedule tools test**

Test file: `apps/backend/src/features/mcp-server/tools/schedule.test.ts`

Test cases:
1. `schedule_create` with valid once input returns created schedule
2. `schedule_create` with valid recurring input returns created schedule
3. `schedule_create` with invalid input returns error
4. `schedule_list` with dossierId returns filtered list
5. `schedule_list` without dossierId returns all
6. `schedule_delete` with valid id deletes and returns confirmation
7. `schedule_delete` with system schedule returns error

Mock the scheduler dependency.

- [ ] **Step 3: Implement schedule tool handlers**

File: `apps/backend/src/features/mcp-server/tools/schedule.ts`

Export `registerScheduleTools(server, deps)` — registers 3 tools on the MCP server with Zod input schemas. Each tool calls the scheduler's methods and returns structured content.

- [ ] **Step 4: Write suggestion tool test**

Test: `suggestion_create` with valid input calls `suggestionsManager.writeSuggestion()` and emits SSE `suggestion:created`.

- [ ] **Step 5: Implement suggestion tool**

File: `apps/backend/src/features/mcp-server/tools/suggestion.ts`

`registerSuggestionTools(server, deps)` — one tool `suggestion_create` with inputs: `title`, `urgency`, `source`, `summary`, `why`, `whatIWouldDo`. Calls the existing suggestions manager to write the markdown file.

- [ ] **Step 6: Write gap tool test**

Test: `gap_report` with valid input calls `gapsManager.appendGap()` and emits SSE `amelioration:created`.

- [ ] **Step 7: Implement gap tool**

File: `apps/backend/src/features/mcp-server/tools/gap.ts`

`registerGapTools(server, deps)` — one tool `gap_report` with inputs: `title`, `problem`, `impact`, `suggestion`. Calls the existing gaps manager to append to gaps.md.

- [ ] **Step 8: Write MCP server integration test**

File: `apps/backend/src/features/mcp-server/server.test.ts`

Test that `createMcpServer(deps)` returns a server with all expected tools registered (`schedule_create`, `schedule_list`, `schedule_delete`, `suggestion_create`, `gap_report`).

- [ ] **Step 9: Implement createMcpServer()**

File: `apps/backend/src/features/mcp-server/server.ts`

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPTransport } from '@hono/mcp';

export function createMcpServer(deps: McpServerDeps) {
  const server = new McpServer({ name: 'opentidy', version: '1.0.0' });

  registerScheduleTools(server, deps);
  registerSuggestionTools(server, deps);
  registerGapTools(server, deps);

  return { server, transport: new StreamableHTTPTransport() };
}
```

Mount on Hono: `app.all('/mcp', ...)` outside the `/api/*` auth middleware (localhost only).

- [ ] **Step 10: Run all MCP tests**

Run: `pnpm --filter @opentidy/backend test -- mcp-server`
Expected: All pass.

- [ ] **Step 11: Commit**

```
git add apps/backend/package.json pnpm-lock.yaml apps/backend/src/features/mcp-server/
git commit -m "feat(backend): add MCP server with schedule, suggestion, and gap tools"
```

---

## Task 6: Curated MCP integration

**Files:**
- Modify: `apps/backend/src/shared/agent-config.ts`
- Modify: `apps/backend/src/shared/config.ts`

- [ ] **Step 1: Update McpServerDef to support HTTP type**

In `apps/backend/src/shared/agent-config.ts`, change the interface to a discriminated union:

```typescript
type McpServerDef = {
  type: 'stdio';
  command: string;
  args: string[];
  cwd?: string;
  env?: Record<string, string>;
} | {
  type: 'http';
  url: string;
};
```

**IMPORTANT:** Also add `type: 'stdio'` explicitly to ALL existing MCP server object literals in `generateClaudeSettings()` (Gmail ~line 56, Camoufox ~line 67, WhatsApp ~line 81, marketplace ~line 93). The current code omits `type` because the old interface had a single shape. With the union, TypeScript requires it.

- [ ] **Step 2: Add opentidy to generateClaudeSettings()**

After the WhatsApp block (~line 87), add:

```typescript
  // Curated: OpenTidy (embedded HTTP MCP)
  if (mcp.curated.opentidy?.enabled) {
    allow.push('mcp__opentidy__*');
    mcpServers.opentidy = {
      type: 'http',
      url: `http://localhost:${config.server?.port || 5175}/mcp`,
    };
  }
```

- [ ] **Step 3: Default opentidy in config loader**

In `apps/backend/src/shared/config.ts`, add `opentidy: { enabled: true, configured: true }` to `DEFAULT_CONFIG.mcp.curated` so existing installs get it automatically.

- [ ] **Step 4: Run backend tests**

Run: `pnpm --filter @opentidy/backend test`
Expected: All pass.

- [ ] **Step 5: Commit**

```
git add apps/backend/src/shared/agent-config.ts apps/backend/src/shared/config.ts
git commit -m "feat(backend): add opentidy as curated MCP in agent config generation"
```

---

## Task 7: Wire scheduler and MCP into boot sequence

**Files:**
- Modify: `apps/backend/src/index.ts`
- Modify: `apps/backend/src/boot/periodic-tasks.ts`

- [ ] **Step 1: Create scheduler and MCP server in index.ts**

After the checkup creation (~line 255), add imports and instantiation:

```typescript
import { createScheduler } from './features/scheduler/scheduler.js';
import { createMcpServer } from './features/mcp-server/server.js';

const scheduler = createScheduler({ db, launcher, checkup, locks, sse });

const mcpServer = createMcpServer({
  scheduler,
  suggestionsManager,
  gapsManager,
  sse,
  workspaceDir: WORKSPACE_DIR,
});
```

Pass `scheduler` to `createApp()` deps. Pass `mcpServer` for `/mcp` route mounting.

- [ ] **Step 2: Mount MCP in server.ts**

Add `/mcp` route in `createApp()` outside the auth middleware prefix:

```typescript
if (deps.mcpServer) {
  app.all('/mcp', async (c) => {
    // MCP Streamable HTTP handler
  });
}
```

- [ ] **Step 3: Update periodic-tasks.ts**

Add `scheduler` to `PeriodicTasksDeps`. Remove checkup setInterval. Call `deps.scheduler.start()` instead. Update `stop()` to call `deps.scheduler.stop()`.

What stays in periodic-tasks.ts:
- Crash recovery (boot only)
- Session health check (30s)
- Daily cleanup
- Workspace watcher
- `scheduler.start()` (replaces checkup setInterval)

- [ ] **Step 4: Update index.ts to pass scheduler to periodic tasks**

Pass `scheduler` in the `startPeriodicTasks()` call.

- [ ] **Step 5: Run all backend tests**

Run: `pnpm --filter @opentidy/backend test`
Expected: All pass.

- [ ] **Step 6: Commit**

```
git add apps/backend/src/index.ts apps/backend/src/boot/periodic-tasks.ts apps/backend/src/server.ts
git commit -m "feat(backend): wire scheduler and MCP server into boot sequence"
```

---

## Task 8: Simplify checkup sweep

**Files:**
- Modify: `apps/backend/src/features/checkup/sweep.ts`
- Modify: `apps/backend/src/features/checkup/sweep.test.ts`

- [ ] **Step 1: Remove NEXT ACTION guard**

In `sweep.ts`, remove the `NEXT ACTION` date parsing and the guard that skips dossiers with future dates (~lines 119-126). The scheduler now handles precise timing.

- [ ] **Step 2: Remove sendMessage() for active sessions**

Remove the code path that calls `sendMessage()` to inject prompts into active sessions. If a session is active, skip that dossier entirely.

- [ ] **Step 3: Remove getStatus() in-memory tracking**

The checkup status can now be read from the schedules table (last_run_at of the checkup entry). Remove the in-memory status tracking.

- [ ] **Step 4: Update checkup tests**

Remove tests for NEXT ACTION guard and sendMessage behavior. Add test confirming active sessions are skipped (not messaged).

- [ ] **Step 5: Run tests**

Run: `pnpm --filter @opentidy/backend test -- sweep`
Expected: All pass.

- [ ] **Step 6: Commit**

```
git add apps/backend/src/features/checkup/sweep.ts apps/backend/src/features/checkup/sweep.test.ts
git commit -m "refactor(backend): simplify checkup — remove NEXT ACTION guard and sendMessage"
```

---

## Task 9: Install FullCalendar packages

**Files:**
- Modify: `apps/web/package.json`

- [ ] **Step 1: Install FullCalendar**

```bash
pnpm --filter @opentidy/web add @fullcalendar/react @fullcalendar/core @fullcalendar/timegrid @fullcalendar/daygrid @fullcalendar/interaction
```

- [ ] **Step 2: Verify install**

Run: `pnpm --filter @opentidy/web build`
Expected: Clean build.

- [ ] **Step 3: Commit**

```
git add apps/web/package.json pnpm-lock.yaml
git commit -m "chore(web): add FullCalendar packages for schedule view"
```

---

## Task 10: Frontend — Schedule page

**Files:**
- Create: `apps/web/src/features/schedule/SchedulePage.tsx`
- Create: `apps/web/src/features/schedule/ScheduleEventModal.tsx`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/shared/DesktopNav.tsx`
- Modify: `apps/web/src/shared/MobileNav.tsx`
- Modify: `apps/web/src/shared/i18n/locales/en.json`
- Modify: `apps/web/src/shared/i18n/locales/fr.json`

- [ ] **Step 1: Add i18n labels**

In `en.json` add: `"schedule": "Schedule"`, `"scheduleCreate": "Create schedule"`, `"scheduleEdit": "Edit schedule"`, `"scheduleDelete": "Delete schedule"`

In `fr.json` add: `"schedule": "Agenda"`, `"scheduleCreate": "Créer un schedule"`, `"scheduleEdit": "Modifier"`, `"scheduleDelete": "Supprimer"`

- [ ] **Step 2: Create ScheduleEventModal**

File: `apps/web/src/features/schedule/ScheduleEventModal.tsx`

Modal component for creating/editing/deleting a schedule. Fields: label, type (once/recurring), date/time or interval, dossier (optional dropdown), instruction (optional textarea). Calls `POST/PATCH/DELETE /api/schedules`.

- [ ] **Step 3: Create SchedulePage**

File: `apps/web/src/features/schedule/SchedulePage.tsx`

- Fetch `GET /api/schedules` on mount
- Expand recurring schedules into synthetic events client-side for the visible date range (compute occurrences from `lastRunAt` + `intervalMs` within the visible window)
- Render FullCalendar with timegrid week view (default), daygrid month, timegrid day
- Color events by dossier (hash dossier ID to a color), gray for system
- `dateClick` callback opens modal to create
- `eventClick` callback opens modal to edit/delete
- `eventDrop` / `eventResize` callbacks PATCH the schedule's `runAt`
- Listen to SSE `schedule:*` events to refresh the calendar

- [ ] **Step 4: Add route in App.tsx**

Add `<Route path="/schedule" element={<SchedulePage />} />` alongside existing routes.

- [ ] **Step 5: Add nav items**

In `DesktopNav.tsx`, add "Schedule" / "Agenda" link with a calendar icon between Terminal and Ameliorations. In `MobileNav.tsx`, add between Nouveau and Ameliorations.

- [ ] **Step 6: Run frontend build**

Run: `pnpm --filter @opentidy/web build`
Expected: Clean build.

- [ ] **Step 7: Commit**

```
git add apps/web/src/features/schedule/ apps/web/src/App.tsx apps/web/src/shared/DesktopNav.tsx apps/web/src/shared/MobileNav.tsx apps/web/src/shared/i18n/
git commit -m "feat(web): add Schedule page with FullCalendar and event modal"
```

---

## Task 11: Update INSTRUCTIONS.md and cleanup

**Files:**
- Modify: `apps/backend/src/features/sessions/instruction-file.ts` (template)
- Modify: `apps/backend/src/features/dossiers/complete.ts`

- [ ] **Step 1: Add schedule cleanup on dossier archive**

In `complete.ts`, after marking dossier complete, call `scheduler.deleteByDossier(dossierId)` to cascade delete schedules. Pass scheduler as a dep.

- [ ] **Step 2: Update instruction file template**

In the instruction file generator (`instruction-file.ts`), add a section documenting available MCP tools:

```markdown
## Available MCP Tools (OpenTidy)

- `mcp__opentidy__schedule_create` — Schedule a future action
  - once: { type: "once", runAt: "ISO-datetime", label: "...", dossierId: "..." }
  - recurring: { type: "recurring", intervalMs: N, label: "...", dossierId: "..." }
- `mcp__opentidy__schedule_list` — List schedules (optional dossierId filter)
- `mcp__opentidy__schedule_delete` — Remove a schedule by id
- `mcp__opentidy__suggestion_create` — Suggest a new dossier
- `mcp__opentidy__gap_report` — Report a capability gap

Do NOT write NEXT ACTION in state.md. Use schedule_create instead.
```

- [ ] **Step 3: Run all tests**

Run: `pnpm test && pnpm --filter @opentidy/web build`
Expected: All pass, clean build.

- [ ] **Step 4: Commit**

```
git add apps/backend/src/features/dossiers/complete.ts apps/backend/src/features/sessions/instruction-file.ts
git commit -m "feat(backend): cascade delete schedules on dossier archive, update agent instructions"
```

---

## Task 12: E2E smoke test

- [ ] **Step 1: Manual smoke test**

1. Start backend: `pnpm dev`
2. Verify `GET /api/schedules` returns the seeded checkup schedule
3. Create a one-shot schedule via API
4. Verify it appears in `GET /api/schedules`
5. Verify it appears in the calendar UI at `/schedule`
6. Wait for it to fire (or set `runAt` to now)
7. Verify it's deleted after firing
8. Delete a schedule via API
9. Verify SSE events are emitted

- [ ] **Step 2: Verify MCP tools**

1. In a Claude Code session with the opentidy MCP configured, verify tools are discoverable
2. Test `schedule_create`, `schedule_list`, `schedule_delete`

- [ ] **Step 3: Final commit if any fixes**

```
git commit -m "test: scheduler smoke test fixes"
```
