# Alfred v3 — Refactor TMux Permanent

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer le mode autonome (child process `claude -p` NDJSON) par des sessions tmux permanentes pour les dossiers. Les utilitaires (triage, title, memory) restent en `claude -p` one-shot.

**Architecture:** Chaque dossier actif = une session tmux avec `claude` interactif + ttyd pour l'accès web. L'interaction se fait via `tmux send-keys` (triage, checkup, instruction utilisateur). Le hook `Stop` détecte quand Claude a fini son tour. L'archivage est manuel.

**Tech Stack:** Node.js, Hono, tmux, ttyd, React 19, Zustand, xterm.js

---

## Chunk 1: Backend — Supprimer le mode autonome

### Task 1: Supprimer autonomous-executor.ts

**Files:**
- Delete: `apps/backend/src/launcher/autonomous-executor.ts`
- Modify: `apps/backend/src/launcher/session.ts` (remove import)

- [ ] **Step 1: Remove import of parseStreamEvent from session.ts**

In `apps/backend/src/launcher/session.ts`, remove line 6:
```typescript
// DELETE THIS LINE:
import { parseStreamEvent } from './autonomous-executor.js';
```

- [ ] **Step 2: Delete autonomous-executor.ts**

```bash
rm apps/backend/src/launcher/autonomous-executor.ts
```

- [ ] **Step 3: Delete autonomous-executor test**

```bash
rm apps/backend/tests/launcher/autonomous-executor.test.ts
```

- [ ] **Step 4: Verify build**

Run: `cd apps/backend && pnpm build`
Expected: Build errors in session.ts (references to parseStreamEvent, processHandle, etc.) — that's expected, we'll fix those in Task 2.

---

### Task 2: Réécrire session.ts (tmux-only)

**Files:**
- Rewrite: `apps/backend/src/launcher/session.ts`
- Modify: `apps/backend/tests/launcher/session.test.ts`

Le nouveau session.ts fait ~120 LOC. Fonctions : `launchSession`, `sendMessage`, `markWaiting`, `archiveSession`, `terminateSession`, `listActiveSessions`, `recover`.

- [ ] **Step 1: Write the failing test for launchSession**

Replace `apps/backend/tests/launcher/session.test.ts` with new tests. The key test:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createLauncher } from '../../src/launcher/session.js';

function createMockDeps() {
  return {
    tmuxExecutor: {
      launchTmux: vi.fn().mockResolvedValue(12345),
      sendKeys: vi.fn().mockResolvedValue(undefined),
      capturePane: vi.fn().mockResolvedValue(''),
      killSession: vi.fn().mockResolvedValue(undefined),
      listSessions: vi.fn().mockResolvedValue([]),
    },
    locks: {
      acquire: vi.fn().mockReturnValue(true),
      release: vi.fn(),
      isLocked: vi.fn().mockReturnValue(false),
      cleanupStaleLocks: vi.fn().mockReturnValue([]),
    },
    workspace: {
      getDossier: vi.fn().mockReturnValue({
        id: 'test', title: 'Test', objective: 'Obj', status: 'EN COURS',
      }),
      listDossierIds: vi.fn().mockReturnValue([]),
      dir: '/tmp/test-workspace',
    },
    notify: {
      notifyStarted: vi.fn(),
      notifyCheckpoint: vi.fn(),
      notifyCompleted: vi.fn(),
    },
    sse: { emit: vi.fn() },
    workspaceDir: '/tmp/test-workspace',
    terminal: {
      ensureReady: vi.fn().mockResolvedValue(8200),
      killTtyd: vi.fn(),
    },
  };
}

describe('createLauncher (tmux-only)', () => {
  it('launchSession creates tmux session and starts ttyd', async () => {
    const deps = createMockDeps();
    const launcher = createLauncher(deps);

    await launcher.launchSession('test-dossier', { source: 'app', content: 'Do something' });

    expect(deps.locks.acquire).toHaveBeenCalledWith('test-dossier');
    expect(deps.tmuxExecutor.launchTmux).toHaveBeenCalledWith(
      'alfred-test-dossier',
      expect.stringContaining('claude'),
    );
    expect(deps.terminal.ensureReady).toHaveBeenCalledWith('alfred-test-dossier');
    expect(deps.sse.emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'session:started' }),
    );
  });

  it('launchSession skips if session already active', async () => {
    const deps = createMockDeps();
    const launcher = createLauncher(deps);

    await launcher.launchSession('test-dossier');
    await launcher.launchSession('test-dossier');

    expect(deps.tmuxExecutor.launchTmux).toHaveBeenCalledTimes(1);
  });

  it('sendMessage sends keys to tmux session', async () => {
    const deps = createMockDeps();
    const launcher = createLauncher(deps);

    await launcher.launchSession('test-dossier');
    await launcher.sendMessage('test-dossier', 'Nouvel email de X');

    expect(deps.tmuxExecutor.sendKeys).toHaveBeenCalledWith(
      'alfred-test-dossier',
      'Nouvel email de X\n',
    );
  });

  it('archiveSession kills tmux and ttyd', async () => {
    const deps = createMockDeps();
    const launcher = createLauncher(deps);

    await launcher.launchSession('test-dossier');
    await launcher.archiveSession('test-dossier');

    expect(deps.tmuxExecutor.killSession).toHaveBeenCalledWith('alfred-test-dossier');
    expect(deps.terminal.killTtyd).toHaveBeenCalledWith('alfred-test-dossier');
    expect(deps.locks.release).toHaveBeenCalledWith('test-dossier');
    expect(launcher.listActiveSessions()).toHaveLength(0);
  });

  it('recover reconciles existing tmux sessions', async () => {
    const deps = createMockDeps();
    deps.tmuxExecutor.listSessions.mockResolvedValue(['alfred-dossier-a', 'alfred-dossier-b', 'other-session']);
    const launcher = createLauncher(deps);

    await launcher.recover();

    const sessions = launcher.listActiveSessions();
    expect(sessions).toHaveLength(2);
    expect(sessions.map(s => s.dossierId)).toEqual(['dossier-a', 'dossier-b']);
  });

  it('markWaiting sets session status to idle', async () => {
    const deps = createMockDeps();
    const launcher = createLauncher(deps);

    await launcher.launchSession('test-dossier');
    launcher.markWaiting('test-dossier');

    const sessions = launcher.listActiveSessions();
    expect(sessions[0].status).toBe('idle');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/backend && pnpm test -- tests/launcher/session.test.ts`
Expected: FAIL (old session.ts has incompatible interface)

- [ ] **Step 3: Rewrite session.ts**

Replace `apps/backend/src/launcher/session.ts` with:

```typescript
import fs from 'fs';
import path from 'path';
import type { Session } from '@opentidy/shared';

export interface SessionExecutor {
  launchTmux(name: string, command: string): Promise<number>;
  sendKeys(name: string, keys: string): Promise<void>;
  capturePane(name: string): Promise<string>;
  killSession(name: string): Promise<void>;
  listSessions(): Promise<string[]>;
}

interface LockManager {
  acquire(dossierId: string): boolean;
  release(dossierId: string): void;
  isLocked?(dossierId: string): boolean;
  cleanupStaleLocks?(): string[];
}

interface WorkspaceManager {
  getDossier(id: string): { id: string; title: string; objective: string; status: string; confirm?: boolean };
  listDossierIds(): string[];
  dir: string;
}

interface Notifier {
  notifyStarted?(dossierId: string): void;
  notifyCheckpoint(dossierId: string, summary: string): void;
  notifyCompleted(dossierId: string): void;
}

interface SSEEmitter {
  emit(event: { type: string; data: Record<string, unknown>; timestamp: string }): void;
}

export function createLauncher(deps: {
  tmuxExecutor: SessionExecutor;
  locks: LockManager;
  workspace: WorkspaceManager;
  notify: Notifier;
  sse: SSEEmitter;
  workspaceDir: string;
  terminal: { ensureReady: (name: string) => Promise<number | undefined>; killTtyd: (name: string) => void };
}) {
  const sessions = new Map<string, Session>();

  async function launchSession(dossierId: string, event?: { source: string; content: string }): Promise<void> {
    if (sessions.has(dossierId)) {
      console.log(`[launcher] ${dossierId} already has active session, skipping`);
      return;
    }

    if (!deps.locks.acquire(dossierId)) {
      console.log(`[launcher] ${dossierId} already locked, skipping`);
      return;
    }

    try {
      const dossierDir = path.join(deps.workspaceDir, dossierId);
      const sessionName = `alfred-${dossierId}`;

      // Generate dossier CLAUDE.md
      generateDossierClaudeMd(dossierId, event);

      // Build claude command
      const instruction = event?.content ?? 'Lis state.md et continue ton travail.';
      const resumeId = readSessionId(dossierDir);
      const claudeCmd = buildClaudeCommand(dossierDir, instruction, resumeId);

      // Launch tmux session
      console.log(`[launcher] launching tmux session ${sessionName}`);
      const pid = await deps.tmuxExecutor.launchTmux(sessionName, claudeCmd);

      // Start ttyd for web access
      await deps.terminal.ensureReady(sessionName);

      // Track session
      const session: Session = {
        id: sessionName,
        dossierId,
        status: 'active',
        startedAt: new Date().toISOString(),
        claudeSessionId: resumeId,
        pid,
      };
      sessions.set(dossierId, session);

      deps.sse.emit({ type: 'session:started', data: { dossierId }, timestamp: new Date().toISOString() });
      deps.notify.notifyStarted?.(dossierId);
      console.log(`[launcher] ${dossierId} session started (pid: ${pid})`);
    } catch (err) {
      console.error(`[launcher] ${dossierId}: launchSession failed, releasing lock:`, err);
      deps.locks.release(dossierId);
      throw err;
    }
  }

  async function sendMessage(dossierId: string, message: string): Promise<void> {
    const session = sessions.get(dossierId);
    if (!session) {
      console.warn(`[launcher] sendMessage: no active session for ${dossierId}`);
      return;
    }
    await deps.tmuxExecutor.sendKeys(`alfred-${dossierId}`, message + '\n');
    session.status = 'active';
    deps.sse.emit({ type: 'session:active', data: { dossierId }, timestamp: new Date().toISOString() });
    console.log(`[launcher] sent message to ${dossierId}`);
  }

  function markWaiting(dossierId: string): void {
    const session = sessions.get(dossierId);
    if (!session) return;
    session.status = 'idle';
    deps.sse.emit({ type: 'session:idle', data: { dossierId }, timestamp: new Date().toISOString() });
  }

  function handleSessionEnd(dossierId: string): void {
    deps.locks.release(dossierId);
    deps.terminal.killTtyd(`alfred-${dossierId}`);
    sessions.delete(dossierId);
    deps.sse.emit({ type: 'session:ended', data: { dossierId }, timestamp: new Date().toISOString() });
  }

  async function archiveSession(dossierId: string): Promise<void> {
    const sessionName = `alfred-${dossierId}`;
    deps.terminal.killTtyd(sessionName);
    await deps.tmuxExecutor.killSession(sessionName);
    deps.locks.release(dossierId);
    sessions.delete(dossierId);
    deps.sse.emit({ type: 'session:ended', data: { dossierId }, timestamp: new Date().toISOString() });
    console.log(`[launcher] session archived: ${dossierId}`);
  }

  async function terminateSession(dossierId: string): Promise<void> {
    return archiveSession(dossierId);
  }

  function listActiveSessions(): Session[] {
    return Array.from(sessions.values());
  }

  async function recover(): Promise<void> {
    const activeTmux = await deps.tmuxExecutor.listSessions();
    for (const name of activeTmux.filter(s => s.startsWith('alfred-'))) {
      const dossierId = name.replace('alfred-', '');
      const dossierDir = path.join(deps.workspaceDir, dossierId);
      if (!fs.existsSync(dossierDir)) continue;
      if (!deps.locks.acquire(dossierId)) continue;

      sessions.set(dossierId, {
        id: name,
        dossierId,
        status: 'active',
        startedAt: new Date().toISOString(),
      });

      // Ensure ttyd is running for recovered sessions
      await deps.terminal.ensureReady(name);
      console.log(`[launcher] recovered session: ${dossierId}`);
    }

    if (deps.locks.cleanupStaleLocks) {
      deps.locks.cleanupStaleLocks();
    }
    console.log(`[launcher] recovery complete: ${sessions.size} sessions active`);
  }

  // --- Private helpers ---

  function generateDossierClaudeMd(dossierId: string, event?: { source: string; content: string }): void {
    const dossierDir = path.join(deps.workspaceDir, dossierId);
    const state = deps.workspace.getDossier(dossierId);
    let content = `# Dossier : ${state.title}\n\n## Objectif\n${state.objective}\n`;
    if (event) {
      content += `\n## Event declencheur\nSource: ${event.source}\n${event.content}\n`;
    }
    if (state.confirm) {
      content += `\n## Mode Validation\nCe dossier est en mode validation. Avant toute action externe, tu DOIS ecrire un checkpoint.md et attendre la confirmation de l'utilisateur.\n`;
    }
    content += `\n## Fin de travail\nQuand tu as termine ton travail sur ce dossier, mets a jour STATUT: TERMINE dans state.md.\n`;
    fs.writeFileSync(path.join(dossierDir, 'CLAUDE.md'), content);
  }

  function readSessionId(dossierDir: string): string | undefined {
    const sessionIdFile = path.join(dossierDir, '.session-id');
    try {
      return fs.readFileSync(sessionIdFile, 'utf-8').trim() || undefined;
    } catch {
      return undefined;
    }
  }

  function buildClaudeCommand(dossierDir: string, instruction: string, resumeId?: string): string {
    const pluginDir = path.resolve(deps.workspaceDir, '..', 'plugins', 'opentidy-hooks');
    const pluginFlag = fs.existsSync(pluginDir) ? ` --plugin-dir ${pluginDir}` : '';
    const resumeFlag = resumeId ? ` --resume ${resumeId}` : '';
    // Escape single quotes in instruction
    const escapedInstruction = instruction.replace(/'/g, "'\\''");
    return `cd ${dossierDir} && claude --dangerously-skip-permissions${pluginFlag}${resumeFlag} '${escapedInstruction}'`;
  }

  return {
    launchSession,
    sendMessage,
    markWaiting,
    handleSessionEnd,
    archiveSession,
    terminateSession,
    listActiveSessions,
    recover,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/backend && pnpm test -- tests/launcher/session.test.ts`
Expected: All 5 tests PASS

- [ ] **Step 5: Delete obsolete test files**

```bash
rm -f apps/backend/tests/launcher/lifecycle-autonomous.test.ts
rm -f apps/backend/tests/launcher/lifecycle.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/launcher/session.ts apps/backend/src/launcher/autonomous-executor.ts apps/backend/tests/launcher/
git commit -m "refactor(launcher): rewrite session.ts to tmux-only, delete autonomous-executor"
```

---

### Task 3: Modifier checkup.ts (sendMessage au lieu de launchSession)

**Files:**
- Modify: `apps/backend/src/launcher/checkup.ts`
- Modify: `apps/backend/tests/launcher/checkup.test.ts`

Le checkup garde le `claude -p` pour l'analyse, mais au lieu de lancer de nouvelles sessions, il envoie des messages aux terminaux existants via `sendMessage`. Pour les dossiers sans terminal actif, il les lance.

- [ ] **Step 1: Update checkup deps interface**

In `apps/backend/src/launcher/checkup.ts`, change the launcher dep:

```typescript
// BEFORE
launcher: { launchSession: (id: string) => Promise<void> };

// AFTER
launcher: {
  launchSession: (id: string) => Promise<void>;
  sendMessage: (id: string, message: string) => Promise<void>;
  listActiveSessions: () => Array<{ dossierId: string }>;
};
```

- [ ] **Step 2: Update the launch logic**

Replace the launch loop (lines 96-114) with:

```typescript
    const activeDossierIds = new Set(deps.launcher.listActiveSessions().map(s => s.dossierId));
    const validLaunches: string[] = [];
    for (const dossierId of result.launch) {
      try {
        const statePath = path.join(deps.workspaceDir, dossierId, 'state.md');
        const stateContent = fs.readFileSync(statePath, 'utf-8');
        const prochaineMatch = stateContent.match(/PROCHAINE ACTION\s*:\s*(\d{4}-\d{2}-\d{2}[\sT]\d{2}:\d{2})/);
        if (prochaineMatch) {
          const nextDate = new Date(prochaineMatch[1].replace(' ', 'T'));
          if (nextDate.getTime() > Date.now()) {
            console.log(`[checkup] ${dossierId} PROCHAINE ACTION not reached yet, skipping`);
            continue;
          }
        }
        validLaunches.push(dossierId);
        if (activeDossierIds.has(dossierId)) {
          // Terminal already open — send a message to wake Claude
          await deps.launcher.sendMessage(dossierId, 'Checkup: reprends ton travail, les conditions sont remplies.');
        } else {
          // No terminal — launch a new session
          await deps.launcher.launchSession(dossierId);
        }
      } catch (err) {
        console.warn(`[checkup] failed to handle ${dossierId}:`, err);
      }
    }
```

- [ ] **Step 3: Update checkup test**

In `apps/backend/tests/launcher/checkup.test.ts`, add `sendMessage` and `listActiveSessions` to the mock launcher.

- [ ] **Step 4: Run tests**

Run: `cd apps/backend && pnpm test -- tests/launcher/checkup.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/launcher/checkup.ts apps/backend/tests/launcher/checkup.test.ts
git commit -m "refactor(checkup): use sendMessage for active terminals instead of launchSession"
```

---

### Task 4: Modifier hooks handler (Stop → markWaiting)

**Files:**
- Modify: `apps/backend/src/hooks/handler.ts`

- [ ] **Step 1: Update Launcher interface**

```typescript
// BEFORE
interface Launcher {
  handleSessionEnd(dossierId: string, claudeSessionId?: string): void;
  handleIdle(dossierId: string, timeoutMs?: number): void;
  handleHookEvent(dossierId: string, hookName: string): void;
}

// AFTER
interface Launcher {
  handleSessionEnd(dossierId: string): void;
  markWaiting(dossierId: string): void;
}
```

- [ ] **Step 2: Simplify handleStop**

```typescript
  function handleStop(dossierId: string, payload: HookPayload): void {
    // Claude finished its turn — mark session as waiting for input
    deps.launcher.markWaiting(dossierId);
    deps.sse.emit({
      type: 'session:idle',
      data: { dossierId },
      timestamp: new Date().toISOString(),
    });
  }
```

- [ ] **Step 3: Simplify handleNotification**

```typescript
  function handleNotification(dossierId: string, payload: HookPayload): void {
    // idle_prompt — Claude has been idle, notify the user
    deps.notify.notifyIdle?.(dossierId);
  }
```

- [ ] **Step 4: Remove handleHookEvent calls from PreToolUse/PostToolUse**

Keep audit logging but remove `deps.launcher.handleHookEvent(...)` calls.

- [ ] **Step 5: Simplify handleSessionEnd**

```typescript
  function handleSessionEnd(dossierId: string, payload: HookPayload): void {
    deps.launcher.handleSessionEnd(dossierId);
  }
```

- [ ] **Step 6: Run tests**

Run: `cd apps/backend && pnpm test -- tests/hooks/`
Expected: May need test updates — update mocks to match new Launcher interface.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/hooks/handler.ts apps/backend/tests/hooks/
git commit -m "refactor(hooks): Stop hook marks session waiting, simplify handler"
```

---

## Chunk 2: Backend — Types, routes, triage

### Task 5: Mettre à jour les types partagés

**Files:**
- Modify: `packages/shared/src/types.ts`

- [ ] **Step 1: Remove `mode` from Session**

```typescript
// BEFORE
export interface Session {
  id: string;
  dossierId: string;
  status: SessionStatus;
  startedAt: string;
  claudeSessionId?: string;
  pid?: number;
  mode: 'autonomous' | 'interactive';
}

// AFTER
export interface Session {
  id: string;
  dossierId: string;
  status: SessionStatus;
  startedAt: string;
  claudeSessionId?: string;
  pid?: number;
}
```

- [ ] **Step 2: Simplify SessionStatus**

```typescript
// BEFORE
export type SessionStatus = 'active' | 'idle' | 'mfa' | 'finished' | 'takeover';

// AFTER
export type SessionStatus = 'active' | 'idle';
```

- [ ] **Step 3: Remove 'autonomous' from ClaudeProcessType**

```typescript
// BEFORE
export type ClaudeProcessType = 'autonomous' | 'triage' | 'checkup' | 'title' | 'memory-injection' | 'memory-extraction' | 'memory-prompt' | 'interactive';

// AFTER
export type ClaudeProcessType = 'triage' | 'checkup' | 'title' | 'memory-injection' | 'memory-extraction' | 'memory-prompt';
```

- [ ] **Step 4: Remove 'session:mode-changed' from SSEEventType**

```typescript
// Remove 'session:mode-changed' from the union type
// Remove 'process:output' if no longer needed (one-shots don't stream to frontend)
```

- [ ] **Step 5: Build shared package**

Run: `cd packages/shared && pnpm build`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/types.ts
git commit -m "refactor(shared): remove autonomous mode from types"
```

---

### Task 6: Mettre à jour server.ts

**Files:**
- Modify: `apps/backend/src/server.ts`

- [ ] **Step 1: Remove take-control and release-control routes**

Delete these route handlers:
- `POST /api/session/:id/take-control`
- `POST /api/session/:id/release-control`

- [ ] **Step 2: Add sendMessage to launcher interface in AppDeps**

```typescript
// In AppDeps.launcher, add:
sendMessage(id: string, message: string): Promise<void>;
```

- [ ] **Step 3: Update POST /api/dossier/:id/instruction to use sendMessage**

```typescript
    // POST /api/dossier/:id/instruction
    app.post('/api/dossier/:id/instruction', async (c) => {
      const id = c.req.param('id');
      const body = await c.req.json();
      // If session already active, send message to terminal
      const activeSessions = deps.launcher.listActiveSessions();
      const hasActive = activeSessions.some((s) => s.dossierId === id);
      if (hasActive) {
        await deps.launcher.sendMessage(id, body.instruction);
      } else {
        await deps.launcher.launchSession(id, { source: 'app', content: body.instruction });
      }
      return c.json({ launched: true });
    });
```

- [ ] **Step 4: Verify build**

Run: `cd apps/backend && pnpm build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/server.ts
git commit -m "refactor(server): remove mode switching routes, add sendMessage support"
```

---

### Task 7: Mettre à jour triage-handler.ts

**Files:**
- Modify: `apps/backend/src/utils/triage-handler.ts`

- [ ] **Step 1: Update launcher interface**

```typescript
// BEFORE
interface TriageHandlerDeps {
  launcher: { launchSession(id: string, event?: { source: string; content: string }): Promise<void> };
  ...
}

// AFTER
interface TriageHandlerDeps {
  launcher: {
    launchSession(id: string, event?: { source: string; content: string }): Promise<void>;
    sendMessage(id: string, message: string): Promise<void>;
    listActiveSessions(): Array<{ dossierId: string }>;
  };
  ...
}
```

- [ ] **Step 2: Update handleTriageResult to use sendMessage for active sessions**

```typescript
  return async function handleTriageResult(
    result: TriageResult,
    event: { source: string; content: string },
  ): Promise<void> {
    if (result.dossierIds) {
      const activeIds = new Set(deps.launcher.listActiveSessions().map(s => s.dossierId));
      for (const id of result.dossierIds) {
        if (activeIds.has(id)) {
          // Terminal already open — send event as message
          await deps.launcher.sendMessage(id, `Nouvel event (${event.source}): ${event.content}`);
        } else {
          await deps.launcher.launchSession(id, event);
        }
      }
    }
    if (result.suggestion) {
      const slug = writeSuggestion(result.suggestion, event.source, event.content);
      deps.sse.emit({ type: 'suggestion:created', data: { slug }, timestamp: new Date().toISOString() });
      await deps.notify.notifySuggestion(result.suggestion.title, result.suggestion.urgency as UrgencyLevel);
    }
  };
```

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/utils/triage-handler.ts
git commit -m "refactor(triage): use sendMessage for active terminals"
```

---

### Task 8: Mettre à jour index.ts (wiring)

**Files:**
- Modify: `apps/backend/src/index.ts`

- [ ] **Step 1: Remove autonomous-executor import and usage**

Remove any import of `createAutonomousExecutor` and its instantiation.

- [ ] **Step 2: Simplify launcher deps**

The launcher no longer needs `spawnClaude` or `db` (no SQLite session persistence needed — tmux IS the state). Remove those deps from the `createLauncher` call.

- [ ] **Step 3: Add `terminal` dep to launcher**

Ensure `terminal: { ensureReady, killTtyd }` is passed to `createLauncher`.

- [ ] **Step 4: Verify full build**

Run: `pnpm build`
Expected: PASS

- [ ] **Step 5: Run all backend tests**

Run: `cd apps/backend && pnpm test`
Expected: All tests PASS (some tests may need mock updates)

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/index.ts
git commit -m "refactor(index): wire simplified launcher with tmux deps"
```

---

## Chunk 3: Frontend — Supprimer le mode switching

### Task 9: Mettre à jour api.ts et store.ts

**Files:**
- Modify: `apps/web/src/api.ts`
- Modify: `apps/web/src/store.ts`

- [ ] **Step 1: Remove takeControl and releaseControl from api.ts**

Delete functions `takeControl(id)` and `releaseControl(id)` from api.ts.

- [ ] **Step 2: Remove takeControl and releaseControl from store.ts**

Remove these methods from the Zustand store. Also remove the SSE handler for `session:mode-changed`.

- [ ] **Step 3: Verify web build**

Run: `cd apps/web && pnpm build`
Expected: Build errors in components that use `takeControl`/`releaseControl` — fixed in Task 10.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/api.ts apps/web/src/store.ts
git commit -m "refactor(web): remove takeControl/releaseControl from api and store"
```

---

### Task 10: Mettre à jour DossierDetail.tsx

**Files:**
- Modify: `apps/web/src/pages/DossierDetail.tsx`

- [ ] **Step 1: Remove mode-switching buttons**

Remove from the destructuring:
```typescript
// BEFORE
const { dossiers, sessions, fetchDossiers, fetchSessions, archiveDossier, takeControl, releaseControl } = useStore();

// AFTER
const { dossiers, sessions, fetchDossiers, fetchSessions, archiveDossier } = useStore();
```

Delete the "Prendre la main" and "Rendre la main" button blocks (lines 53-68).

- [ ] **Step 2: Always show terminal link when session is active**

Replace the mode-specific buttons with a simple terminal link:

```tsx
{dossier.hasActiveSession && session && (
  <a
    href={`/terminal?session=${session.id}`}
    className="ml-auto px-3 py-1.5 rounded-lg text-sm font-medium bg-accent/10 text-accent hover:bg-accent/20 transition-colors"
  >
    Terminal
  </a>
)}
```

- [ ] **Step 3: Remove `session?.mode` reference from Archive button**

```tsx
// BEFORE
className={`${session?.mode ? '' : 'ml-auto '}px-3 py-1...`}

// AFTER
className={`${dossier.hasActiveSession ? '' : 'ml-auto '}px-3 py-1...`}
```

- [ ] **Step 4: Verify web build**

Run: `cd apps/web && pnpm build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/DossierDetail.tsx
git commit -m "refactor(web): remove mode switching from DossierDetail, always show terminal"
```

---

### Task 11: Mettre à jour Home.tsx et SessionCard.tsx

**Files:**
- Modify: `apps/web/src/pages/Home.tsx`
- Modify: `apps/web/src/components/SessionCard.tsx`

- [ ] **Step 1: Remove mode badge from SessionCard**

Remove any reference to `session.mode` (autonomous/interactive badge). Show only status (active/idle).

- [ ] **Step 2: Update Home.tsx if it references mode**

Remove any conditional rendering based on `session.mode`.

- [ ] **Step 3: Verify web build**

Run: `cd apps/web && pnpm build`
Expected: PASS

- [ ] **Step 4: Run frontend tests**

Run: `cd apps/web && pnpm test`
Expected: PASS (update mocks if needed to remove `mode` from Session)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/Home.tsx apps/web/src/components/SessionCard.tsx
git commit -m "refactor(web): remove mode references from Home and SessionCard"
```

---

## Chunk 4: Cleanup et vérification

### Task 12: Nettoyage final

**Files:**
- Various cleanup across codebase

- [ ] **Step 1: Search for remaining references to 'autonomous' or 'mode'**

Run: `grep -r "autonomous\|takeControl\|releaseControl\|mode.*interactive\|session:mode-changed" apps/ packages/ --include="*.ts" --include="*.tsx" -l`

Fix any remaining references.

- [ ] **Step 2: Remove dead dist files**

```bash
rm -rf apps/backend/dist/launcher/autonomous-executor.*
rm -rf apps/backend/dist/launcher/watchdog.*
rm -rf apps/backend/dist/launcher/patrol.*
rm -rf apps/backend/dist/launcher/sweep.*
```

- [ ] **Step 3: Full build**

Run: `pnpm build`
Expected: PASS

- [ ] **Step 4: Full test suite**

Run: `pnpm test`
Expected: All tests PASS

- [ ] **Step 5: Dev mode smoke test**

Run: `pnpm dev`

Manual checks:
1. Create a dossier → tmux session created, terminal visible
2. Type in the terminal → Claude responds
3. Send instruction from web UI → message appears in terminal
4. Archive dossier → tmux session killed
5. Checkup runs → no errors

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "refactor: cleanup dead code from autonomous mode removal"
```

---

## Summary

| Metric | Before | After |
|--------|--------|-------|
| session.ts | 675 LOC | ~120 LOC |
| autonomous-executor.ts | 192 LOC | deleted |
| Total backend LOC removed | — | ~700 |
| Session modes | 2 (autonomous + interactive) | 1 (tmux) |
| Mode transition functions | 2 (takeControl/releaseControl) | 0 |
| Race condition guards | 3 (suppressExitHandler, recentExits, cooldown) | 0 |
| NDJSON parsing (dossiers) | yes | no |
| processHandle tracking | yes | no |
