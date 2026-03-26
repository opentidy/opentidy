# Cross-Platform Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make OpenTidy cross-platform (macOS/Linux/Windows) with a pluggable architecture — OS-specific features become optional plugins, the core runs everywhere Node.js runs.

**Architecture:** Introduce a `paths.ts` module using `env-paths` for OS-aware paths, a `ReceiverPlugin` interface for pluggable event sources, a cross-platform daemon supervisor, and npm-based distribution. macOS-specific code (osascript readers, pbcopy, LaunchAgent) moves to an optional plugin loaded at runtime from config.

**Tech Stack:** Node.js 22+, env-paths (npm), TypeScript, Vitest

---

## File Structure

### New files
- `apps/backend/src/paths.ts` — Cross-platform path resolution (config, data, logs, cache, temp)
- `apps/backend/src/receiver/plugin.ts` — ReceiverPlugin interface + dynamic loader
- `apps/backend/src/platform/clipboard.ts` — Cross-platform clipboard (pbcopy/xclip/PowerShell)
- `apps/backend/src/platform/service-installer.ts` — Generate native service files (plist/systemd/NSSM)
- `apps/backend/src/daemon.ts` — Node.js daemon supervisor (fork + respawn)
- `apps/backend/tests/paths.test.ts`
- `apps/backend/tests/receiver/plugin.test.ts`
- `apps/backend/tests/platform/clipboard.test.ts`
- `apps/backend/tests/platform/service-installer.test.ts`
- `apps/backend/tests/daemon.test.ts`
- `scripts/install.sh` — Cross-platform install script (macOS + Linux)
- `scripts/install.ps1` — Windows PowerShell install script

### Modified files
- `apps/backend/src/config.ts` — Use `paths.ts` for default config path
- `apps/backend/src/index.ts` — Use `paths.ts` for lockDir/workspace/logs, load receivers from config, platform-guard Camoufox cleanup
- `apps/backend/src/cli/logs.ts` — Use `paths.ts` instead of hardcoded ~/Library paths
- `apps/backend/src/cli/uninstall.ts` — Use `paths.ts` for all path references, platform-guard LaunchAgent/launchctl
- `apps/backend/src/infra/updater.ts` — Use `paths.ts` for cache dir
- `apps/backend/src/terminal/bridge.ts` — Use platform/clipboard instead of pbcopy, platform-guard tmux/ttyd/pkill
- `apps/backend/src/receiver/watchers.ts` — Extend WatcherConfig.source to accept any string
- `packages/shared/src/types.ts` — Add ReceiverConfigEntry, extend EventSource
- `bin/opentidy` — Keep as-is for Homebrew, add JS entry point alongside
- `package.json` (root) — Add `bin` field for npm global install
- `apps/backend/package.json` — Add `env-paths` dependency
- `apps/backend/src/cli.ts` — Add `install-service` to COMMANDS array and router

### Files that become optional (macOS plugin)
- `apps/backend/src/receiver/sms-reader.ts` — Only loaded when platform = darwin
- `apps/backend/src/receiver/mail-reader.ts` — Only loaded when platform = darwin

---

### Task 1: Cross-platform path resolution (`paths.ts`)

**Files:**
- Create: `apps/backend/src/paths.ts`
- Create: `apps/backend/tests/paths.test.ts`
- Modify: `apps/backend/package.json` (add `env-paths` dep)

- [ ] **Step 1: Add env-paths dependency**

```bash
cd /Users/lolo/Documents/opentidy && pnpm --filter @opentidy/backend add env-paths
```

- [ ] **Step 2: Write the failing test**

```typescript
// apps/backend/tests/paths.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('paths', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns all required path keys', async () => {
    const { getOpenTidyPaths } = await import('../src/paths.js');
    const paths = getOpenTidyPaths();
    expect(paths).toHaveProperty('config');
    expect(paths).toHaveProperty('data');
    expect(paths).toHaveProperty('log');
    expect(paths).toHaveProperty('cache');
    expect(paths).toHaveProperty('temp');
  });

  it('all paths are absolute', async () => {
    const { getOpenTidyPaths } = await import('../src/paths.js');
    const paths = getOpenTidyPaths();
    for (const [key, value] of Object.entries(paths)) {
      expect(value, `${key} should be absolute`).toMatch(/^(\/|[A-Z]:\\)/);
    }
  });

  it('respects OPENTIDY_CONFIG_DIR override', async () => {
    vi.stubEnv('OPENTIDY_CONFIG_DIR', '/custom/config');
    // Force re-import to pick up env change
    vi.resetModules();
    const { getOpenTidyPaths } = await import('../src/paths.js');
    const paths = getOpenTidyPaths();
    expect(paths.config).toBe('/custom/config');
  });

  it('respects OPENTIDY_DATA_DIR override', async () => {
    vi.stubEnv('OPENTIDY_DATA_DIR', '/custom/data');
    vi.resetModules();
    const { getOpenTidyPaths } = await import('../src/paths.js');
    const paths = getOpenTidyPaths();
    expect(paths.data).toBe('/custom/data');
  });

  it('lock dir is under temp', async () => {
    const { getOpenTidyPaths } = await import('../src/paths.js');
    const paths = getOpenTidyPaths();
    expect(paths.lockDir).toContain('opentidy');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd /Users/lolo/Documents/opentidy && pnpm --filter @opentidy/backend test -- tests/paths.test.ts
```
Expected: FAIL — module not found

- [ ] **Step 4: Write minimal implementation**

```typescript
// apps/backend/src/paths.ts
import envPaths from 'env-paths';
import os from 'os';
import path from 'path';

export interface OpenTidyPaths {
  config: string;   // ~/.config/opentidy (Linux/macOS) or %APPDATA%\opentidy (Windows)
  data: string;     // ~/.local/share/opentidy (Linux) or ~/Library/Application Support/opentidy (macOS)
  log: string;      // ~/.local/state/opentidy (Linux) or ~/Library/Logs/opentidy (macOS)
  cache: string;    // ~/.cache/opentidy (Linux) or ~/Library/Caches/opentidy (macOS)
  temp: string;     // $TMPDIR/opentidy or /tmp/opentidy (Unix) or %TEMP%\opentidy (Windows)
  lockDir: string;  // temp/locks
}

const defaults = envPaths('opentidy', { suffix: '' });

export function getOpenTidyPaths(): OpenTidyPaths {
  const config = process.env.OPENTIDY_CONFIG_DIR || defaults.config;
  const data = process.env.OPENTIDY_DATA_DIR || defaults.data;
  const log = process.env.OPENTIDY_LOG_DIR || defaults.log;
  const cache = process.env.OPENTIDY_CACHE_DIR || defaults.cache;
  const temp = path.join(os.tmpdir(), 'opentidy');
  const lockDir = path.join(temp, 'locks');

  return { config, data, log, cache, temp, lockDir };
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd /Users/lolo/Documents/opentidy && pnpm --filter @opentidy/backend test -- tests/paths.test.ts
```
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/paths.ts apps/backend/tests/paths.test.ts apps/backend/package.json pnpm-lock.yaml
git commit -m "feat(paths): add cross-platform path resolution with env-paths"
```

---

### Task 2: Replace hardcoded paths in config.ts

**Files:**
- Modify: `apps/backend/src/config.ts:10,36-38`

- [ ] **Step 1: Update config.ts to use paths module**

Replace the hardcoded `$HOME/.config/opentidy` and `/tmp/opentidy-locks`:

```typescript
// apps/backend/src/config.ts — updated imports
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import type { OpenTidyConfig } from '@opentidy/shared';
import { getOpenTidyPaths } from './paths.js';

const paths = getOpenTidyPaths();

const DEFAULT_CONFIG: OpenTidyConfig = {
  version: 1,
  telegram: { botToken: '', chatId: '', userId: '' },
  auth: { bearerToken: '' },
  server: { port: 5175, appBaseUrl: 'http://localhost:5175' },
  workspace: { dir: '', lockDir: paths.lockDir },
  // ... rest unchanged
};

export function getConfigPath(): string {
  return process.env.OPENTIDY_CONFIG_PATH
    || `${paths.config}/config.json`;
}
```

- [ ] **Step 2: Run existing tests to verify nothing broke**

```bash
cd /Users/lolo/Documents/opentidy && pnpm --filter @opentidy/backend test
```
Expected: all existing tests PASS

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/config.ts
git commit -m "refactor(config): use paths module instead of hardcoded macOS paths"
```

---

### Task 3: Replace hardcoded paths in index.ts

**Files:**
- Modify: `apps/backend/src/index.ts:39`

- [ ] **Step 1: Update LOCK_DIR fallback**

Change line 39 from:
```typescript
const LOCK_DIR = config.workspace.lockDir || process.env.LOCK_DIR || '/tmp/opentidy-locks';
```
to:
```typescript
import { getOpenTidyPaths } from './paths.js';
const openTidyPaths = getOpenTidyPaths();
const LOCK_DIR = config.workspace.lockDir || process.env.LOCK_DIR || openTidyPaths.lockDir;
```

- [ ] **Step 2: Run existing tests**

```bash
cd /Users/lolo/Documents/opentidy && pnpm --filter @opentidy/backend test
```
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/index.ts
git commit -m "refactor(index): use paths module for lock directory"
```

---

### Task 4: Replace hardcoded paths in CLI commands

**Files:**
- Modify: `apps/backend/src/cli/logs.ts:5-8`
- Modify: `apps/backend/src/infra/updater.ts:59`

- [ ] **Step 1: Update logs.ts**

Replace the hardcoded log paths:

```typescript
// apps/backend/src/cli/logs.ts — full replacement
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';
import { getOpenTidyPaths } from '../paths.js';

export async function runLogs(): Promise<void> {
  const paths = getOpenTidyPaths();
  const logPaths = [
    path.join(paths.log, 'opentidy.log'),
    path.join(paths.log, 'opentidy-stdout.log'),
    // Legacy Homebrew path (macOS only)
    ...(process.platform === 'darwin' ? ['/opt/homebrew/var/log/opentidy.log'] : []),
  ];

  const logPath = logPaths.find(p => existsSync(p));
  if (!logPath) {
    console.log('  No log file found.');
    return;
  }

  console.log(`  Tailing ${logPath} (Ctrl+C to stop)\n`);

  // tail -f is Unix-only; on Windows use PowerShell Get-Content -Wait
  const isWindows = process.platform === 'win32';
  const tail = isWindows
    ? spawn('powershell', ['-Command', `Get-Content -Path "${logPath}" -Wait -Tail 50`], { stdio: 'inherit' })
    : spawn('tail', ['-f', logPath], { stdio: 'inherit' });
  tail.on('close', () => process.exit(0));
}
```

- [ ] **Step 2: Update updater.ts cache dir**

In `apps/backend/src/infra/updater.ts`:
1. Add import at top: `import { getOpenTidyPaths } from '../paths.js';`
2. Add import at top: `import path from 'path';`
3. Replace line 59 inside `spawnDetachedUpdater()`:

```typescript
// OLD:
const cacheDir = `${process.env.HOME}/.cache/opentidy/releases`;
// NEW:
const cacheDir = path.join(getOpenTidyPaths().cache, 'releases');
```

- [ ] **Step 3: Run tests**

```bash
cd /Users/lolo/Documents/opentidy && pnpm --filter @opentidy/backend test
```
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/cli/logs.ts apps/backend/src/infra/updater.ts
git commit -m "refactor(cli): use paths module in logs and updater"
```

---

### Task 5: ReceiverPlugin interface

**Files:**
- Create: `apps/backend/src/receiver/plugin.ts`
- Create: `apps/backend/tests/receiver/plugin.test.ts`
- Modify: `packages/shared/src/types.ts:63` (extend EventSource)

- [ ] **Step 1: Extend EventSource type to accept plugin sources**

In `packages/shared/src/types.ts`, change:
```typescript
export type EventSource = 'gmail' | 'whatsapp' | 'sms' | 'app' | 'telegram' | 'checkup';
```
to:
```typescript
export type BuiltinEventSource = 'gmail' | 'whatsapp' | 'sms' | 'app' | 'telegram' | 'checkup';
export type EventSource = BuiltinEventSource | 'mail' | 'imap';
```

Add new sources explicitly rather than widening to `string`. Plugin receivers use `source: string` in their own interface; the mapping to `EventSource` happens at the triage boundary where unknown sources are passed through as-is (the triage prompt receives the raw source string, Claude handles the routing).

**Note:** `createWatcher` in `watchers.ts` becomes dead code after Task 11 (receivers are now plugins). It can be removed or kept as a utility for community plugins that want polling behavior.

- [ ] **Step 2: Write the failing test**

```typescript
// apps/backend/tests/receiver/plugin.test.ts
import { describe, it, expect, vi } from 'vitest';
import type { ReceiverPlugin, ReceiverPluginMessage } from '../../src/receiver/plugin.js';

describe('ReceiverPlugin', () => {
  it('plugin conforming to interface can start and emit events', async () => {
    const messages: ReceiverPluginMessage[] = [];

    const fakePlugin: ReceiverPlugin = {
      name: 'test-receiver',
      source: 'test',
      init: vi.fn(),
      start: vi.fn(async (onMessage) => {
        onMessage({ from: 'user@test.com', body: 'hello', timestamp: new Date().toISOString() });
      }),
      stop: vi.fn(),
    };

    await fakePlugin.start((msg) => messages.push(msg));
    expect(messages).toHaveLength(1);
    expect(messages[0].from).toBe('user@test.com');
    expect(fakePlugin.start).toHaveBeenCalled();
  });

  it('loadReceiverPlugins loads plugins from config', async () => {
    const { loadReceiverPlugins } = await import('../../src/receiver/plugin.js');

    // With no plugins configured, returns empty array
    const plugins = await loadReceiverPlugins({ receivers: [] });
    expect(plugins).toEqual([]);
  });

  it('loadReceiverPlugins loads built-in plugin by name', async () => {
    const { loadReceiverPlugins } = await import('../../src/receiver/plugin.js');

    // gmail-webhook is a built-in — should resolve
    const plugins = await loadReceiverPlugins({
      receivers: [{ type: 'gmail-webhook', enabled: true }],
    });
    expect(plugins).toHaveLength(1);
    expect(plugins[0].name).toBe('gmail-webhook');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd /Users/lolo/Documents/opentidy && pnpm --filter @opentidy/backend test -- tests/receiver/plugin.test.ts
```
Expected: FAIL — module not found

- [ ] **Step 4: Write the implementation**

```typescript
// apps/backend/src/receiver/plugin.ts

export interface ReceiverPluginMessage {
  from: string;
  body: string;
  timestamp: string;
  metadata?: Record<string, string>;
}

export interface ReceiverPlugin {
  /** Unique name for this receiver (e.g., 'gmail-webhook', 'imessage') */
  name: string;
  /** Event source type used in triage (e.g., 'gmail', 'sms') */
  source: string;
  /** One-time initialization (connect, auth, etc.) */
  init: () => Promise<void> | void;
  /** Start receiving — call onMessage for each new message */
  start: (onMessage: (msg: ReceiverPluginMessage) => void) => Promise<void> | void;
  /** Stop receiving — cleanup resources */
  stop: () => Promise<void> | void;
}

export interface ReceiverConfig {
  type: string;       // built-in name or npm package name
  enabled: boolean;
  options?: Record<string, unknown>;
}

// Built-in receiver factories — keyed by type name
const builtinFactories: Record<string, (options?: Record<string, unknown>) => ReceiverPlugin> = {
  'gmail-webhook': () => ({
    name: 'gmail-webhook',
    source: 'gmail',
    init: () => {},
    start: () => {},
    stop: () => {},
  }),
};

export function registerBuiltinReceiver(
  type: string,
  factory: (options?: Record<string, unknown>) => ReceiverPlugin,
): void {
  builtinFactories[type] = factory;
}

export async function loadReceiverPlugins(
  config: { receivers: ReceiverConfig[] },
): Promise<ReceiverPlugin[]> {
  const plugins: ReceiverPlugin[] = [];

  for (const receiver of config.receivers) {
    if (!receiver.enabled) continue;

    // Try built-in first
    const factory = builtinFactories[receiver.type];
    if (factory) {
      plugins.push(factory(receiver.options));
      continue;
    }

    // Try loading as npm package (e.g., '@opentidy/receivers-macos')
    try {
      const mod = await import(receiver.type);
      if (typeof mod.createReceiver === 'function') {
        plugins.push(mod.createReceiver(receiver.options));
      } else {
        console.warn(`[receiver] Plugin ${receiver.type} has no createReceiver export`);
      }
    } catch (err) {
      console.error(`[receiver] Failed to load plugin ${receiver.type}:`, (err as Error).message);
    }
  }

  return plugins;
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd /Users/lolo/Documents/opentidy && pnpm --filter @opentidy/backend test -- tests/receiver/plugin.test.ts
```
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/receiver/plugin.ts apps/backend/tests/receiver/plugin.test.ts packages/shared/src/types.ts
git commit -m "feat(receiver): add ReceiverPlugin interface and dynamic loader"
```

---

### Task 6: Wrap existing receivers as plugins

**Files:**
- Modify: `apps/backend/src/receiver/sms-reader.ts` — add ReceiverPlugin wrapper
- Modify: `apps/backend/src/receiver/mail-reader.ts` — add ReceiverPlugin wrapper
- Modify: `apps/backend/src/receiver/plugin.ts` — register macOS receivers conditionally
- Create: `apps/backend/tests/receiver/macos-receivers.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/tests/receiver/macos-receivers.test.ts
import { describe, it, expect, vi } from 'vitest';

describe('macOS receiver plugins', () => {
  it('sms-reader exports createReceiver conforming to ReceiverPlugin', async () => {
    const { createSmsReceiverPlugin } = await import('../../src/receiver/sms-reader.js');
    const plugin = createSmsReceiverPlugin({ execFn: vi.fn(async () => '') });
    expect(plugin.name).toBe('imessage');
    expect(plugin.source).toBe('sms');
    expect(typeof plugin.init).toBe('function');
    expect(typeof plugin.start).toBe('function');
    expect(typeof plugin.stop).toBe('function');
  });

  it('mail-reader exports createReceiver conforming to ReceiverPlugin', async () => {
    const { createMailReceiverPlugin } = await import('../../src/receiver/mail-reader.js');
    const plugin = createMailReceiverPlugin({ execFn: vi.fn(async () => '') });
    expect(plugin.name).toBe('apple-mail');
    expect(plugin.source).toBe('mail');
    expect(typeof plugin.init).toBe('function');
    expect(typeof plugin.start).toBe('function');
    expect(typeof plugin.stop).toBe('function');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/lolo/Documents/opentidy && pnpm --filter @opentidy/backend test -- tests/receiver/macos-receivers.test.ts
```
Expected: FAIL — no `createSmsReceiverPlugin` export

- [ ] **Step 3: Add ReceiverPlugin wrapper to sms-reader.ts**

Add at the end of `apps/backend/src/receiver/sms-reader.ts`:

```typescript
import type { ReceiverPlugin, ReceiverPluginMessage } from './plugin.js';

export function createSmsReceiverPlugin(deps?: {
  execFn?: (script: string) => Promise<string>;
  pollIntervalMs?: number;
}): ReceiverPlugin {
  const reader = createSmsReader(deps);
  let timer: ReturnType<typeof setInterval> | null = null;
  const interval = deps?.pollIntervalMs ?? 300_000;

  return {
    name: 'imessage',
    source: 'sms',
    init: () => {},
    start: (onMessage: (msg: ReceiverPluginMessage) => void) => {
      async function poll() {
        const messages = await reader.getNewMessages();
        for (const msg of messages) {
          onMessage({ from: msg.from, body: msg.body, timestamp: msg.timestamp });
        }
      }
      timer = setInterval(poll, interval);
    },
    stop: () => { if (timer) clearInterval(timer); },
  };
}
```

- [ ] **Step 4: Add ReceiverPlugin wrapper to mail-reader.ts**

Same pattern — add at the end of `apps/backend/src/receiver/mail-reader.ts`:

```typescript
import type { ReceiverPlugin, ReceiverPluginMessage } from './plugin.js';

export function createMailReceiverPlugin(deps?: {
  execFn?: (script: string) => Promise<string>;
  pollIntervalMs?: number;
}): ReceiverPlugin {
  const reader = createMailReader(deps);
  let timer: ReturnType<typeof setInterval> | null = null;
  const interval = deps?.pollIntervalMs ?? 300_000;

  return {
    name: 'apple-mail',
    source: 'mail',
    init: () => {},
    start: (onMessage: (msg: ReceiverPluginMessage) => void) => {
      async function poll() {
        const messages = await reader.getNewMessages();
        for (const msg of messages) {
          onMessage({ from: msg.from, body: msg.body, timestamp: msg.timestamp });
        }
      }
      timer = setInterval(poll, interval);
    },
    stop: () => { if (timer) clearInterval(timer); },
  };
}
```

- [ ] **Step 5: Register macOS receivers conditionally in plugin.ts**

Update `loadReceiverPlugins` in `apps/backend/src/receiver/plugin.ts` to lazily resolve macOS builtins:

```typescript
// In loadReceiverPlugins, before the npm import fallback:
if (!factory && process.platform === 'darwin') {
  // Lazy-load macOS-only receivers on demand (no race condition)
  if (receiver.type === 'imessage') {
    const mod = await import('./sms-reader.js');
    const plugin = mod.createSmsReceiverPlugin(receiver.options);
    plugins.push(plugin);
    continue;
  }
  if (receiver.type === 'apple-mail') {
    const mod = await import('./mail-reader.js');
    const plugin = mod.createMailReceiverPlugin(receiver.options);
    plugins.push(plugin);
    continue;
  }
}
```

This is inside an `async` function so `await import()` is safe — no race condition.

- [ ] **Step 6: Run tests**

```bash
cd /Users/lolo/Documents/opentidy && pnpm --filter @opentidy/backend test -- tests/receiver/
```
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/receiver/sms-reader.ts apps/backend/src/receiver/mail-reader.ts apps/backend/src/receiver/plugin.ts apps/backend/tests/receiver/macos-receivers.test.ts
git commit -m "feat(receiver): wrap macOS readers as ReceiverPlugins, auto-register on darwin"
```

---

### Task 7: Cross-platform clipboard

**Files:**
- Create: `apps/backend/src/platform/clipboard.ts`
- Create: `apps/backend/tests/platform/clipboard.test.ts`
- Modify: `apps/backend/src/terminal/bridge.ts:62-65`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/tests/platform/clipboard.test.ts
import { describe, it, expect } from 'vitest';

describe('clipboard', () => {
  it('getClipboardCopyCommand returns a string', async () => {
    const { getClipboardCopyCommand } = await import('../../src/platform/clipboard.js');
    const cmd = getClipboardCopyCommand();
    expect(typeof cmd).toBe('string');
    expect(cmd.length).toBeGreaterThan(0);
  });

  it('returns pbcopy on darwin', async () => {
    const { getClipboardCopyCommand } = await import('../../src/platform/clipboard.js');
    if (process.platform === 'darwin') {
      expect(getClipboardCopyCommand()).toBe('pbcopy');
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/lolo/Documents/opentidy && pnpm --filter @opentidy/backend test -- tests/platform/clipboard.test.ts
```
Expected: FAIL

- [ ] **Step 3: Write implementation**

```typescript
// apps/backend/src/platform/clipboard.ts

/**
 * Returns the system clipboard copy command for the current platform.
 * Used by tmux copy-pipe-and-cancel binding.
 */
export function getClipboardCopyCommand(): string {
  switch (process.platform) {
    case 'darwin':
      return 'pbcopy';
    case 'win32':
      return 'clip.exe';
    default:
      // Linux — prefer xclip, fall back to xsel
      return 'xclip -selection clipboard';
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/lolo/Documents/opentidy && pnpm --filter @opentidy/backend test -- tests/platform/clipboard.test.ts
```
Expected: PASS

- [ ] **Step 5: Update terminal/bridge.ts to use it**

In `apps/backend/src/terminal/bridge.ts`, replace the two `pbcopy` lines (62-65):

```typescript
import { getClipboardCopyCommand } from '../platform/clipboard.js';

// Inside ensureTtyd, replace pbcopy references:
const clipCmd = getClipboardCopyCommand();
await execFile('tmux', ['bind-key', '-T', 'copy-mode', 'MouseDragEnd1Pane',
  'send-keys', '-X', 'copy-pipe-and-cancel', clipCmd]);
await execFile('tmux', ['bind-key', '-T', 'copy-mode-vi', 'MouseDragEnd1Pane',
  'send-keys', '-X', 'copy-pipe-and-cancel', clipCmd]);
```

- [ ] **Step 6: Run all tests**

```bash
cd /Users/lolo/Documents/opentidy && pnpm --filter @opentidy/backend test
```
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/platform/clipboard.ts apps/backend/tests/platform/clipboard.test.ts apps/backend/src/terminal/bridge.ts
git commit -m "feat(platform): cross-platform clipboard, replace hardcoded pbcopy"
```

---

### Task 8: Native service installer (`opentidy install-service`)

**Files:**
- Create: `apps/backend/src/platform/service-installer.ts`
- Create: `apps/backend/tests/platform/service-installer.test.ts`
- Modify: `apps/backend/src/cli.ts` — add `install-service` command

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/tests/platform/service-installer.test.ts
import { describe, it, expect } from 'vitest';
import { generateServiceFile } from '../../src/platform/service-installer.js';

describe('service-installer', () => {
  it('generates launchd plist on darwin', () => {
    const result = generateServiceFile({
      platform: 'darwin',
      nodePath: '/opt/homebrew/opt/node@22/bin/node',
      cliPath: '/opt/homebrew/lib/opentidy/dist/cli.js',
      logDir: '/Users/test/Library/Logs/opentidy',
    });
    expect(result.filename).toMatch(/\.plist$/);
    expect(result.content).toContain('com.opentidy.agent');
    expect(result.content).toContain('KeepAlive');
    expect(result.installPath).toContain('LaunchAgents');
  });

  it('generates systemd unit on linux', () => {
    const result = generateServiceFile({
      platform: 'linux',
      nodePath: '/usr/bin/node',
      cliPath: '/usr/lib/opentidy/dist/cli.js',
      logDir: '/home/test/.local/state/opentidy',
    });
    expect(result.filename).toMatch(/\.service$/);
    expect(result.content).toContain('[Unit]');
    expect(result.content).toContain('Restart=on-failure');
    expect(result.installPath).toContain('.config/systemd');
  });

  it('generates info message on windows', () => {
    const result = generateServiceFile({
      platform: 'win32',
      nodePath: 'C:\\Program Files\\nodejs\\node.exe',
      cliPath: 'C:\\Users\\test\\AppData\\Roaming\\npm\\node_modules\\opentidy\\dist\\cli.js',
      logDir: 'C:\\Users\\test\\AppData\\Local\\opentidy',
    });
    expect(result.filename).toBe('install-service.ps1');
    expect(result.content).toContain('New-Service');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/lolo/Documents/opentidy && pnpm --filter @opentidy/backend test -- tests/platform/service-installer.test.ts
```
Expected: FAIL

- [ ] **Step 3: Write implementation**

```typescript
// apps/backend/src/platform/service-installer.ts
import os from 'os';
import path from 'path';

export interface ServiceFileOptions {
  platform: string;
  nodePath: string;
  cliPath: string;
  logDir: string;
}

export interface ServiceFileResult {
  filename: string;
  content: string;
  installPath: string;
  instructions: string;
}

function generatePlist(opts: ServiceFileOptions): ServiceFileResult {
  const content = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.opentidy.agent</string>
  <key>ProgramArguments</key>
  <array>
    <string>${opts.nodePath}</string>
    <string>${opts.cliPath}</string>
    <string>start</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${opts.logDir}/opentidy-stdout.log</string>
  <key>StandardErrorPath</key>
  <string>${opts.logDir}/opentidy-stderr.log</string>
</dict>
</plist>`;

  const installPath = path.join(os.homedir(), 'Library/LaunchAgents/com.opentidy.agent.plist');
  return {
    filename: 'com.opentidy.agent.plist',
    content,
    installPath,
    instructions: `cp com.opentidy.agent.plist ${installPath}\nlaunchctl load ${installPath}`,
  };
}

function generateSystemd(opts: ServiceFileOptions): ServiceFileResult {
  const content = `[Unit]
Description=OpenTidy Personal AI Assistant
After=network.target

[Service]
Type=simple
ExecStart=${opts.nodePath} ${opts.cliPath} start
Restart=on-failure
RestartSec=10
StandardOutput=append:${opts.logDir}/opentidy-stdout.log
StandardError=append:${opts.logDir}/opentidy-stderr.log

[Install]
WantedBy=default.target`;

  const installPath = path.join(os.homedir(), '.config/systemd/user/opentidy.service');
  return {
    filename: 'opentidy.service',
    content,
    installPath,
    instructions: `cp opentidy.service ${installPath}\nsystemctl --user daemon-reload\nsystemctl --user enable --now opentidy`,
  };
}

function generateWindowsService(opts: ServiceFileOptions): ServiceFileResult {
  const content = `# OpenTidy Windows Service installer (requires admin)
$serviceName = "OpenTidy"
$nodePath = "${opts.nodePath}"
$cliPath = "${opts.cliPath}"

New-Service -Name $serviceName -BinaryPathName "$nodePath $cliPath start" -DisplayName "OpenTidy AI Assistant" -StartupType Automatic -Description "OpenTidy Personal AI Assistant"
Start-Service $serviceName`;

  return {
    filename: 'install-service.ps1',
    content,
    installPath: path.join(os.homedir(), 'install-service.ps1'),
    instructions: 'Run as Administrator: powershell -ExecutionPolicy Bypass -File install-service.ps1',
  };
}

export function generateServiceFile(opts: ServiceFileOptions): ServiceFileResult {
  switch (opts.platform) {
    case 'darwin': return generatePlist(opts);
    case 'linux': return generateSystemd(opts);
    case 'win32': return generateWindowsService(opts);
    default: throw new Error(`Unsupported platform: ${opts.platform}`);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/lolo/Documents/opentidy && pnpm --filter @opentidy/backend test -- tests/platform/service-installer.test.ts
```
Expected: PASS

- [ ] **Step 5: Add `install-service` CLI command**

In `apps/backend/src/cli.ts`:
1. Add `'install-service'` to the `COMMANDS` array (line 4)
2. Add the case to the router switch:

```typescript
case 'install-service': {
  const { runInstallService } = await import('./cli/install-service.js');
  return runInstallService();
}
```

Create `apps/backend/src/cli/install-service.ts`:

```typescript
import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { generateServiceFile } from '../platform/service-installer.js';
import { getOpenTidyPaths } from '../paths.js';

export async function runInstallService(): Promise<void> {
  const paths = getOpenTidyPaths();
  const nodePath = process.execPath;
  const cliPath = process.argv[1];

  const result = generateServiceFile({
    platform: process.platform,
    nodePath,
    cliPath,
    logDir: paths.log,
  });

  mkdirSync(dirname(result.installPath), { recursive: true });
  writeFileSync(result.installPath, result.content);
  console.log(`Service file written to: ${result.installPath}`);
  console.log(`\nTo activate:\n${result.instructions}`);
}
```

- [ ] **Step 6: Run all tests**

```bash
cd /Users/lolo/Documents/opentidy && pnpm --filter @opentidy/backend test
```
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/platform/service-installer.ts apps/backend/tests/platform/service-installer.test.ts apps/backend/src/cli/install-service.ts apps/backend/src/cli.ts
git commit -m "feat(cli): add install-service command for cross-platform daemon setup"
```

---

### Task 9: Node.js daemon supervisor

**Files:**
- Create: `apps/backend/src/daemon.ts`
- Create: `apps/backend/tests/daemon.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/tests/daemon.test.ts
import { describe, it, expect, vi } from 'vitest';

describe('daemon', () => {
  it('createSupervisor returns start and stop', async () => {
    const { createSupervisor } = await import('../src/daemon.js');
    const supervisor = createSupervisor({
      script: 'nonexistent.js',
      maxRestarts: 3,
      restartDelayMs: 100,
    });
    expect(typeof supervisor.start).toBe('function');
    expect(typeof supervisor.stop).toBe('function');
  });

  it('writePidFile writes process.pid', async () => {
    const { writePidFile, readPidFile, removePidFile } = await import('../src/daemon.js');
    const tmpPath = `/tmp/opentidy-test-${Date.now()}.pid`;
    writePidFile(tmpPath);
    const pid = readPidFile(tmpPath);
    expect(pid).toBe(process.pid);
    removePidFile(tmpPath);
    expect(readPidFile(tmpPath)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/lolo/Documents/opentidy && pnpm --filter @opentidy/backend test -- tests/daemon.test.ts
```
Expected: FAIL

- [ ] **Step 3: Write implementation**

```typescript
// apps/backend/src/daemon.ts
import { fork, type ChildProcess } from 'child_process';
import { writeFileSync, readFileSync, unlinkSync, existsSync } from 'fs';
import path from 'path';
import { getOpenTidyPaths } from './paths.js';

export interface SupervisorOptions {
  script: string;
  args?: string[];
  maxRestarts?: number;
  restartDelayMs?: number;
}

export function writePidFile(pidPath: string): void {
  writeFileSync(pidPath, String(process.pid));
}

export function readPidFile(pidPath: string): number | undefined {
  try {
    const pid = parseInt(readFileSync(pidPath, 'utf-8').trim(), 10);
    return isNaN(pid) ? undefined : pid;
  } catch {
    return undefined;
  }
}

export function removePidFile(pidPath: string): void {
  try { unlinkSync(pidPath); } catch {}
}

export function createSupervisor(opts: SupervisorOptions) {
  const maxRestarts = opts.maxRestarts ?? 10;
  const restartDelay = opts.restartDelayMs ?? 5000;
  let child: ChildProcess | null = null;
  let restartCount = 0;
  let stopped = false;

  function spawnWorker(): void {
    child = fork(opts.script, opts.args ?? [], {
      stdio: 'inherit',
      detached: false,
    });

    child.on('exit', (code) => {
      if (stopped) return;
      if (code !== 0 && restartCount < maxRestarts) {
        restartCount++;
        console.log(`[supervisor] Worker exited with code ${code}, restarting (${restartCount}/${maxRestarts})...`);
        setTimeout(spawnWorker, restartDelay);
      } else if (restartCount >= maxRestarts) {
        console.error(`[supervisor] Max restarts (${maxRestarts}) reached, giving up`);
        process.exit(1);
      }
    });
  }

  function start(): void {
    stopped = false;
    const paths = getOpenTidyPaths();
    const pidPath = path.join(paths.temp, 'opentidy.pid');
    writePidFile(pidPath);
    spawnWorker();
  }

  function stop(): void {
    stopped = true;
    if (child && !child.killed) {
      child.kill('SIGTERM');
    }
    const paths = getOpenTidyPaths();
    removePidFile(path.join(paths.temp, 'opentidy.pid'));
  }

  return { start, stop };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/lolo/Documents/opentidy && pnpm --filter @opentidy/backend test -- tests/daemon.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/daemon.ts apps/backend/tests/daemon.test.ts
git commit -m "feat(daemon): add Node.js supervisor with auto-restart"
```

---

### Task 10: Cross-platform CLI entry point

**Files:**
- Modify: `bin/opentidy` — keep for backward compat but simplify
- Create: `bin/opentidy.mjs` — JS entry point for npm global install (works on Windows)
- Modify: root `package.json` — add `bin` field

The current `bin/opentidy` is a shell script that resolves node@22 and finds dist/cli.js. This doesn't work on Windows. We need a JS entry point for npm-based distribution.

- [ ] **Step 1: Create JS entry point**

```javascript
#!/usr/bin/env node
// bin/opentidy.mjs — Cross-platform CLI entry point for npm global install.
// On macOS/Homebrew, bin/opentidy (shell) is used instead.
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { resolve, dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Resolve dist/cli.js relative to this file
const candidates = [
  resolve(__dirname, '../dist/cli.js'),                          // npm global
  resolve(__dirname, '../apps/backend/dist/cli.js'),             // dev mode
  resolve(__dirname, '../libexec/dist/cli.js'),                  // homebrew
];

const cliPath = candidates.find(p => existsSync(p));

if (!cliPath) {
  console.error('Error: Cannot find dist/cli.js. Run "pnpm build" first.');
  process.exit(1);
}

await import(cliPath);
```

- [ ] **Step 2: Add bin field to root package.json**

Add or update the `bin` field:

```json
{
  "bin": {
    "opentidy": "./bin/opentidy.mjs"
  }
}
```

- [ ] **Step 3: Verify it works**

```bash
node /Users/lolo/Documents/opentidy/bin/opentidy.mjs --help
```
Expected: Shows CLI help (or "run pnpm build" if not built)

- [ ] **Step 4: Commit**

```bash
git add bin/opentidy.mjs package.json
git commit -m "feat(cli): add cross-platform JS entry point for npm distribution"
```

---

### Task 11: Receiver-driven boot in index.ts

**Files:**
- Modify: `apps/backend/src/index.ts:193-209`
- Modify: `packages/shared/src/types.ts` (add receivers to config)

This task makes `index.ts` load receivers dynamically based on config instead of hardcoding SMS/Mail watchers. The config determines which receivers are active — on macOS, imessage + apple-mail are enabled by default; on Linux/Windows, they're omitted.

- [ ] **Step 1: Add receivers config to OpenTidyConfig**

In `packages/shared/src/types.ts`, add to `OpenTidyConfig`:

```typescript
export interface ReceiverConfigEntry {
  type: string;
  enabled: boolean;
  options?: Record<string, unknown>;
}

export interface OpenTidyConfig {
  // ... existing fields ...
  receivers: ReceiverConfigEntry[];
}
```

- [ ] **Step 2: Add default receivers in config.ts**

In `apps/backend/src/config.ts`, update DEFAULT_CONFIG:

```typescript
const DEFAULT_CONFIG: OpenTidyConfig = {
  // ... existing ...
  receivers: process.platform === 'darwin'
    ? [
        { type: 'gmail-webhook', enabled: true },
        { type: 'imessage', enabled: true },
        { type: 'apple-mail', enabled: true },
      ]
    : [
        { type: 'gmail-webhook', enabled: true },
      ],
};
```

- [ ] **Step 3: Update index.ts to use dynamic receiver loading**

Replace the hardcoded SMS/Mail watcher block (lines 193-209) with:

```typescript
// Dynamic receiver loading — config-driven
import { loadReceiverPlugins } from './receiver/plugin.js';

const receiverPlugins = await loadReceiverPlugins({ receivers: config.receivers ?? [] });
for (const plugin of receiverPlugins) {
  await plugin.init();
  plugin.start((msg) => {
    // Dedup on JSON.stringify to match existing createWatcher behavior
    const raw = JSON.stringify(msg);
    if (dedup.isDuplicate(raw)) return;
    dedup.record(raw);
    console.log(`[receiver] ${plugin.source} message from ${msg.from}`);
    // triageAndHandle accepts { source, content } — no metadata field
    triageAndHandle({
      source: plugin.source,
      content: `${plugin.source} de ${msg.from}: ${msg.body}`,
    });
  });
  console.log(`[opentidy] Receiver started: ${plugin.name}`);
}
```

Also update `gracefulShutdown` to stop plugin receivers:

```typescript
// In gracefulShutdown, replace smsWatcher.stop() + mailWatcher.stop() with:
for (const plugin of receiverPlugins) {
  plugin.stop();
}
```

- [ ] **Step 4: Run all tests**

```bash
cd /Users/lolo/Documents/opentidy && pnpm --filter @opentidy/backend test
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/index.ts apps/backend/src/config.ts packages/shared/src/types.ts
git commit -m "feat(boot): dynamic receiver loading from config, macOS receivers auto-detected"
```

---

### Task 12: Install scripts for npm distribution

**Files:**
- Create: `scripts/install.sh`
- Create: `scripts/install.ps1`

- [ ] **Step 1: Create macOS/Linux install script**

```bash
#!/bin/bash
# scripts/install.sh — OpenTidy installer for macOS and Linux
set -e

echo "Installing OpenTidy..."

# Check for Node.js >= 22
if command -v node >/dev/null 2>&1; then
  NODE_MAJOR=$(node --version | sed 's/^v\([0-9]*\).*/\1/')
  if [ "$NODE_MAJOR" -lt 22 ]; then
    echo "Error: Node.js >= 22 required (found v$(node --version))"
    echo "Install from: https://nodejs.org/"
    exit 1
  fi
else
  echo "Error: Node.js not found. Install from: https://nodejs.org/"
  exit 1
fi

# Install via npm
npm install -g opentidy

echo ""
echo "OpenTidy installed! Run:"
echo "  opentidy setup"
```

- [ ] **Step 2: Create Windows PowerShell install script**

```powershell
# scripts/install.ps1 — OpenTidy installer for Windows
$ErrorActionPreference = "Stop"

Write-Host "Installing OpenTidy..." -ForegroundColor Cyan

# Check for Node.js >= 22
try {
    $nodeVersion = (node --version) -replace '^v', ''
    $major = [int]($nodeVersion -split '\.')[0]
    if ($major -lt 22) {
        Write-Host "Error: Node.js >= 22 required (found v$nodeVersion)" -ForegroundColor Red
        Write-Host "Install from: https://nodejs.org/"
        exit 1
    }
} catch {
    Write-Host "Error: Node.js not found. Install from: https://nodejs.org/" -ForegroundColor Red
    exit 1
}

# Install via npm
npm install -g opentidy

Write-Host ""
Write-Host "OpenTidy installed! Run:" -ForegroundColor Green
Write-Host "  opentidy setup"
```

- [ ] **Step 3: Commit**

```bash
git add scripts/install.sh scripts/install.ps1
git commit -m "feat(dist): add cross-platform install scripts (bash + PowerShell)"
```

---

### Task 13: Platform-guard terminal bridge (tmux/ttyd/pkill)

**Files:**
- Modify: `apps/backend/src/terminal/bridge.ts`

The terminal bridge uses tmux, ttyd, and pkill — all Unix-only. On Windows, interactive mode is not available (no tmux). We guard the entire module so it gracefully degrades.

- [ ] **Step 1: Add platform guard to createTerminalManager**

In `apps/backend/src/terminal/bridge.ts`, wrap the cleanup and functions:

```typescript
// At the top of cleanupOrphanTtyd:
function cleanupOrphanTtyd(): void {
  if (process.platform === 'win32') return; // pkill not available on Windows
  try {
    execFileSync('pkill', ['-f', '^ttyd.*tmux attach-session'], { stdio: 'ignore' });
    console.log('[terminal] Cleaned up orphan ttyd processes');
  } catch {
    // No ttyd processes to kill — that's fine
  }
}

// At the top of ensureTtyd:
export async function ensureTtyd(sessionName: string): Promise<number> {
  if (process.platform === 'win32') {
    console.warn('[terminal] Interactive mode (tmux/ttyd) not available on Windows');
    return 0;
  }
  // ... rest unchanged
```

- [ ] **Step 2: Run all tests**

```bash
cd /Users/lolo/Documents/opentidy && pnpm --filter @opentidy/backend test
```
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/terminal/bridge.ts
git commit -m "fix(terminal): platform-guard tmux/ttyd/pkill for Windows compatibility"
```

---

### Task 14: Cross-platform uninstall command

**Files:**
- Modify: `apps/backend/src/cli/uninstall.ts`

This file has extensive macOS-specific paths (LaunchAgent, ~/Library/Logs, launchctl, .Trash). Platform-guard all OS-specific cleanup and use `paths.ts` for portable paths.

- [ ] **Step 1: Update uninstall.ts imports and path references**

Add at top:
```typescript
import { getOpenTidyPaths } from '../paths.js';
```

Replace hardcoded paths:
- `/tmp/opentidy-locks` → `getOpenTidyPaths().lockDir`
- `~/Library/Logs/opentidy-*` → `path.join(getOpenTidyPaths().log, 'opentidy-*.log')`
- `~/.cache/opentidy` → `getOpenTidyPaths().cache`

- [ ] **Step 2: Platform-guard LaunchAgent/launchctl sections**

Wrap the LaunchAgent unload block and plist references:
```typescript
if (process.platform === 'darwin') {
  // LaunchAgent unload logic (launchctl bootout/unload)
  // plist path references
}
```

- [ ] **Step 3: Platform-guard .Trash usage**

```typescript
// Replace .Trash with platform-appropriate deletion
// On macOS: move to .Trash
// On Linux/Windows: just rm -rf
if (process.platform === 'darwin') {
  const trashDir = join(home, '.Trash');
  // ... existing trash logic
} else {
  // Direct removal
  fs.rmSync(targetPath, { recursive: true, force: true });
}
```

- [ ] **Step 4: Run all tests**

```bash
cd /Users/lolo/Documents/opentidy && pnpm --filter @opentidy/backend test
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/cli/uninstall.ts
git commit -m "refactor(uninstall): use paths module, platform-guard macOS-specific cleanup"
```

---

### Task 15: Platform-guard Camoufox cleanup in index.ts

**Files:**
- Modify: `apps/backend/src/index.ts:81-98`

The Camoufox profile cleanup references `~/.camofox/profiles/default` and calls `curl`. Guard it.

- [ ] **Step 1: Wrap Camoufox block with platform check**

In `apps/backend/src/index.ts`, lines 81-98, wrap the entire block:

```typescript
// Camoufox profile cleanup — only on macOS where Camoufox is used
if (process.platform === 'darwin') {
  try {
    // ... existing Camoufox health check + profile cleanup
  } catch {
    console.log('[opentidy] Camoufox server not running or not reachable — skipping profile check');
  }
}
```

- [ ] **Step 2: Run tests**

```bash
cd /Users/lolo/Documents/opentidy && pnpm --filter @opentidy/backend test
```
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/index.ts
git commit -m "fix(boot): platform-guard Camoufox cleanup for non-macOS"
```

---

## Summary of changes

| Task | What | Impact |
|------|------|--------|
| 1 | `paths.ts` with env-paths | Foundation — all paths OS-aware |
| 2-4 | Replace hardcoded paths | config.ts, index.ts, logs.ts, updater.ts use paths module |
| 5-6 | ReceiverPlugin interface + macOS wrappers | Pluggable architecture for event sources |
| 7 | Cross-platform clipboard | terminal bridge works on Linux |
| 8 | `install-service` command | Optional native daemon (LaunchAgent/systemd/Windows Service) |
| 9 | Node.js daemon supervisor | `opentidy start` auto-restarts on crash, works everywhere |
| 10 | JS CLI entry point | `npx opentidy` works on Windows |
| 11 | Dynamic receiver boot | Receivers loaded from config, macOS auto-detected |
| 12 | Install scripts | One-liner install for all platforms |
| 13 | Platform-guard terminal bridge | tmux/ttyd gracefully degrade on Windows |
| 14 | Cross-platform uninstall | uninstall works on all platforms |
| 15 | Platform-guard Camoufox | Boot doesn't crash on non-macOS |

**After this plan:** OpenTidy core runs on macOS, Linux, and Windows. macOS-specific features (iMessage, Apple Mail, Apple Contacts) are auto-enabled on darwin and absent on other platforms. Interactive mode (tmux/ttyd) requires Unix. No functionality lost for existing macOS users.

**Known limitation:** Interactive mode (tmux → ttyd → xterm.js) is Unix-only. On Windows, only autonomous mode is available. A future plan could add Windows Terminal integration or PowerShell-based alternatives.
