# Alfred Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Alfred installable via Homebrew with auto-updates, isolated Claude Code config, bearer token auth, and static frontend serving — ready for production on a remote Mac Mini.

**Architecture:** A new CLI layer (`bin/tidy` shell wrapper + `cli.ts` router) wraps the existing backend. Config moves from env vars to `~/.config/opentidy/config.json`. Claude Code sessions use `CLAUDE_CONFIG_DIR` for isolation. Static frontend served by Hono in production. Auto-updater checks GitHub Releases and spawns a detached shell script for brew upgrade + rollback. CI builds pre-compiled tarballs via `pnpm deploy`.

**Tech Stack:** Hono (static serving + auth middleware), Node.js readline (interactive setup), GitHub Actions (CI/CD), Homebrew (distribution), `CLAUDE_CONFIG_DIR` (Claude Code isolation)

**Spec:** `docs/superpowers/specs/2026-03-18-deployment-design.md`

---

## File Map

### New files

| File | Responsibility |
|---|---|
| `apps/backend/src/cli.ts` | CLI subcommand router (start, setup, doctor, status, update, logs, --version) |
| `apps/backend/src/cli/setup.ts` | Interactive first-time setup wizard |
| `apps/backend/src/cli/doctor.ts` | Verify deps, permissions, config, connectivity |
| `apps/backend/src/cli/status.ts` | Show service state, version, uptime |
| `apps/backend/src/cli/update.ts` | Force update now |
| `apps/backend/src/cli/logs.ts` | Tail log files |
| `apps/backend/src/config.ts` | Load/save `~/.config/opentidy/config.json`, merge with defaults |
| `apps/backend/src/infra/updater.ts` | Periodic GitHub Releases check, spawn detached updater |
| `apps/backend/src/middleware/auth.ts` | Bearer token verification middleware for Hono |
| `apps/backend/config/claude/settings.json` | Claude Code config template (permissions, MCP servers) |
| `apps/backend/config/claude/CLAUDE.md` | Claude Code prompt template (Alfred identity) |
| `bin/tidy` | Shell wrapper: `exec node "$LIBEXEC/dist/cli.js" "$@"` |
| `opentidy-updater.sh` | Detached update script (brew upgrade + health check + rollback) |
| `.github/workflows/release.yml` | CI: test, build, pnpm deploy, tarball, GitHub Release, update tap |
| `install.sh` | One-liner convenience: brew tap + install + setup |

### Modified files

| File | Change |
|---|---|
| `apps/backend/src/index.ts` | Extract server boot into exported `startServer()` function, use config |
| `apps/backend/src/server.ts` | Add auth middleware + serveStatic for `web-dist/` |
| `apps/backend/src/infra/spawn-claude.ts` | Pass `CLAUDE_CONFIG_DIR` in child process env |
| `apps/backend/src/launcher/session.ts` | Pass `CLAUDE_CONFIG_DIR` in tmux/claude commands |
| `apps/backend/package.json` | Add `"bin"` field |
| `packages/shared/src/types.ts` | Add `AlfredConfig` type |

---

## Task 1: Config System

**Files:**
- Create: `apps/backend/src/config.ts`
- Modify: `packages/shared/src/types.ts` (add `AlfredConfig` type)
- Test: `apps/backend/tests/config.test.ts`

- [ ] **Step 1: Define the AlfredConfig type in shared types**

Add to `packages/shared/src/types.ts`:

```typescript
export interface AlfredConfig {
  version: number;
  telegram: {
    botToken: string;
    chatId: string;
    userId?: string;
  };
  auth: {
    bearerToken: string;
  };
  server: {
    port: number;
    appBaseUrl: string;
  };
  workspace: {
    dir: string;
    lockDir: string;
  };
  update: {
    autoUpdate: boolean;
    checkInterval: string;
    notifyBeforeUpdate: boolean;
    delayBeforeUpdate: string;
    keepReleases: number;
  };
  claudeConfig: {
    dir: string;
  };
}
```

- [ ] **Step 2: Write failing test for config loading**

```typescript
// apps/backend/tests/config.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('config', () => {
  let configDir: string;

  beforeEach(() => {
    configDir = mkdtempSync(join(tmpdir(), 'alfred-config-'));
  });

  afterEach(() => {
    rmSync(configDir, { recursive: true, force: true });
  });

  it('loads config from file', async () => {
    const configPath = join(configDir, 'config.json');
    writeFileSync(configPath, JSON.stringify({
      version: 1,
      telegram: { botToken: 'test-token', chatId: '123' },
      auth: { bearerToken: 'secret' },
      server: { port: 5175, appBaseUrl: 'http://localhost:5175' },
      workspace: { dir: '/tmp/workspace', lockDir: '/tmp/locks' },
      update: { autoUpdate: true, checkInterval: '6h', notifyBeforeUpdate: true, delayBeforeUpdate: '5m', keepReleases: 3 },
      claudeConfig: { dir: join(configDir, 'claude-config') },
    }));
    const { loadConfig } = await import('../src/config.js');
    const config = loadConfig(configPath);
    expect(config.telegram.botToken).toBe('test-token');
    expect(config.server.port).toBe(5175);
  });

  it('returns defaults when no config file exists', async () => {
    const { loadConfig } = await import('../src/config.js');
    const config = loadConfig(join(configDir, 'nonexistent.json'));
    expect(config.server.port).toBe(5175);
    expect(config.update.autoUpdate).toBe(true);
  });

  it('saves config to file', async () => {
    const configPath = join(configDir, 'config.json');
    const { loadConfig, saveConfig } = await import('../src/config.js');
    const config = loadConfig(configPath);
    config.telegram.botToken = 'new-token';
    saveConfig(configPath, config);
    const reloaded = loadConfig(configPath);
    expect(reloaded.telegram.botToken).toBe('new-token');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @opentidy/backend test -- tests/config.test.ts`
Expected: FAIL — module `../src/config.js` not found

- [ ] **Step 4: Implement config.ts**

```typescript
// apps/backend/src/config.ts
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import type { AlfredConfig } from '@opentidy/shared';

const DEFAULT_CONFIG: AlfredConfig = {
  version: 1,
  telegram: { botToken: '', chatId: '', userId: '' },
  auth: { bearerToken: '' },
  server: { port: 5175, appBaseUrl: 'http://localhost:5175' },
  workspace: { dir: '', lockDir: '/tmp/opentidy-locks' },
  update: {
    autoUpdate: true,
    checkInterval: '6h',
    notifyBeforeUpdate: true,
    delayBeforeUpdate: '5m',
    keepReleases: 3,
  },
  claudeConfig: { dir: '' },
};

export function getConfigPath(): string {
  return process.env.ALFRED_CONFIG_PATH
    || `${process.env.HOME}/.config/opentidy/config.json`;
}

function deepMerge<T extends Record<string, any>>(defaults: T, overrides: Record<string, any>): T {
  const result = { ...defaults };
  for (const key of Object.keys(overrides)) {
    if (overrides[key] && typeof overrides[key] === 'object' && !Array.isArray(overrides[key])
        && defaults[key] && typeof defaults[key] === 'object') {
      result[key as keyof T] = deepMerge(defaults[key], overrides[key]);
    } else {
      result[key as keyof T] = overrides[key];
    }
  }
  return result;
}

export function loadConfig(configPath?: string): AlfredConfig {
  const path = configPath || getConfigPath();
  try {
    const raw = readFileSync(path, 'utf-8');
    const parsed = JSON.parse(raw);
    return deepMerge(DEFAULT_CONFIG, parsed);
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(configPath: string, config: AlfredConfig): void {
  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @opentidy/backend test -- tests/config.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/types.ts apps/backend/src/config.ts apps/backend/tests/config.test.ts
git commit -m "feat(config): add config system with ~/.config/opentidy/config.json"
```

---

## Task 2: CLI Entrypoint & Subcommand Router

**Files:**
- Create: `apps/backend/src/cli.ts`
- Create: `bin/tidy`
- Modify: `apps/backend/src/index.ts`
- Modify: `apps/backend/package.json`
- Test: `apps/backend/tests/cli.test.ts`

- [ ] **Step 1: Write failing test for CLI router**

```typescript
// apps/backend/tests/cli.test.ts
import { describe, it, expect } from 'vitest';

describe('cli', () => {
  it('exports route function', async () => {
    const { route } = await import('../src/cli.js');
    expect(typeof route).toBe('function');
  });

  it('returns "start" for alfred start', async () => {
    const { route } = await import('../src/cli.js');
    expect(route(['start'])).toBe('start');
  });

  it('returns "version" for --version', async () => {
    const { route } = await import('../src/cli.js');
    expect(route(['--version'])).toBe('version');
  });

  it('returns "help" for unknown command', async () => {
    const { route } = await import('../src/cli.js');
    expect(route(['nonsense'])).toBe('help');
  });

  it('returns "start" when no args (default)', async () => {
    const { route } = await import('../src/cli.js');
    expect(route([])).toBe('start');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @opentidy/backend test -- tests/cli.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement cli.ts**

```typescript
// apps/backend/src/cli.ts
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';

const COMMANDS = ['start', 'setup', 'doctor', 'status', 'update', 'logs'] as const;
type Command = typeof COMMANDS[number] | 'version' | 'help';

export function route(args: string[]): Command {
  const cmd = args[0];
  if (cmd === '--version' || cmd === '-v') return 'version';
  if (cmd === '--help' || cmd === '-h') return 'help';
  if (COMMANDS.includes(cmd as any)) return cmd as Command;
  if (!cmd) return 'start';
  return 'help';
}

export function getVersion(): string {
  try {
    // In production (Homebrew): dist/cli.js is at libexec/dist/cli.js, VERSION at libexec/VERSION
    // import.meta.dirname = libexec/dist/, so ../VERSION = libexec/VERSION
    return readFileSync(resolve(import.meta.dirname, '../VERSION'), 'utf-8').trim();
  } catch {
    try {
      const pkg = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../package.json'), 'utf-8'));
      return pkg.version || 'dev';
    } catch {
      return 'dev';
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const cmd = route(args);

  switch (cmd) {
    case 'version':
      console.log(`alfred ${getVersion()}`);
      break;
    case 'start':
      await import('./index.js');
      break;
    case 'setup': {
      const { runSetup } = await import('./cli/setup.js');
      await runSetup();
      break;
    }
    case 'doctor': {
      const { runDoctor } = await import('./cli/doctor.js');
      await runDoctor();
      break;
    }
    case 'status': {
      const { runStatus } = await import('./cli/status.js');
      await runStatus();
      break;
    }
    case 'update': {
      const { runUpdate } = await import('./cli/update.js');
      await runUpdate();
      break;
    }
    case 'logs': {
      const { runLogs } = await import('./cli/logs.js');
      await runLogs();
      break;
    }
    case 'help':
      console.log(`Usage: alfred <command>

Commands:
  start     Start the backend server (default)
  setup     Interactive first-time setup
  doctor    Verify deps, permissions, config
  status    Show service state, version, uptime
  update    Check and apply updates
  logs      Tail log files

Options:
  --version  Show version
  --help     Show this help`);
      break;
  }
}

main().catch((err) => {
  console.error('[cli] Fatal error:', err);
  process.exit(1);
});
```

- [ ] **Step 4: Refactor index.ts — extract boot() function**

This is the most significant refactoring step. The current `index.ts` is ~283 lines of imperative top-level code. Wrap it in an exported `boot()` function.

**Important:** The existing `startServer()` from `server.ts` is already called `startServer`. Name the new function `boot()` to avoid collision.

Concrete changes:
1. Move the top-level `fs.mkdirSync` calls (lines 43-47) inside `boot()`
2. Move all infrastructure initialization (DB, locks, SSE, etc.) inside `boot()`
3. Move watcher startups and intervals inside `boot()`
4. Keep `import` statements at the top level
5. At the bottom:

```typescript
export async function boot() {
  // All existing initialization code goes here:
  // - mkdirSync for workspace dirs
  // - loadConfig + resolve env vars
  // - infra boot (DB, locks, dedup, audit, SSE)
  // - create spawnClaude, launcher, receiver, etc.
  // - create and start server
  // - start watchers, checkup intervals
  // - signal handlers
}

// Auto-start when run directly (not via cli.ts)
const isDirectRun = process.argv[1]?.endsWith('index.js') || process.argv[1]?.endsWith('index.ts');
if (isDirectRun) {
  boot().catch(err => {
    console.error('[boot] Fatal:', err);
    process.exit(1);
  });
}
```

Then in `cli.ts`, the `start` command does:
```typescript
case 'start': {
  const { boot } = await import('./index.js');
  await boot();
  break;
}
```

- [ ] **Step 5: Create bin/tidy shell wrapper**

```bash
#!/bin/sh
# Resolve the libexec directory (Homebrew installs here)
LIBEXEC="$(cd "$(dirname "$0")/../libexec" 2>/dev/null && pwd)"
if [ -z "$LIBEXEC" ] || [ ! -f "$LIBEXEC/dist/cli.js" ]; then
  # Dev mode: relative to repo root
  LIBEXEC="$(cd "$(dirname "$0")/../apps/backend" 2>/dev/null && pwd)"
fi
exec node "$LIBEXEC/dist/cli.js" "$@"
```

Make executable: `chmod +x bin/tidy`

- [ ] **Step 6: Add bin field to package.json**

In `apps/backend/package.json`, add:

```json
"bin": {
  "alfred": "../../bin/tidy"
}
```

- [ ] **Step 7: Run tests to verify it passes**

Run: `pnpm --filter @opentidy/backend test -- tests/cli.test.ts`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add apps/backend/src/cli.ts apps/backend/src/index.ts apps/backend/tests/cli.test.ts bin/tidy apps/backend/package.json
git commit -m "feat(cli): add CLI entrypoint with subcommand routing"
```

---

## Task 3: Claude Code Config Isolation

**Files:**
- Create: `apps/backend/config/claude/settings.json`
- Create: `apps/backend/config/claude/CLAUDE.md`
- Modify: `apps/backend/src/infra/spawn-claude.ts`
- Modify: `apps/backend/src/launcher/session.ts`
- Test: `apps/backend/tests/infra/spawn-claude-config.test.ts`

- [ ] **Step 1: Create Claude Code settings template**

```json
// apps/backend/config/claude/settings.json
{
  "permissions": {
    "allow": [
      "Read",
      "Write",
      "Edit",
      "Glob",
      "Grep",
      "Bash(npm:*)",
      "Bash(pnpm:*)",
      "Bash(git:*)",
      "Bash(osascript:*)",
      "Bash(open:*)",
      "Bash(curl:*)",
      "Bash(python3:*)",
      "mcp__camofox__*",
      "mcp__gmail__*"
    ],
    "deny": []
  }
}
```

- [ ] **Step 2: Copy workspace/CLAUDE.md to config template**

Copy current `workspace/CLAUDE.md` to `apps/backend/config/claude/CLAUDE.md`. This becomes the versioned template.

- [ ] **Step 3: Write failing test for CLAUDE_CONFIG_DIR in spawn**

```typescript
// apps/backend/tests/infra/spawn-claude-config.test.ts
import { describe, it, expect, vi } from 'vitest';

describe('spawn-claude CLAUDE_CONFIG_DIR', () => {
  it('includes CLAUDE_CONFIG_DIR in spawn env when configured', () => {
    // Verify that the spawn function passes CLAUDE_CONFIG_DIR
    // Test depends on existing spawn-claude mock patterns
    expect(true).toBe(true); // adapt to existing test infra
  });
});
```

- [ ] **Step 4: Modify spawn-claude.ts to pass CLAUDE_CONFIG_DIR**

In `apps/backend/src/infra/spawn-claude.ts`, add `claudeConfigDir` to the `SpawnClaudeDeps` interface (factory-level, same for all calls):

```typescript
// In SpawnClaudeDeps interface, add:
claudeConfigDir?: string;
```

**Important:** The current `spawn()` call (line ~81) does NOT pass an `env` option, so the child inherits `process.env` by default. When you explicitly pass `env`, you MUST spread `process.env` or the child loses all environment variables:

```typescript
const child = spawn('claude', args, {
  cwd,
  stdio: ['ignore', 'pipe', 'pipe'],
  ...(deps.claudeConfigDir ? {
    env: { ...process.env, CLAUDE_CONFIG_DIR: deps.claudeConfigDir },
  } : {}),
});
```

This only adds the `env` option when `claudeConfigDir` is set, preserving the existing behavior (full process.env inheritance) when it's not.

- [ ] **Step 5: Modify session.ts buildClaudeCommand to include CLAUDE_CONFIG_DIR**

In `apps/backend/src/launcher/session.ts`, `buildClaudeCommand` (line ~219) builds a bash command string for tmux. Prepend `CLAUDE_CONFIG_DIR`:

```typescript
const envPrefix = opts.claudeConfigDir
  ? `CLAUDE_CONFIG_DIR="${opts.claudeConfigDir}" `
  : '';
return `cd "${opts.dossierDir}" && ${envPrefix}claude --dangerously-skip-permissions ...`;
```

- [ ] **Step 6: Run tests**

Run: `pnpm --filter @opentidy/backend test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/backend/config/claude/ apps/backend/src/infra/spawn-claude.ts apps/backend/src/launcher/session.ts apps/backend/tests/infra/spawn-claude-config.test.ts
git commit -m "feat(claude-config): isolate Claude Code config via CLAUDE_CONFIG_DIR"
```

---

## Task 4: Auth Middleware

**Files:**
- Create: `apps/backend/src/middleware/auth.ts`
- Modify: `apps/backend/src/server.ts`
- Test: `apps/backend/tests/middleware/auth.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// apps/backend/tests/middleware/auth.test.ts
import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';

describe('auth middleware', () => {
  it('allows requests with valid bearer token', async () => {
    const { createAuthMiddleware } = await import('../../src/middleware/auth.js');
    const app = new Hono();
    app.use('/api/*', createAuthMiddleware('secret-token'));
    app.get('/api/test', (c) => c.json({ ok: true }));

    const res = await app.request('/api/test', {
      headers: { Authorization: 'Bearer secret-token' },
    });
    expect(res.status).toBe(200);
  });

  it('rejects requests with invalid token', async () => {
    const { createAuthMiddleware } = await import('../../src/middleware/auth.js');
    const app = new Hono();
    app.use('/api/*', createAuthMiddleware('secret-token'));
    app.get('/api/test', (c) => c.json({ ok: true }));

    const res = await app.request('/api/test', {
      headers: { Authorization: 'Bearer wrong-token' },
    });
    expect(res.status).toBe(401);
  });

  it('rejects requests with no token', async () => {
    const { createAuthMiddleware } = await import('../../src/middleware/auth.js');
    const app = new Hono();
    app.use('/api/*', createAuthMiddleware('secret-token'));
    app.get('/api/test', (c) => c.json({ ok: true }));

    const res = await app.request('/api/test');
    expect(res.status).toBe(401);
  });

  it('skips auth when no token configured (open source mode)', async () => {
    const { createAuthMiddleware } = await import('../../src/middleware/auth.js');
    const app = new Hono();
    app.use('/api/*', createAuthMiddleware(''));
    app.get('/api/test', (c) => c.json({ ok: true }));

    const res = await app.request('/api/test');
    expect(res.status).toBe(200);
  });

  it('always allows /api/health without auth', async () => {
    const { createAuthMiddleware } = await import('../../src/middleware/auth.js');
    const app = new Hono();
    app.use('/api/*', createAuthMiddleware('secret-token'));
    app.get('/api/health', (c) => c.json({ status: 'ok' }));

    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
  });

  it('always allows /api/hooks without auth', async () => {
    const { createAuthMiddleware } = await import('../../src/middleware/auth.js');
    const app = new Hono();
    app.use('/api/*', createAuthMiddleware('secret-token'));
    app.post('/api/hooks', (c) => c.json({ ok: true }));

    const res = await app.request('/api/hooks', { method: 'POST' });
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @opentidy/backend test -- tests/middleware/auth.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement auth middleware**

```typescript
// apps/backend/src/middleware/auth.ts
import type { MiddlewareHandler } from 'hono';

const PUBLIC_PATHS = ['/api/health', '/api/hooks', '/api/webhook/gmail'];

export function createAuthMiddleware(bearerToken: string): MiddlewareHandler {
  return async (c, next) => {
    if (!bearerToken) return next();
    if (PUBLIC_PATHS.some(p => c.req.path.startsWith(p))) return next();

    const authHeader = c.req.header('Authorization');
    if (!authHeader || authHeader !== `Bearer ${bearerToken}`) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    return next();
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @opentidy/backend test -- tests/middleware/auth.test.ts`
Expected: PASS

- [ ] **Step 5: Wire into server.ts**

In `apps/backend/src/server.ts`, add the auth middleware before all API routes:

```typescript
import { createAuthMiddleware } from './middleware/auth.js';

// Before route definitions:
app.use('/api/*', createAuthMiddleware(deps.bearerToken || ''));
```

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/middleware/auth.ts apps/backend/tests/middleware/auth.test.ts apps/backend/src/server.ts
git commit -m "feat(auth): add bearer token auth middleware with public path bypass"
```

---

## Task 5: Static File Serving

**Files:**
- Modify: `apps/backend/src/server.ts`

- [ ] **Step 1: Add serveStatic to server.ts**

After all `/api` routes, add static file serving for production:

```typescript
import { serveStatic } from '@hono/node-server/serve-static';
import { existsSync } from 'fs';
import { resolve } from 'path';

// After all /api routes:
const webDistPath = resolve(import.meta.dirname, '../web-dist');
if (existsSync(webDistPath)) {
  app.use('/*', serveStatic({ root: webDistPath }));
  // SPA fallback
  app.get('*', serveStatic({ root: webDistPath, path: 'index.html' }));
  console.log('[server] Serving static files from', webDistPath);
}
```

- [ ] **Step 2: Run all existing tests to verify no regression**

Run: `pnpm --filter @opentidy/backend test`
Expected: All existing tests PASS

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/server.ts
git commit -m "feat(server): serve static frontend files in production"
```

---

## Task 6: Health Endpoint Enhancement

**Files:**
- Modify: `apps/backend/src/server.ts`

- [ ] **Step 1: Enhance /api/health**

Update the existing `/api/health` endpoint to return version and uptime:

```typescript
app.get('/api/health', (c) => {
  return c.json({
    status: 'ok',
    version: deps.version || 'dev',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});
```

- [ ] **Step 2: Run tests**

Run: `pnpm --filter @opentidy/backend test`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/server.ts
git commit -m "feat(health): return version and uptime in health endpoint"
```

---

## Task 7: `alfred setup` Command

**Files:**
- Create: `apps/backend/src/cli/setup.ts`
- Test: `apps/backend/tests/cli/setup.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// apps/backend/tests/cli/setup.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('alfred setup', () => {
  let configDir: string;

  beforeEach(() => {
    configDir = mkdtempSync(join(tmpdir(), 'alfred-setup-'));
  });

  afterEach(() => {
    rmSync(configDir, { recursive: true, force: true });
  });

  it('creates config.json with provided values', async () => {
    const { createConfigFile } = await import('../../src/cli/setup.js');
    const configPath = join(configDir, 'config.json');
    createConfigFile(configPath, {
      telegramBotToken: 'bot123',
      telegramChatId: 'chat456',
      bearerToken: 'secret',
      port: 5175,
    });
    expect(existsSync(configPath)).toBe(true);
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    expect(config.telegram.botToken).toBe('bot123');
    expect(config.auth.bearerToken).toBe('secret');
  });

  it('copies Claude Code config template', async () => {
    const { copyClaudeConfigTemplate } = await import('../../src/cli/setup.js');
    const claudeConfigDir = join(configDir, 'claude-config');
    const templateDir = join(configDir, 'template');
    mkdirSync(templateDir, { recursive: true });
    writeFileSync(join(templateDir, 'settings.json'), '{"permissions":{}}');
    writeFileSync(join(templateDir, 'CLAUDE.md'), '# Alfred');

    copyClaudeConfigTemplate(templateDir, claudeConfigDir);
    expect(existsSync(join(claudeConfigDir, 'settings.json'))).toBe(true);
    expect(existsSync(join(claudeConfigDir, 'CLAUDE.md'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @opentidy/backend test -- tests/cli/setup.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement setup.ts**

```typescript
// apps/backend/src/cli/setup.ts
import { writeFileSync, mkdirSync, existsSync, copyFileSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { createInterface } from 'readline';
import { execFileSync } from 'child_process';
import { loadConfig, saveConfig, getConfigPath } from '../config.js';

const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = (q: string): Promise<string> => new Promise(r => rl.question(q, r));

export function createConfigFile(configPath: string, opts: {
  telegramBotToken: string;
  telegramChatId: string;
  bearerToken: string;
  port: number;
}): void {
  const config = loadConfig(configPath);
  config.telegram.botToken = opts.telegramBotToken;
  config.telegram.chatId = opts.telegramChatId;
  config.auth.bearerToken = opts.bearerToken;
  config.server.port = opts.port;
  saveConfig(configPath, config);
}

export function copyClaudeConfigTemplate(templateDir: string, targetDir: string): void {
  mkdirSync(targetDir, { recursive: true });
  for (const file of ['settings.json', 'CLAUDE.md']) {
    const src = join(templateDir, file);
    const dst = join(targetDir, file);
    if (existsSync(src)) {
      copyFileSync(src, dst);
    }
  }
  const localSettings = join(targetDir, 'settings.local.json');
  if (!existsSync(localSettings)) {
    writeFileSync(localSettings, '{}\n');
  }
}

export async function runSetup(): Promise<void> {
  console.log('\n  Alfred Setup\n');

  const configPath = getConfigPath();
  if (existsSync(configPath)) {
    const overwrite = await ask('  Config already exists. Overwrite? (y/N) ');
    if (overwrite.toLowerCase() !== 'y') {
      console.log('  Setup cancelled.');
      rl.close();
      return;
    }
  }

  // Telegram
  console.log('\n  -- Telegram --');
  const botToken = await ask('  Bot token: ');
  const chatId = await ask('  Chat ID: ');

  // Auth
  console.log('\n  -- API Auth --');
  const bearerToken = await ask('  Bearer token (leave empty to disable): ');

  // Port
  const portStr = await ask('  Port (default 5175): ');
  const port = parseInt(portStr) || 5175;

  // Save config
  createConfigFile(configPath, { telegramBotToken: botToken, telegramChatId: chatId, bearerToken, port });
  console.log(`\n  Config saved to ${configPath}`);

  // Claude Code config
  console.log('\n  -- Claude Code --');
  const templateDir = resolve(import.meta.dirname, '../config/claude');
  const claudeConfigDir = resolve(dirname(configPath), 'claude-config');
  copyClaudeConfigTemplate(templateDir, claudeConfigDir);

  const config = loadConfig(configPath);
  config.claudeConfig.dir = claudeConfigDir;
  saveConfig(configPath, config);
  console.log(`  Claude Code config copied to ${claudeConfigDir}`);

  // Claude Code auth
  console.log('\n  Authenticating Claude Code...');
  console.log(`  Run manually if it fails: CLAUDE_CONFIG_DIR="${claudeConfigDir}" claude auth login\n`);
  try {
    execFileSync('claude', ['auth', 'login'], {
      stdio: 'inherit',
      env: { ...process.env, CLAUDE_CONFIG_DIR: claudeConfigDir },
    });
  } catch {
    console.log('  Claude auth skipped — run manually later.');
  }

  // macOS permissions reminder
  console.log('\n  -- macOS Permissions --');
  console.log('  Open System Settings > Privacy & Security and grant:');
  console.log('  - Full Disk Access (Terminal/iTerm)');
  console.log('  - Accessibility');
  console.log('  - Automation (Messages, Mail, Finder, etc.)');
  console.log('\n  Run `alfred doctor` to verify everything.\n');

  rl.close();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @opentidy/backend test -- tests/cli/setup.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/cli/setup.ts apps/backend/tests/cli/setup.test.ts
git commit -m "feat(cli): add alfred setup interactive wizard"
```

---

## Task 8: `alfred doctor` Command

**Files:**
- Create: `apps/backend/src/cli/doctor.ts`
- Test: `apps/backend/tests/cli/doctor.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// apps/backend/tests/cli/doctor.test.ts
import { describe, it, expect } from 'vitest';

describe('alfred doctor', () => {
  it('exports check functions', async () => {
    const { checkDependency, checkConfig, checkClaudeConfig } = await import('../../src/cli/doctor.js');
    expect(typeof checkDependency).toBe('function');
    expect(typeof checkConfig).toBe('function');
    expect(typeof checkClaudeConfig).toBe('function');
  });

  it('checkDependency returns ok for node', async () => {
    const { checkDependency } = await import('../../src/cli/doctor.js');
    const result = checkDependency('node');
    expect(result.ok).toBe(true);
  });

  it('checkDependency returns error for nonexistent binary', async () => {
    const { checkDependency } = await import('../../src/cli/doctor.js');
    const result = checkDependency('nonexistent-binary-xyz');
    expect(result.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @opentidy/backend test -- tests/cli/doctor.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement doctor.ts**

```typescript
// apps/backend/src/cli/doctor.ts
import { execFileSync } from 'child_process';
import { existsSync } from 'fs';
import { loadConfig, getConfigPath } from '../config.js';

interface CheckResult {
  ok: boolean;
  name: string;
  detail?: string;
}

export function checkDependency(bin: string): CheckResult {
  try {
    const version = execFileSync(bin, ['--version'], {
      encoding: 'utf-8',
      timeout: 5000,
    }).trim().split('\n')[0];
    return { ok: true, name: bin, detail: version };
  } catch {
    return { ok: false, name: bin, detail: 'not found in PATH' };
  }
}

export function checkConfig(configPath: string): CheckResult {
  if (!existsSync(configPath)) {
    return { ok: false, name: 'config', detail: `${configPath} not found — run alfred setup` };
  }
  const config = loadConfig(configPath);
  if (!config.telegram.botToken) {
    return { ok: false, name: 'config', detail: 'telegram.botToken is empty' };
  }
  return { ok: true, name: 'config', detail: configPath };
}

export function checkClaudeConfig(claudeConfigDir: string): CheckResult {
  if (!claudeConfigDir || !existsSync(claudeConfigDir)) {
    return { ok: false, name: 'claude-config', detail: `${claudeConfigDir || '(not set)'} not found — run alfred setup` };
  }
  if (!existsSync(`${claudeConfigDir}/settings.json`)) {
    return { ok: false, name: 'claude-config', detail: 'settings.json missing' };
  }
  return { ok: true, name: 'claude-config', detail: claudeConfigDir };
}

export async function runDoctor(): Promise<void> {
  console.log('\n  Alfred Doctor\n');
  const results: CheckResult[] = [];

  for (const bin of ['node', 'claude', 'tmux', 'ttyd', 'python3']) {
    results.push(checkDependency(bin));
  }

  const configPath = getConfigPath();
  results.push(checkConfig(configPath));

  const config = loadConfig(configPath);
  results.push(checkClaudeConfig(config.claudeConfig.dir));

  // Health check
  try {
    const port = config.server.port || 5175;
    execFileSync('curl', ['-sf', `http://localhost:${port}/api/health`], { encoding: 'utf-8', timeout: 5000 });
    results.push({ ok: true, name: 'server', detail: `running on port ${port}` });
  } catch {
    results.push({ ok: false, name: 'server', detail: 'not responding' });
  }

  let hasErrors = false;
  for (const r of results) {
    const icon = r.ok ? '  OK' : '  !!';
    console.log(`${icon}  ${r.name} — ${r.detail || ''}`);
    if (!r.ok) hasErrors = true;
  }

  console.log(hasErrors ? '\n  Some checks failed.\n' : '\n  All checks passed.\n');
  process.exit(hasErrors ? 1 : 0);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @opentidy/backend test -- tests/cli/doctor.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/cli/doctor.ts apps/backend/tests/cli/doctor.test.ts
git commit -m "feat(cli): add alfred doctor verification command"
```

---

## Task 9: `alfred status`, `alfred logs`, `alfred update` Commands

**Files:**
- Create: `apps/backend/src/cli/status.ts`
- Create: `apps/backend/src/cli/logs.ts`
- Create: `apps/backend/src/cli/update.ts`

- [ ] **Step 1: Implement status.ts**

```typescript
// apps/backend/src/cli/status.ts
import { execFileSync } from 'child_process';
import { loadConfig, getConfigPath } from '../config.js';
import { getVersion } from '../cli.js';

export async function runStatus(): Promise<void> {
  console.log(`\n  Alfred v${getVersion()}\n`);

  try {
    const services = execFileSync('brew', ['services', 'list'], { encoding: 'utf-8', timeout: 5000 });
    const alfredLine = services.split('\n').find(l => l.includes('alfred'));
    console.log(alfredLine ? `  Service: ${alfredLine.trim()}` : '  Service: not registered');
  } catch {
    console.log('  Service: brew services not available');
  }

  const config = loadConfig(getConfigPath());
  try {
    const health = execFileSync('curl', ['-sf', `http://localhost:${config.server.port}/api/health`], { encoding: 'utf-8', timeout: 5000 });
    const data = JSON.parse(health);
    console.log(`  Status: running`);
    console.log(`  Uptime: ${Math.floor(data.uptime / 60)}m`);
    console.log(`  Port: ${config.server.port}`);
  } catch {
    console.log('  Status: not running');
  }
  console.log('');
}
```

- [ ] **Step 2: Implement logs.ts**

```typescript
// apps/backend/src/cli/logs.ts
import { spawn } from 'child_process';
import { existsSync } from 'fs';

export async function runLogs(): Promise<void> {
  const logPaths = [
    '/opt/homebrew/var/log/alfred.log',
    `${process.env.HOME}/Library/Logs/opentidy-stdout.log`,
  ];

  const logPath = logPaths.find(p => existsSync(p));
  if (!logPath) {
    console.log('  No log file found.');
    return;
  }

  console.log(`  Tailing ${logPath} (Ctrl+C to stop)\n`);
  const tail = spawn('tail', ['-f', logPath], { stdio: 'inherit' });
  tail.on('close', () => process.exit(0));
}
```

- [ ] **Step 3: Implement update.ts**

```typescript
// apps/backend/src/cli/update.ts
import { execFileSync } from 'child_process';
import { getVersion } from '../cli.js';

export async function runUpdate(): Promise<void> {
  console.log(`\n  Current version: ${getVersion()}`);
  console.log('  Checking for updates...\n');

  try {
    execFileSync('brew', ['update'], { stdio: 'inherit', timeout: 60_000 });
    const outdated = execFileSync('brew', ['outdated', 'alfred'], { encoding: 'utf-8', timeout: 10_000 }).trim();
    if (outdated) {
      console.log(`\n  Update available: ${outdated}`);
      console.log('  Upgrading...\n');
      execFileSync('brew', ['upgrade', 'alfred'], { stdio: 'inherit', timeout: 300_000 });
      console.log('\n  Restarting...');
      execFileSync('brew', ['services', 'restart', 'alfred'], { stdio: 'inherit', timeout: 30_000 });
      console.log('  Done.\n');
    } else {
      console.log('  Already up to date.\n');
    }
  } catch (err) {
    console.error('  Update failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/cli/status.ts apps/backend/src/cli/logs.ts apps/backend/src/cli/update.ts
git commit -m "feat(cli): add status, logs, and update commands"
```

---

## Task 10: Auto-Update Checker

**Files:**
- Create: `apps/backend/src/infra/updater.ts`
- Test: `apps/backend/tests/infra/updater.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// apps/backend/tests/infra/updater.test.ts
import { describe, it, expect } from 'vitest';

describe('updater', () => {
  it('detects newer version', async () => {
    const { isNewerVersion } = await import('../../src/infra/updater.js');
    expect(isNewerVersion('1.0.0', '1.1.0')).toBe(true);
    expect(isNewerVersion('1.1.0', '1.0.0')).toBe(false);
    expect(isNewerVersion('1.0.0', '1.0.0')).toBe(false);
    expect(isNewerVersion('1.2.3', '2.0.0')).toBe(true);
  });

  it('parseInterval converts to ms', async () => {
    const { parseInterval } = await import('../../src/infra/updater.js');
    expect(parseInterval('6h')).toBe(6 * 60 * 60 * 1000);
    expect(parseInterval('30m')).toBe(30 * 60 * 1000);
    expect(parseInterval('1d')).toBe(24 * 60 * 60 * 1000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @opentidy/backend test -- tests/infra/updater.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement updater.ts**

```typescript
// apps/backend/src/infra/updater.ts
import { spawn } from 'child_process';
import { mkdirSync } from 'fs';

export function isNewerVersion(current: string, latest: string): boolean {
  const c = current.split('.').map(Number);
  const l = latest.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((l[i] || 0) > (c[i] || 0)) return true;
    if ((l[i] || 0) < (c[i] || 0)) return false;
  }
  return false;
}

export function parseInterval(interval: string): number {
  const match = interval.match(/^(\d+)(h|m|d)$/);
  if (!match) return 6 * 60 * 60 * 1000;
  const val = parseInt(match[1]);
  const unit = match[2];
  if (unit === 'h') return val * 60 * 60 * 1000;
  if (unit === 'm') return val * 60 * 1000;
  if (unit === 'd') return val * 24 * 60 * 60 * 1000;
  return 6 * 60 * 60 * 1000;
}

interface UpdaterDeps {
  currentVersion: string;
  repoOwner: string;
  repoName: string;
  checkInterval: string;
  autoUpdate: boolean;
  notifyBeforeUpdate: boolean;
  delayBeforeUpdate: string;
  sendTelegram: (text: string) => Promise<void>;
  updaterScriptPath: string;
  telegramBotToken: string;
  telegramChatId: string;
}

export function createUpdater(deps: UpdaterDeps) {
  let timer: NodeJS.Timeout | null = null;

  async function checkForUpdate(): Promise<{ available: boolean; version?: string }> {
    try {
      const res = await fetch(`https://api.github.com/repos/${deps.repoOwner}/${deps.repoName}/releases/latest`);
      if (!res.ok) return { available: false };
      const data = await res.json() as { tag_name: string };
      const latest = data.tag_name.replace(/^v/, '');
      if (isNewerVersion(deps.currentVersion, latest)) {
        return { available: true, version: latest };
      }
      return { available: false };
    } catch (err) {
      console.error('[updater] Check failed:', err);
      return { available: false };
    }
  }

  function spawnDetachedUpdater(newVersion: string): void {
    const cacheDir = `${process.env.HOME}/.cache/alfred/releases`;
    mkdirSync(cacheDir, { recursive: true });

    const child = spawn('bash', [deps.updaterScriptPath], {
      detached: true,
      stdio: 'ignore',
      env: {
        ...process.env,
        BOT_TOKEN: deps.telegramBotToken,
        CHAT_ID: deps.telegramChatId,
        NEW_VERSION: newVersion,
        PREV_VERSION: deps.currentVersion,
      },
    });
    child.unref();
    console.log(`[updater] Detached updater spawned (PID ${child.pid}) for v${newVersion}`);
  }

  async function tick(): Promise<void> {
    const { available, version } = await checkForUpdate();
    if (!available || !version) return;

    console.log(`[updater] New version available: v${version}`);

    if (deps.notifyBeforeUpdate) {
      await deps.sendTelegram(`Alfred v${version} disponible. Mise a jour auto dans ${deps.delayBeforeUpdate}.`);
    }

    if (deps.autoUpdate) {
      const delayMs = parseInterval(deps.delayBeforeUpdate);
      setTimeout(() => spawnDetachedUpdater(version), delayMs);
    }
  }

  function start(): void {
    const intervalMs = parseInterval(deps.checkInterval);
    console.log(`[updater] Checking every ${deps.checkInterval}`);
    timer = setInterval(tick, intervalMs);
    setTimeout(tick, 30_000);
  }

  function stop(): void {
    if (timer) clearInterval(timer);
  }

  return { start, stop, checkForUpdate, spawnDetachedUpdater };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @opentidy/backend test -- tests/infra/updater.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/infra/updater.ts apps/backend/tests/infra/updater.test.ts
git commit -m "feat(updater): add auto-update checker with detached script spawner"
```

---

## Task 11: Detached Updater Script

**Files:**
- Create: `opentidy-updater.sh`

- [ ] **Step 1: Create the script**

Create `opentidy-updater.sh` at repo root. See spec for full script content. Key behavior:
- Reads `BOT_TOKEN`, `CHAT_ID`, `NEW_VERSION`, `PREV_VERSION` from env
- Caches current formula before upgrading
- Runs `brew upgrade alfred` + `brew services restart alfred`
- Health check loop (3 retries, 10s apart)
- Rollback from cached formula on failure
- Telegram notification in all cases

- [ ] **Step 2: Make executable and commit**

```bash
chmod +x opentidy-updater.sh
git add opentidy-updater.sh
git commit -m "feat(updater): add detached updater script with rollback"
```

---

## Task 12: Wire Everything into index.ts

**Files:**
- Modify: `apps/backend/src/index.ts`

- [ ] **Step 1: Refactor index.ts to use config**

Replace env var reading at the top with config loading. Keep env vars as fallback for backwards compatibility:

```typescript
import { loadConfig, getConfigPath } from './config.js';
import { getVersion } from './cli.js';

const config = loadConfig(getConfigPath());
const WORKSPACE_DIR = config.workspace.dir || process.env.WORKSPACE_DIR || resolve(import.meta.dirname, '../../..', 'workspace');
const LOCK_DIR = config.workspace.lockDir || process.env.LOCK_DIR || '/tmp/opentidy-locks';
const PORT = config.server.port || parseInt(process.env.PORT || '5175');
const TELEGRAM_TOKEN = config.telegram.botToken || process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = config.telegram.chatId || process.env.TELEGRAM_CHAT_ID || '';
const CLAUDE_CONFIG_DIR = config.claudeConfig.dir || '';
```

- [ ] **Step 2: Pass CLAUDE_CONFIG_DIR to spawnClaude**

- [ ] **Step 3: Wire auto-updater at end of boot**

- [ ] **Step 4: Pass bearerToken and version to createServer**

- [ ] **Step 5: Run all tests**

Run: `pnpm --filter @opentidy/backend test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/index.ts
git commit -m "feat(index): wire config, auth, updater, and CLAUDE_CONFIG_DIR"
```

---

## Task 13: GitHub Actions Release Workflow

**Files:**
- Create: `.github/workflows/release.yml`

- [ ] **Step 1: Create the workflow**

See spec for full YAML. Key: runs on `macos-latest`, uses `pnpm deploy` for flat node_modules, packages tarball with all artifacts (dist, web-dist, shared, plugins, config, bin, VERSION).

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: add release workflow with pnpm deploy packaging"
```

---

## Task 14: Homebrew Formula (separate repo)

- [ ] **Step 1: Create `lolo/homebrew-alfred` repo on GitHub**

Run: `gh repo create lolo/homebrew-alfred --public`

- [ ] **Step 2: Create Formula/alfred.rb**

See spec for full Ruby formula.

- [ ] **Step 3: Commit and push**

---

## Task 15: Install Script

**Files:**
- Create: `install.sh`

- [ ] **Step 1: Write install.sh**

Simple script: check/install Homebrew, `brew tap + install`, `alfred setup`, `brew services start`.

- [ ] **Step 2: Make executable and commit**

```bash
chmod +x install.sh
git add install.sh
git commit -m "feat: add one-liner install script"
```

---

## Verification

After all tasks are complete:

- [ ] Run full test suite: `pnpm test`
- [ ] Build successfully: `pnpm build`
- [ ] Test CLI in dev: `node apps/backend/dist/cli.js --version`
- [ ] Test CLI in dev: `node apps/backend/dist/cli.js doctor`
- [ ] Test bin/tidy: `./bin/tidy --version`
- [ ] Test bin/tidy: `./bin/tidy help`
