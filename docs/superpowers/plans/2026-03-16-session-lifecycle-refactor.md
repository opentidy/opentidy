# Session Lifecycle Refactor: `claude -p` Child Process

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace tmux interactive sessions with `claude -p` child processes for 100% reliable session lifecycle detection, while preserving the ability to "take control" interactively via tmux `--resume`.

**Architecture:** Autonomous sessions run as Node.js child processes (`claude -p --output-format stream-json`). Process exit = guaranteed lifecycle signal. Frontend shows streamed output via SSE. User can "Prendre la main" (kill child process, launch tmux `--resume`) and "Rendre la main" (kill tmux, relaunch as `-p --resume`). Watchdog reduced to fs.watch for `dossier:updated` events only.

**Tech Stack:** Node.js child_process.spawn, NDJSON stream parsing, existing SSE infrastructure, existing tmux/ttyd for interactive mode.

---

## File Structure

### New files
| File | Responsibility |
|------|---------------|
| `apps/backend/src/launcher/autonomous-executor.ts` | Spawn `claude -p` as child process, parse stream-json stdout, emit events on process exit |
| `apps/web/src/components/SessionOutput.tsx` | Real-time output display for autonomous sessions (replaces ttyd iframe) |

### Modified files (heavy)
| File | Changes |
|------|---------|
| `apps/backend/src/launcher/session.ts` | Dual-mode: autonomous (child process) + interactive (tmux). New `takeControl()` / `releaseControl()`. Remove sendKeys polling loop. |
| `apps/backend/src/launcher/watchdog.ts` | Strip tmux polling/capturePane/idle nudge. Keep only fs.watch for dossier:updated. |
| `apps/backend/src/hooks/handler.ts` | Simplify: remove lifecycle signal routing from Stop handler. Lifecycle comes from process exit. Keep audit. |
| `apps/backend/src/server.ts` | New routes: `POST /session/:id/take-control`, `POST /session/:id/release-control`, `GET /session/:id/output` (SSE stream). |
| `apps/backend/src/index.ts` | Wire autonomous executor, simplify watchdog deps, add output streaming. |
| `packages/shared/src/types.ts` | Session gets `mode: 'autonomous' \| 'interactive'`. New SSE event `session:output`. |
| `apps/web/src/components/TerminalPane.tsx` | Dual-mode: show SessionOutput for autonomous, ttyd iframe for interactive. |
| `apps/web/src/pages/DossierDetail.tsx` | "Prendre la main" / "Rendre la main" buttons. |
| `apps/web/src/store.ts` | New actions: `takeControl()`, `releaseControl()`. Handle `session:output` SSE. |
| `apps/web/src/api.ts` | New API calls for take/release control. |

### Modified files (light)
| File | Changes |
|------|---------|
| `apps/backend/scripts/on-stop.sh` | Keep for interactive mode only. No changes needed (already signal-only). |
| `plugins/opentidy-hooks/hooks/hooks.json` | No changes. Hooks still fire in `-p` mode for audit + security guards. |
| `workspace/CLAUDE.md` | Remove `/exit` references. Update "mode autonome" language. |
| `apps/backend/src/terminal/bridge.ts` | No changes. Still used for interactive mode. |

### Deleted / deprecated
| File | Status |
|------|--------|
| Watchdog capturePane polling | Removed from watchdog.ts |
| Watchdog idle nudge (`sendKeys`) | Removed |
| `isAtPrompt()` heuristic | Removed |
| sendKeys polling loop in session.ts | Removed |

---

## Chunk 1: Autonomous Executor + Session Dual-Mode (Backend Core)

### Task 1: Create the autonomous executor

**Files:**
- Create: `apps/backend/src/launcher/autonomous-executor.ts`
- Test: `apps/backend/tests/launcher/autonomous-executor.test.ts`

- [ ] **Step 1: Write failing tests for the executor**

```typescript
// tests/launcher/autonomous-executor.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAutonomousExecutor } from '../../src/launcher/autonomous-executor.js';

describe('AutonomousExecutor', () => {
  it('spawns claude -p with stream-json and returns a handle', async () => {
    const executor = createAutonomousExecutor();
    // Mock child_process.spawn
    const handle = executor.launch({
      dossierId: 'test-dossier',
      dossierDir: '/tmp/test',
      instruction: 'Do something',
      pluginDir: '/path/to/plugins',
    });
    expect(handle).toBeDefined();
    expect(handle.pid).toBeDefined();
    expect(handle.kill).toBeInstanceOf(Function);
    expect(handle.onExit).toBeInstanceOf(Function);
    expect(handle.onOutput).toBeInstanceOf(Function);
  });

  it('includes --resume flag when sessionId is provided', async () => {
    // Verify spawn args include --resume <id>
  });

  it('calls onExit callback when process exits', async () => {
    // Simulate process exit, verify callback fires
  });

  it('parses stream-json lines and calls onOutput for assistant messages', async () => {
    // Feed mock NDJSON to stdout, verify onOutput called
  });

  it('extracts session_id from result message', async () => {
    // Feed a {"type":"result","session_id":"abc"} line
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @opentidy/backend test -- tests/launcher/autonomous-executor.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement the autonomous executor**

```typescript
// src/launcher/autonomous-executor.ts
import { spawn, type ChildProcess } from 'child_process';
import { createInterface } from 'readline';

interface LaunchOptions {
  dossierId: string;
  dossierDir: string;
  instruction: string;
  pluginDir?: string;
  resumeId?: string;
}

interface ProcessHandle {
  pid: number;
  kill(): void;
  onExit(cb: (code: number | null, signal: string | null) => void): void;
  onOutput(cb: (event: StreamEvent) => void): void;
}

interface StreamEvent {
  type: 'assistant' | 'tool_use' | 'tool_result' | 'result' | 'system' | 'other';
  content: string;
  raw: Record<string, unknown>;
  sessionId?: string;
}

export function createAutonomousExecutor() {
  function launch(opts: LaunchOptions): ProcessHandle {
    const args = [
      '-p',
      '--output-format', 'stream-json',
      '--verbose',
      '--dangerously-skip-permissions',
    ];

    if (opts.pluginDir) {
      args.push('--plugin-dir', opts.pluginDir);
    }
    if (opts.resumeId) {
      args.push('--resume', opts.resumeId);
    }

    // The instruction is the last argument
    args.push(opts.instruction);

    console.log(`[autonomous] Spawning claude -p for ${opts.dossierId}`);
    const proc = spawn('claude', args, {
      cwd: opts.dossierDir,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const exitCallbacks: Array<(code: number | null, signal: string | null) => void> = [];
    const outputCallbacks: Array<(event: StreamEvent) => void> = [];
    let extractedSessionId: string | undefined;

    // Parse NDJSON from stdout
    const rl = createInterface({ input: proc.stdout });
    rl.on('line', (line) => {
      try {
        const parsed = JSON.parse(line);
        const event = parseStreamEvent(parsed);
        if (event.sessionId) extractedSessionId = event.sessionId;
        for (const cb of outputCallbacks) cb(event);
      } catch {
        // Non-JSON line, ignore
      }
    });

    // Log stderr (Claude Code debug output)
    const stderrRl = createInterface({ input: proc.stderr });
    stderrRl.on('line', (line) => {
      if (line.trim()) {
        console.log(`[autonomous] ${opts.dossierId} stderr: ${line}`);
      }
    });

    proc.on('close', (code, signal) => {
      console.log(`[autonomous] ${opts.dossierId} exited (code: ${code}, signal: ${signal})`);
      for (const cb of exitCallbacks) cb(code, signal);
    });

    proc.on('error', (err) => {
      console.error(`[autonomous] ${opts.dossierId} spawn error:`, err.message);
      for (const cb of exitCallbacks) cb(1, null);
    });

    return {
      pid: proc.pid ?? 0,
      kill: () => {
        if (!proc.killed) {
          console.log(`[autonomous] Killing ${opts.dossierId} (pid: ${proc.pid})`);
          proc.kill('SIGTERM');
        }
      },
      onExit: (cb) => exitCallbacks.push(cb),
      onOutput: (cb) => outputCallbacks.push(cb),
    };
  }

  return { launch };
}

function parseStreamEvent(parsed: Record<string, unknown>): StreamEvent {
  const type = parsed.type as string;

  if (type === 'result') {
    return {
      type: 'result',
      content: '',
      raw: parsed,
      sessionId: parsed.session_id as string | undefined,
    };
  }

  if (type === 'assistant') {
    const message = parsed.message as Record<string, unknown> | undefined;
    const content = message?.content;
    let text = '';
    if (Array.isArray(content)) {
      text = content
        .filter((b: any) => b.type === 'text')
        .map((b: any) => b.text)
        .join('');
    }
    return { type: 'assistant', content: text, raw: parsed };
  }

  if (type === 'stream_event') {
    const event = parsed.event as Record<string, unknown> | undefined;
    const eventType = event?.type as string | undefined;

    // Tool use start
    if (eventType === 'content_block_start') {
      const block = event?.content_block as Record<string, unknown> | undefined;
      if (block?.type === 'tool_use') {
        return { type: 'tool_use', content: block.name as string, raw: parsed };
      }
    }

    // Text delta (streaming tokens)
    if (eventType === 'content_block_delta') {
      const delta = event?.delta as Record<string, unknown> | undefined;
      if (delta?.type === 'text_delta') {
        return { type: 'assistant', content: delta.text as string, raw: parsed };
      }
    }

    return { type: 'other', content: '', raw: parsed };
  }

  return { type: type === 'system' ? 'system' : 'other', content: '', raw: parsed };
}

export type { ProcessHandle, StreamEvent, LaunchOptions };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @opentidy/backend test -- tests/launcher/autonomous-executor.test.ts`

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/launcher/autonomous-executor.ts apps/backend/tests/launcher/autonomous-executor.test.ts
git commit -m "feat(launcher): add autonomous executor, claude -p child process with stream-json parsing"
```

---

### Task 2: Add `mode` to Session type and new SSE events

**Files:**
- Modify: `packages/shared/src/types.ts`

- [ ] **Step 1: Update Session type and SSE events**

In `packages/shared/src/types.ts`:

```typescript
// Update SessionStatus to add 'takeover' for transition state
export type SessionStatus = 'active' | 'idle' | 'mfa' | 'finished' | 'takeover';

// Add mode to Session
export interface Session {
  id: string;
  dossierId: string;
  status: SessionStatus;
  startedAt: string;
  claudeSessionId?: string;
  pid?: number;
  mode: 'autonomous' | 'interactive'; // NEW
}

// Add new SSE event types
export type SSEEventType =
  | 'session:started'
  | 'session:ended'
  | 'session:idle'
  | 'session:active'
  | 'session:output'        // NEW: streaming output from autonomous session
  | 'session:mode-changed'  // NEW: autonomous ↔ interactive transition
  | 'checkpoint:created'
  | 'checkpoint:resolved'
  | 'suggestion:created'
  | 'dossier:updated'
  | 'dossier:completed'
  | 'amelioration:created'
  | 'notification:sent';
```

- [ ] **Step 2: Build shared package**

Run: `pnpm --filter @opentidy/shared build`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/types.ts
git commit -m "feat(shared): add session mode (autonomous/interactive) and new SSE events"
```

---

### Task 3: Refactor session.ts for dual-mode launcher

**Files:**
- Modify: `apps/backend/src/launcher/session.ts`
- Modify: `apps/backend/tests/launcher/session.test.ts`

This is the core change. The launcher supports two modes:
- **Autonomous (default):** spawn via `autonomousExecutor.launch()`, process exit = lifecycle signal
- **Interactive:** spawn via `tmuxExecutor.launchTmux()` (existing behavior, used for "Prendre la main")

- [ ] **Step 1: Update internal Session type in session.ts**

Add to the internal `sessions` Map value:
```typescript
interface InternalSession extends Session {
  processHandle?: ProcessHandle; // autonomous mode, child process ref
}
```

- [ ] **Step 2: Update `createLauncher` deps to accept autonomous executor**

```typescript
export function createLauncher(deps: {
  autonomousExecutor: ReturnType<typeof createAutonomousExecutor>; // NEW
  tmuxExecutor: SessionExecutor; // renamed from executor
  locks: LockManager;
  workspace: WorkspaceManager;
  audit: AuditLogger;
  notify: Notifier;
  sse: SSEEmitter;
  workspaceDir: string;
  terminal?: { killTtyd: (sessionName: string) => void };
  memoryManager?: MemoryManager;
  memoryAgents?: MemoryAgents;
}) {
```

- [ ] **Step 3: Rewrite `launchSession()` for autonomous mode**

The new flow:
1. Lock acquire
2. Clear waiting, generate CLAUDE.md, memory injection (same as before)
3. Build instruction from event or state
4. **Spawn `claude -p` via autonomous executor** (NOT tmux)
5. Wire process exit → `handleProcessExit(dossierId)`
6. Wire output → SSE `session:output`
7. Record session with `mode: 'autonomous'`

Key change: replace lines 128-179 (tmux spawn + sendKeys polling) with:

```typescript
// Spawn autonomous child process
const sessionIdFile = path.join(dossierDir, '.session-id');
const resumeId = fs.existsSync(sessionIdFile)
  ? fs.readFileSync(sessionIdFile, 'utf-8').trim()
  : undefined;

const pluginDir = path.resolve(deps.workspaceDir, '..', 'plugins', 'opentidy-hooks');
const pluginFlag = fs.existsSync(pluginDir) ? pluginDir : undefined;

const instruction = event?.content ?? 'Lis state.md et continue ton travail.';

const handle = deps.autonomousExecutor.launch({
  dossierId,
  dossierDir,
  instruction,
  pluginDir: pluginFlag,
  resumeId,
});

const sessionName = `autonomous-${dossierId}`;
sessions.set(dossierId, {
  id: sessionName,
  dossierId,
  status: 'active',
  startedAt: new Date().toISOString(),
  claudeSessionId: resumeId,
  pid: handle.pid,
  mode: 'autonomous',
  processHandle: handle,
});

// Stream output to SSE
handle.onOutput((event) => {
  if (event.type === 'assistant' || event.type === 'tool_use') {
    deps.sse.emit({
      type: 'session:output',
      data: { dossierId, eventType: event.type, content: event.content },
      timestamp: new Date().toISOString(),
    });
  }
  // Capture session ID from result
  if (event.sessionId) {
    const session = sessions.get(dossierId);
    if (session) {
      session.claudeSessionId = event.sessionId;
      // Persist for future --resume
      fs.writeFileSync(sessionIdFile, event.sessionId);
    }
  }
});

// Process exit = lifecycle signal
handle.onExit((code, signal) => {
  console.log(`[launcher] ${dossierId}: autonomous process exited (code: ${code})`);
  handleAutonomousExit(dossierId);
});

deps.sse.emit({ type: 'session:started', data: { dossierId, mode: 'autonomous' }, timestamp: new Date().toISOString() });
deps.notify.notifyStarted?.(dossierId);
```

- [ ] **Step 4: Add `handleAutonomousExit()`, the core lifecycle handler**

```typescript
function handleAutonomousExit(dossierId: string): void {
  const dossierDir = path.join(deps.workspaceDir, dossierId);
  const now = new Date().toISOString();

  // Read state.md (guaranteed to be written since process exited)
  let dossier;
  try {
    dossier = deps.workspace.getDossier(dossierId);
  } catch {
    console.warn(`[launcher] ${dossierId}: cannot read dossier after exit`);
    deps.locks.release(dossierId);
    sessions.delete(dossierId);
    return;
  }

  console.log(`[launcher] ${dossierId}: post-exit state = ${dossier.status}`);

  // Clean checkpoint for TERMINÉ
  if (dossier.status === 'TERMINÉ') {
    try { fs.rmSync(path.join(dossierDir, 'checkpoint.md'), { force: true }); } catch {}
    deps.sse.emit({ type: 'dossier:completed', data: { dossierId }, timestamp: now });
    deps.notify.notifyCompleted(dossierId);
  }

  // Notify checkpoint for BLOQUÉ
  if (dossier.status === 'BLOQUÉ' || dossier.hasCheckpoint) {
    const summary = dossier.checkpointSummary ?? 'Action requise';
    deps.sse.emit({ type: 'checkpoint:created', data: { dossierId, summary }, timestamp: now });
    deps.notify.notifyCheckpoint(dossierId, summary);
  }

  // Clean up session
  deps.locks.release(dossierId);
  cancelIdleTimer(dossierId);
  deps.terminal?.killTtyd(`alfred-${dossierId}`);
  deps.sse.emit({ type: 'session:ended', data: { dossierId }, timestamp: now });
  sessions.delete(dossierId);

  // Post-session agent (fire-and-forget)
  launchPostSessionAgent(dossierId, dossier);
}

function launchPostSessionAgent(dossierId: string, dossier: any): void {
  if (!deps.memoryAgents) return;
  const sessionIdFile = path.join(deps.workspaceDir, dossierId, '.session-id');
  let transcriptPath: string | null = null;
  try {
    if (fs.existsSync(sessionIdFile)) {
      const sessionId = fs.readFileSync(sessionIdFile, 'utf-8').trim();
      const projectsDir = path.join(require('os').homedir(), '.claude', 'projects');
      if (fs.existsSync(projectsDir)) {
        for (const dir of fs.readdirSync(projectsDir)) {
          const candidate = path.join(projectsDir, dir, `${sessionId}.jsonl`);
          if (fs.existsSync(candidate)) { transcriptPath = candidate; break; }
        }
      }
    }
  } catch {}
  if (!transcriptPath || !deps.memoryAgents.isTranscriptSubstantial(transcriptPath)) {
    console.log(`[launcher] ${dossierId}: no substantial transcript, skipping post-session`);
    return;
  }
  console.log(`[launcher] ${dossierId}: launching post-session agent`);
  const indexContent = deps.memoryManager?.readIndexRaw() ?? '';
  deps.memoryAgents.runExtraction({
    transcriptPath,
    indexContent,
    dossierId,
    stateContent: dossier.stateRaw ?? '',
  }).catch(err => {
    console.error(`[launcher] ${dossierId}: post-session agent failed:`, err);
  });
}
```

- [ ] **Step 5: Add `takeControl()` and `releaseControl()` methods**

```typescript
async function takeControl(dossierId: string): Promise<void> {
  const session = sessions.get(dossierId);
  if (!session) throw new Error(`No active session for ${dossierId}`);

  console.log(`[launcher] ${dossierId}: taking control (autonomous → interactive)`);

  // Kill autonomous process if running
  if (session.mode === 'autonomous' && session.processHandle) {
    session.processHandle.kill();
    // Wait for process to exit gracefully
    await new Promise<void>(resolve => {
      session.processHandle!.onExit(() => resolve());
      setTimeout(resolve, 5000); // max 5s wait
    });
  }

  // Launch interactive tmux session with --resume
  const dossierDir = path.join(deps.workspaceDir, dossierId);
  const sessionIdFile = path.join(dossierDir, '.session-id');
  const resumeId = session.claudeSessionId
    ?? (fs.existsSync(sessionIdFile) ? fs.readFileSync(sessionIdFile, 'utf-8').trim() : undefined);

  const sessionName = `alfred-${dossierId}`;
  const pluginDir = path.resolve(deps.workspaceDir, '..', 'plugins', 'opentidy-hooks');
  const pluginFlag = fs.existsSync(pluginDir) ? ` --plugin-dir ${pluginDir}` : '';

  const claudeCmd = resumeId
    ? `cd ${dossierDir} && claude --dangerously-skip-permissions${pluginFlag} --resume ${resumeId}`
    : `cd ${dossierDir} && claude --dangerously-skip-permissions${pluginFlag}`;

  const pid = await deps.tmuxExecutor.launchTmux(sessionName, claudeCmd);

  sessions.set(dossierId, {
    ...session,
    id: sessionName,
    mode: 'interactive',
    pid,
    processHandle: undefined,
  });

  deps.sse.emit({
    type: 'session:mode-changed',
    data: { dossierId, mode: 'interactive' },
    timestamp: new Date().toISOString(),
  });
}

async function releaseControl(dossierId: string): Promise<void> {
  const session = sessions.get(dossierId);
  if (!session || session.mode !== 'interactive') {
    throw new Error(`No interactive session for ${dossierId}`);
  }

  console.log(`[launcher] ${dossierId}: releasing control (interactive → autonomous)`);

  // Kill tmux session
  const sessionName = `alfred-${dossierId}`;
  await deps.tmuxExecutor.killSession(sessionName);
  deps.terminal?.killTtyd(sessionName);

  // Read state to decide next action
  const dossier = deps.workspace.getDossier(dossierId);

  if (dossier.status === 'TERMINÉ') {
    // Done, cleanup
    handleAutonomousExit(dossierId);
    return;
  }

  if (dossier.status === 'BLOQUÉ') {
    // Still blocked; just update mode, don't relaunch
    sessions.delete(dossierId);
    deps.locks.release(dossierId);
    deps.sse.emit({ type: 'session:ended', data: { dossierId }, timestamp: new Date().toISOString() });
    return;
  }

  // EN COURS: relaunch as autonomous with --resume
  sessions.delete(dossierId);
  deps.locks.release(dossierId);
  await launchSession(dossierId, { source: 'system', content: 'Continue ton travail.' });
}
```

- [ ] **Step 6: Update the return object to export new methods**

Add `takeControl` and `releaseControl` to the returned object.

- [ ] **Step 7: Update session tests**

Update `tests/launcher/session.test.ts`:
- Mock `autonomousExecutor` instead of (or alongside) tmux executor
- Test `handleAutonomousExit` for each state (TERMINÉ, BLOQUÉ, EN COURS)
- Test `takeControl()`: kills child process, launches tmux
- Test `releaseControl()`: kills tmux, relaunches as `-p`

- [ ] **Step 8: Build + test**

Run: `pnpm --filter @opentidy/backend build && pnpm --filter @opentidy/backend test`

- [ ] **Step 9: Commit**

```bash
git add apps/backend/src/launcher/session.ts apps/backend/tests/launcher/session.test.ts
git commit -m "feat(launcher): dual-mode sessions, autonomous (claude -p) + interactive (tmux --resume)"
```

---

### Task 4: Simplify watchdog by removing tmux polling

**Files:**
- Modify: `apps/backend/src/launcher/watchdog.ts`
- Modify: `apps/backend/tests/launcher/watchdog.test.ts`

The watchdog no longer polls tmux. It only uses fs.watch for `dossier:updated` SSE events.

- [ ] **Step 1: Strip watchdog to fs.watch only**

Remove:
- `isAtPrompt()` function
- `checkSession()` function (tmux capturePane + state logic)
- `poll()` function
- `idleSince` Map
- `lastNotifiedState` Map
- `IDLE_NUDGE_MS` constant
- `setInterval` polling timer
- All deps: `launcher`, `executor`, `workspace`, `notify`, `postSession`

Keep:
- `startWatching()` (fs.watch)
- `stopWatching()`
- Debounce logic
- `dossier:updated` SSE emit

The watchdog becomes a simple file watcher:

```typescript
export function createWorkspaceWatcher(deps: {
  sse: { emit(event: { type: string; data: Record<string, unknown>; timestamp: string }): void };
  workspaceDir: string;
}) {
  let watcher: fs.FSWatcher | null = null;
  const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const DEBOUNCE_MS = 3_000;

  function start(): void {
    try {
      watcher = fs.watch(deps.workspaceDir, { recursive: true }, (_eventType, filename) => {
        if (!filename) return;
        const normalized = filename.replace(/\\/g, '/');
        const isRelevant = normalized.endsWith('/state.md') || normalized.endsWith('/checkpoint.md')
          || normalized.includes('/artifacts/');
        if (!isRelevant) return;

        const dossierId = normalized.split('/')[0];
        if (!dossierId || dossierId.startsWith('_') || dossierId.startsWith('.')) return;

        if (debounceTimers.has(dossierId)) clearTimeout(debounceTimers.get(dossierId)!);
        debounceTimers.set(dossierId, setTimeout(() => {
          debounceTimers.delete(dossierId);
          deps.sse.emit({ type: 'dossier:updated', data: { dossierId }, timestamp: new Date().toISOString() });
        }, DEBOUNCE_MS));
      });

      watcher.on('error', (err) => console.error('[watcher] fs.watch error:', err));
      console.log(`[watcher] Started on ${deps.workspaceDir}`);
    } catch (err) {
      console.warn('[watcher] fs.watch setup failed:', err);
    }
  }

  function stop(): void {
    for (const t of debounceTimers.values()) clearTimeout(t);
    debounceTimers.clear();
    if (watcher) { watcher.close(); watcher = null; }
  }

  return { start, stop };
}
```

- [ ] **Step 2: Update watchdog tests**

Rewrite tests to only test fs.watch behavior. Remove all tmux/capturePane/idle tests.

- [ ] **Step 3: Build + test**

Run: `pnpm --filter @opentidy/backend build && pnpm --filter @opentidy/backend test`

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/launcher/watchdog.ts apps/backend/tests/launcher/watchdog.test.ts
git commit -m "refactor(watchdog): strip to fs.watch only, lifecycle handled by process exit"
```

---

### Task 5: Simplify hooks handler

**Files:**
- Modify: `apps/backend/src/hooks/handler.ts`
- Modify: `apps/backend/tests/hooks/handler.test.ts`

The hooks handler no longer manages lifecycle. Stop handler becomes audit-only. SessionEnd stays for interactive mode cleanup.

- [ ] **Step 1: Simplify handleStop()**

Remove all lifecycle signal routing (`handleLifecycleSignal`, `launchPostSessionAgent`, `findTranscriptPath`). Stop handler becomes:

```typescript
function handleStop(dossierId: string, payload: HookPayload): void {
  // In autonomous mode: this comes via stream-json, not HTTP, so rarely called
  // In interactive mode: on-stop.sh signals state changes
  deps.sse.emit({
    type: 'session:active',
    data: { dossierId, event: 'stop', state: payload.tool_name },
    timestamp: new Date().toISOString(),
  });
  deps.launcher.handleHookEvent(dossierId, payload.hook_event_name);
}
```

Remove `lastProcessedState` dedup Map (no longer needed).

- [ ] **Step 2: Update tests**

Remove lifecycle signal tests. Keep audit, PostToolUse, PreToolUse, Notification tests.

- [ ] **Step 3: Build + test**

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/hooks/handler.ts apps/backend/tests/hooks/handler.test.ts
git commit -m "refactor(hooks): simplify, lifecycle handled by process exit, hooks for audit only"
```

---

### Task 6: Wire everything in index.ts + add API routes

**Files:**
- Modify: `apps/backend/src/index.ts`
- Modify: `apps/backend/src/server.ts`

- [ ] **Step 1: Update index.ts wiring**

```typescript
import { createAutonomousExecutor } from './launcher/autonomous-executor.js';
import { createWorkspaceWatcher } from './launcher/watchdog.js';

// Replace:
//   const executor = createTmuxExecutor();
// With:
const tmuxExecutor = createTmuxExecutor();
const autonomousExecutor = createAutonomousExecutor();

// Update launcher deps:
const launcher = createLauncher({
  autonomousExecutor,         // NEW
  tmuxExecutor,               // renamed from executor
  locks,
  workspace: { ... },
  audit,
  notify,
  sse,
  workspaceDir: WORKSPACE_DIR,
  terminal: { killTtyd: (name) => terminalRef?.killTtyd(name) },
  memoryManager,
  memoryAgents,
});

// Replace watchdog:
const watcher = createWorkspaceWatcher({ sse, workspaceDir: WORKSPACE_DIR });
watcher.start();
```

- [ ] **Step 2: Add API routes in server.ts**

```typescript
// POST /api/session/:id/take-control
app.post('/api/session/:id/take-control', async (c) => {
  const { id } = c.req.param();
  try {
    await deps.launcher.takeControl(id);
    return c.json({ ok: true, mode: 'interactive' });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400);
  }
});

// POST /api/session/:id/release-control
app.post('/api/session/:id/release-control', async (c) => {
  const { id } = c.req.param();
  try {
    await deps.launcher.releaseControl(id);
    return c.json({ ok: true });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400);
  }
});
```

- [ ] **Step 3: Build + test**

Run: `pnpm --filter @opentidy/backend build && pnpm --filter @opentidy/backend test`

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/index.ts apps/backend/src/server.ts
git commit -m "feat(server): wire autonomous executor + take/release control API routes"
```

---

### Task 7: Update workspace/CLAUDE.md

**Files:**
- Modify: `workspace/CLAUDE.md`

- [ ] **Step 1: Update session instructions**

Replace references to `/exit` with process-exit-aware language:
- Remove: "fais `/exit`" (in `-p` mode, Claude stops producing output and the process exits)
- Update: "Personne ne regarde ton terminal" → "Tu travailles en mode autonome."
- Keep: All state.md format, checkpoint protocol, browser usage, memory rules

- [ ] **Step 2: Commit**

```bash
git add workspace/CLAUDE.md
git commit -m "docs(workspace): update CLAUDE.md for autonomous -p mode"
```

---

## Chunk 2: Frontend, Dual-Mode Terminal + Control Buttons

### Task 8: Create SessionOutput component

**Files:**
- Create: `apps/web/src/components/SessionOutput.tsx`

- [ ] **Step 1: Create the component**

A real-time log that shows Claude's output streamed via SSE. Replaces ttyd iframe for autonomous sessions.

```tsx
// Simple scrollable log that receives session:output events
function SessionOutput({ dossierId }: { dossierId: string }) {
  const [lines, setLines] = useState<Array<{ type: string; content: string; time: string }>>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Subscribe to session:output SSE events for this dossier
    const handler = (event: { type: string; data: { dossierId: string; eventType: string; content: string } }) => {
      if (event.type === 'session:output' && event.data.dossierId === dossierId) {
        setLines(prev => [...prev, {
          type: event.data.eventType,
          content: event.data.content,
          time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        }]);
      }
    };
    // Register handler in store SSE listener
    const unsubscribe = useStore.getState().subscribeToOutput(dossierId, handler);
    return unsubscribe;
  }, [dossierId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines]);

  return (
    <div className="h-full bg-bg font-mono text-sm overflow-y-auto p-4">
      {lines.length === 0 && (
        <p className="text-text-tertiary">En attente de la sortie...</p>
      )}
      {lines.map((line, i) => (
        <div key={i} className="flex gap-2">
          <span className="text-text-tertiary shrink-0">{line.time}</span>
          {line.type === 'tool_use' ? (
            <span className="text-accent">▶ {line.content}</span>
          ) : (
            <span className="text-text">{line.content}</span>
          )}
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/SessionOutput.tsx
git commit -m "feat(web): add SessionOutput component for autonomous session streaming"
```

---

### Task 9: Update TerminalPane for dual-mode

**Files:**
- Modify: `apps/web/src/components/TerminalPane.tsx`

- [ ] **Step 1: Make TerminalPane mode-aware**

```tsx
function TerminalPane({ sessionName, dossierId, mode }: {
  sessionName: string;
  dossierId: string;
  mode: 'autonomous' | 'interactive';
}) {
  if (mode === 'autonomous') {
    return <SessionOutput dossierId={dossierId} />;
  }
  // Interactive mode: existing ttyd iframe behavior
  // ... existing code
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/TerminalPane.tsx
git commit -m "feat(web): TerminalPane dual-mode, SSE stream for autonomous, ttyd for interactive"
```

---

### Task 10: Add take/release control to DossierDetail + API + Store

**Files:**
- Modify: `apps/web/src/pages/DossierDetail.tsx`
- Modify: `apps/web/src/api.ts`
- Modify: `apps/web/src/store.ts`

- [ ] **Step 1: Add API calls**

```typescript
// api.ts
export const takeControl = (dossierId: string) =>
  json(`/session/${dossierId}/take-control`, { method: 'POST' });
export const releaseControl = (dossierId: string) =>
  json(`/session/${dossierId}/release-control`, { method: 'POST' });
```

- [ ] **Step 2: Add store actions**

```typescript
// store.ts
takeControl: async (dossierId: string) => {
  await api.takeControl(dossierId);
  get().fetchSessions();
},
releaseControl: async (dossierId: string) => {
  await api.releaseControl(dossierId);
  get().fetchSessions();
},
```

- [ ] **Step 3: Add buttons to DossierDetail**

In the session header area, conditionally render:
- If `mode === 'autonomous'` → "Prendre la main" button
- If `mode === 'interactive'` → "Rendre la main" button

```tsx
{session?.mode === 'autonomous' && (
  <button onClick={() => takeControl(dossierId)}
    className="px-3 py-1.5 rounded-lg text-sm font-medium bg-accent/10 text-accent hover:bg-accent/20">
    Prendre la main
  </button>
)}
{session?.mode === 'interactive' && (
  <button onClick={() => releaseControl(dossierId)}
    className="px-3 py-1.5 rounded-lg text-sm font-medium bg-surface-hover text-text-secondary hover:bg-red/10 hover:text-red">
    Rendre la main
  </button>
)}
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/pages/DossierDetail.tsx apps/web/src/api.ts apps/web/src/store.ts
git commit -m "feat(web): add Prendre/Rendre la main buttons for session mode transitions"
```

---

## Chunk 3: Cleanup + Recovery + Tests

### Task 11: Recovery after backend restart

**Files:**
- Modify: `apps/backend/src/launcher/session.ts` (the `recover()` function)

- [ ] **Step 1: Update recover()**

On startup, child processes from the previous backend run are dead. Recovery must:
1. Check for active tmux sessions (interactive mode survivors) and reconcile
2. Check for dossiers with `status: EN COURS` and no active session, then relaunch as autonomous
3. Skip dossiers with `## En attente` or `BLOQUÉ`

```typescript
async function recover(): Promise<void> {
  const activeTmux = await deps.tmuxExecutor.listSessions();
  const alfredSessions = activeTmux.filter(s => s.startsWith('alfred-'));

  // Reconcile tmux survivors (interactive mode from before crash)
  for (const tmuxName of alfredSessions) {
    const dossierId = tmuxName.replace('alfred-', '');
    if (!deps.locks.acquire(dossierId)) continue;
    sessions.set(dossierId, {
      id: tmuxName, dossierId, status: 'active',
      startedAt: new Date().toISOString(), mode: 'interactive',
    });
    console.log(`[launcher] Recovered interactive session: ${dossierId}`);
  }

  // Relaunch EN COURS dossiers that have no session
  const allDossiers = deps.workspace.listDossierIds();
  for (const id of allDossiers) {
    if (sessions.has(id)) continue;
    const d = deps.workspace.getDossier(id);
    if (d.status === 'EN COURS' && !d.waitingFor) {
      console.log(`[launcher] Relaunching orphaned dossier: ${id}`);
      try {
        await launchSession(id, { source: 'recovery', content: 'Continue ton travail.' });
      } catch (err) {
        console.error(`[launcher] Recovery failed for ${id}:`, err);
      }
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/backend/src/launcher/session.ts
git commit -m "feat(launcher): recovery handles both autonomous (relaunch) and interactive (tmux reconcile)"
```

---

### Task 12: Integration test for full lifecycle

**Files:**
- Create: `apps/backend/tests/launcher/lifecycle-autonomous.test.ts`

- [ ] **Step 1: Write integration tests**

Test the full flow with mocked child process:
1. `launchSession()` → spawns autonomous process
2. Process exits → `handleAutonomousExit()` fires
3. State is TERMINÉ → cleanup + post-session agent
4. State is BLOQUÉ → checkpoint notification, no relaunch
5. `takeControl()` → kills child process, spawns tmux
6. `releaseControl()` → kills tmux, relaunches as autonomous

- [ ] **Step 2: Run tests**

Run: `pnpm --filter @opentidy/backend test`

- [ ] **Step 3: Commit**

```bash
git add apps/backend/tests/launcher/lifecycle-autonomous.test.ts
git commit -m "test(launcher): integration tests for autonomous lifecycle + mode transitions"
```

---

### Task 13: Final cleanup

- [ ] **Step 1: Remove unused imports and dead code**

- `session.ts`: remove sendKeys polling loop references
- `index.ts`: remove old watchdog wiring
- Verify no references to old executor pattern

- [ ] **Step 2: Build + full test suite**

Run: `pnpm build && pnpm test`

- [ ] **Step 3: Commit**

```bash
git commit -m "chore: cleanup dead code from tmux-only launcher"
```

- [ ] **Step 4: Push**

```bash
git push
```
