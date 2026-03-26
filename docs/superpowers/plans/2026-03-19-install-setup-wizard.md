# Install & Setup Wizard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a zero-friction install-to-wizard flow: one terminal line installs deps + starts service + opens browser. UI wizard collects user info, connects an agent via embedded terminal, and grants macOS permissions.

**Architecture:** 3 layers — (1) shared types for `setupComplete` and `SetupStatus`, (2) backend setup API + WebSocket PTY endpoint, (3) frontend TerminalDrawer component + full-screen SetupWizard. The install script is simplified to be silent and auto-start.

**Tech Stack:** TypeScript, Hono (backend), React 19 + React Router v7 (frontend), xterm.js + @xterm/addon-fit (terminal), node-pty (backend PTY), Zod (validation), Vitest (tests), Playwright (E2E)

**Spec:** `docs/superpowers/specs/2026-03-19-install-setup-design.md`

**Related plan (Phase 3):** Settings unification + service cards will be a separate plan.

---

## File Structure

### New files

```
packages/shared/src/
  types.ts                          # MODIFY — add setupComplete, SetupStatus

apps/backend/src/
  features/setup/
    status.ts                       # GET /api/setup/status — aggregated setup status
    status.test.ts                  # tests
    user-info.ts                    # POST /api/setup/user-info
    user-info.test.ts               # tests
    agents.ts                       # GET/POST /api/setup/agents — install + auth
    agents.test.ts                  # tests
    permissions.ts                  # GET/POST /api/setup/permissions
    permissions.test.ts             # tests
    complete.ts                     # POST /api/setup/complete — mark setupComplete
    complete.test.ts                # tests
  terminal/
    pty.ts                          # WebSocket PTY endpoint
    pty.test.ts                     # tests

apps/web/src/
  shared/
    TerminalDrawer.tsx              # Reusable bottom drawer with xterm.js
    TerminalDrawer.test.tsx         # tests
  features/setup/
    SetupWizard.tsx                 # Full-screen 4-step wizard
    SetupWizard.test.tsx            # tests
    UserInfoStep.tsx                # Step 1 — name + language
    AgentStep.tsx                   # Step 2 — agent cards + terminal drawer
    PermissionsStep.tsx             # Step 3 — permission cards
    DoneStep.tsx                    # Step 4 — success + CTAs
```

### Modified files

```
packages/shared/src/types.ts       # Add setupComplete, SetupStatus
packages/shared/src/schemas.ts     # Add SetupUserInfoSchema
apps/backend/src/server.ts         # Mount setup routes + PTY WebSocket
apps/backend/src/index.ts          # Pass configPath to AppDeps, skip boot if not setupComplete
apps/backend/package.json          # Add node-pty, @hono/node-ws
apps/web/src/App.tsx               # Add /setup route + redirect guard
apps/web/package.json              # Add xterm + @xterm/addon-fit + @xterm/addon-web-links
apps/web/src/main.tsx              # Import xterm CSS
apps/web/src/shared/i18n/locales/en.json  # Setup wizard strings
apps/web/src/shared/i18n/locales/fr.json  # Setup wizard strings (French)
install.sh                         # Simplify: silent, auto-start, open browser
apps/backend/src/cli/setup.ts      # Redirect to browser when server is running
```

---

### Task 1: Shared Types and Schemas

**Files:**
- Modify: `packages/shared/src/types.ts`
- Modify: `packages/shared/src/schemas.ts`
- Modify: `packages/shared/tests/schemas.test.ts`

- [ ] **Step 1: Write the test for SetupUserInfoSchema**

In `packages/shared/tests/schemas.test.ts`, add:

```typescript
import { SetupUserInfoSchema } from '../src/schemas.js';

describe('SetupUserInfoSchema', () => {
  it('accepts valid user info with name and language', () => {
    const result = SetupUserInfoSchema.safeParse({ name: 'Alice', language: 'en' });
    expect(result.success).toBe(true);
  });

  it('rejects empty name', () => {
    const result = SetupUserInfoSchema.safeParse({ name: '', language: 'en' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid language', () => {
    const result = SetupUserInfoSchema.safeParse({ name: 'Alice', language: 'de' });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/lolo/Documents/opentidy && pnpm --filter @opentidy/shared test -- --run`
Expected: FAIL — `SetupUserInfoSchema` not found

- [ ] **Step 3: Add types to `packages/shared/src/types.ts`**

After the `OpenTidyConfig` interface (~line 356), add:

```typescript
// === Setup Status (for /api/setup/status) ===
export interface SetupStatus {
  setupComplete: boolean;
  userInfo: { done: boolean };
  agents: { done: boolean; connected: string[]; active: string | null };
  permissions: { done: boolean; granted: string[]; missing: string[] };
  services: Record<string, {
    status: 'connected' | 'error' | 'not_configured';
    error?: string;
  }>;
}
```

Add `setupComplete` to `OpenTidyConfig` (inside the interface, after `github?`):

```typescript
  setupComplete?: boolean;  // set to true after Phase 2 wizard completion
```

- [ ] **Step 4: Add schemas to `packages/shared/src/schemas.ts`**

```typescript
export const SetupUserInfoSchema = z.object({
  name: z.string().min(1),
  language: z.enum(['en', 'fr']),
});
```

Export from `packages/shared/src/index.ts`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd /Users/lolo/Documents/opentidy && pnpm --filter @opentidy/shared test -- --run`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/types.ts packages/shared/src/schemas.ts packages/shared/src/index.ts packages/shared/tests/schemas.test.ts
git commit -m "feat(shared): add setupComplete config field and SetupStatus types"
```

---

### Task 2: Setup Status API

**Files:**
- Create: `apps/backend/src/features/setup/status.ts`
- Create: `apps/backend/src/features/setup/status.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/backend/src/features/setup/status.test.ts`:

```typescript
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import { setupStatusRoute, type SetupDeps } from './status.js';

function makeDeps(overrides: Partial<SetupDeps> = {}): SetupDeps {
  return {
    loadConfig: () => ({
      version: 2,
      userInfo: { name: '', email: '', company: '' },
      agentConfig: { name: 'claude' as const, configDir: '' },
      language: 'en',
      mcp: {
        curated: {
          gmail: { enabled: false, configured: false },
          camoufox: { enabled: false, configured: false },
          whatsapp: { enabled: false, configured: false, wacliPath: '', mcpServerPath: '' },
        },
        marketplace: {},
      },
      telegram: { botToken: '', chatId: '' },
      auth: { bearerToken: '' },
      server: { port: 5175, appBaseUrl: '' },
      workspace: { dir: '', lockDir: '' },
      update: { autoUpdate: true, checkInterval: '6h', notifyBeforeUpdate: true, delayBeforeUpdate: '5m', keepReleases: 3 },
      skills: { curated: {}, user: [] },
      receivers: [],
    }),
    checkAgentInstalled: () => false,
    checkAgentAuth: () => false,
    ...overrides,
  };
}

describe('GET /setup/status', () => {
  it('returns not-complete status for fresh config', async () => {
    const app = new Hono();
    app.route('/api', setupStatusRoute(makeDeps()));

    const res = await app.request('/api/setup/status');
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.setupComplete).toBe(false);
    expect(body.userInfo.done).toBe(false);
    expect(body.agents.done).toBe(false);
    expect(body.agents.connected).toEqual([]);
  });

  it('returns done when config has name and agent', async () => {
    const deps = makeDeps({
      loadConfig: () => ({
        ...makeDeps().loadConfig(),
        setupComplete: true,
        userInfo: { name: 'Alice', email: '', company: '' },
        agentConfig: { name: 'claude' as const, configDir: '/tmp/claude' },
      }),
      checkAgentInstalled: () => true,
      checkAgentAuth: () => true,
    });
    const app = new Hono();
    app.route('/api', setupStatusRoute(deps));

    const res = await app.request('/api/setup/status');
    const body = await res.json();
    expect(body.setupComplete).toBe(true);
    expect(body.userInfo.done).toBe(true);
    expect(body.agents.done).toBe(true);
    expect(body.agents.connected).toContain('claude');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/lolo/Documents/opentidy && pnpm --filter @opentidy/backend test -- --run apps/backend/src/features/setup/status.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `status.ts`**

`apps/backend/src/features/setup/status.ts`:

```typescript
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { Hono } from 'hono';
import type { OpenTidyConfig, SetupStatus, AgentName } from '@opentidy/shared';

const KNOWN_AGENTS: AgentName[] = ['claude', 'gemini', 'copilot'];

export interface SetupDeps {
  loadConfig: () => OpenTidyConfig;
  checkAgentInstalled: (agent: AgentName) => boolean;
  checkAgentAuth: (agent: AgentName) => boolean;
}

export function setupStatusRoute(deps: SetupDeps) {
  const app = new Hono();

  app.get('/setup/status', (c) => {
    const config = deps.loadConfig();

    const connected = KNOWN_AGENTS.filter(
      (a) => deps.checkAgentInstalled(a) && deps.checkAgentAuth(a),
    );

    const status: SetupStatus = {
      setupComplete: config.setupComplete ?? false,
      userInfo: { done: !!config.userInfo?.name },
      agents: {
        done: connected.length > 0,
        connected,
        active: config.agentConfig?.name ?? null,
      },
      permissions: {
        done: true, // Permissions are all optional — never blocks setup
        granted: [],
        missing: [],
      },
      services: {
        telegram: {
          status: config.telegram?.botToken ? 'connected' : 'not_configured',
        },
        gmail: {
          status: config.mcp?.curated?.gmail?.configured ? 'connected' : 'not_configured',
        },
        whatsapp: {
          status: config.mcp?.curated?.whatsapp?.configured ? 'connected' : 'not_configured',
        },
        camoufox: {
          status: config.mcp?.curated?.camoufox?.configured ? 'connected' : 'not_configured',
        },
      },
    };

    return c.json(status);
  });

  return app;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/lolo/Documents/opentidy && pnpm --filter @opentidy/backend test -- --run apps/backend/src/features/setup/status.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/features/setup/
git commit -m "feat(backend): add GET /api/setup/status endpoint"
```

---

### Task 3: User Info API

**Files:**
- Create: `apps/backend/src/features/setup/user-info.ts`
- Create: `apps/backend/src/features/setup/user-info.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/backend/src/features/setup/user-info.test.ts`:

```typescript
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import { setupUserInfoRoute } from './user-info.js';

describe('POST /setup/user-info', () => {
  it('saves name and language to config', async () => {
    let saved: any = null;
    const deps = {
      loadConfig: () => ({ userInfo: { name: '', email: '', company: '' }, language: 'en' }),
      saveConfig: vi.fn((config: any) => { saved = config; }),
    };

    const app = new Hono();
    app.route('/api', setupUserInfoRoute(deps));

    const res = await app.request('/api/setup/user-info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Alice', language: 'fr' }),
    });

    expect(res.status).toBe(200);
    expect(deps.saveConfig).toHaveBeenCalled();
    expect(saved.userInfo.name).toBe('Alice');
    expect(saved.language).toBe('fr');
  });

  it('rejects empty name with 400', async () => {
    const deps = {
      loadConfig: () => ({ userInfo: { name: '', email: '', company: '' }, language: 'en' }),
      saveConfig: vi.fn(),
    };

    const app = new Hono();
    app.route('/api', setupUserInfoRoute(deps));

    const res = await app.request('/api/setup/user-info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '', language: 'en' }),
    });

    expect(res.status).toBe(400);
    expect(deps.saveConfig).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/lolo/Documents/opentidy && pnpm --filter @opentidy/backend test -- --run apps/backend/src/features/setup/user-info.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement `user-info.ts`**

`apps/backend/src/features/setup/user-info.ts`:

```typescript
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { Hono } from 'hono';
import { SetupUserInfoSchema } from '@opentidy/shared';
import type { OpenTidyConfig } from '@opentidy/shared';

export interface UserInfoDeps {
  loadConfig: () => OpenTidyConfig;
  saveConfig: (config: OpenTidyConfig) => void;
}

export function setupUserInfoRoute(deps: UserInfoDeps) {
  const app = new Hono();

  app.post('/setup/user-info', async (c) => {
    const body = await c.req.json();
    const parsed = SetupUserInfoSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'Validation failed', details: parsed.error.issues }, 400);
    }

    const config = deps.loadConfig();
    config.userInfo.name = parsed.data.name;
    config.language = parsed.data.language;
    deps.saveConfig(config);

    console.log(`[setup] User info saved: ${parsed.data.name} (${parsed.data.language})`);
    return c.json({ success: true, section: 'user-info' });
  });

  return app;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/lolo/Documents/opentidy && pnpm --filter @opentidy/backend test -- --run apps/backend/src/features/setup/user-info.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/features/setup/user-info.ts apps/backend/src/features/setup/user-info.test.ts
git commit -m "feat(backend): add POST /api/setup/user-info endpoint"
```

---

### Task 4: Setup Complete + Permissions + Agents APIs

**Files:**
- Create: `apps/backend/src/features/setup/complete.ts`
- Create: `apps/backend/src/features/setup/complete.test.ts`
- Create: `apps/backend/src/features/setup/permissions.ts`
- Create: `apps/backend/src/features/setup/permissions.test.ts`
- Create: `apps/backend/src/features/setup/agents.ts`
- Create: `apps/backend/src/features/setup/agents.test.ts`

These three are small endpoints grouped into one task. Follow the same TDD pattern as Tasks 2-3: write failing test, implement, verify pass, commit.

- [ ] **Step 1: Write tests for complete.ts**

Test that `POST /setup/complete` sets `config.setupComplete = true` and saves.

- [ ] **Step 2: Implement complete.ts**

Minimal: load config, set `setupComplete = true`, save, return `{ success: true }`.

- [ ] **Step 3: Run tests, verify pass**

- [ ] **Step 4: Write tests for permissions.ts**

Test `GET /setup/permissions` returns permission list. Test `POST /setup/permissions/grant` calls grant function. Use `execFileSync` (not `exec`) for `osascript` calls — see `apps/backend/src/cli/setup/permissions.ts` for the existing pattern.

- [ ] **Step 5: Implement permissions.ts**

List of macOS permissions (Messages, Mail, Calendar, Contacts, Finder, System Events). Each has a check via `osascript` and a grant trigger. Use `execFileSync('osascript', ['-e', ...])` — never `exec()`.

- [ ] **Step 6: Run tests, verify pass**

- [ ] **Step 7: Write tests for agents.ts**

Test `GET /setup/agents` returns list with install/auth status per agent. Test `GET /setup/agents/install-command?agent=claude` returns the CLI install command string.

- [ ] **Step 8: Implement agents.ts**

Define agent metadata (label, badge, install command, auth command) for claude/gemini/copilot. The install-command endpoint returns the command string — the frontend runs it in the TerminalDrawer.

- [ ] **Step 9: Run all tests, verify pass**

Run: `cd /Users/lolo/Documents/opentidy && pnpm --filter @opentidy/backend test -- --run apps/backend/src/features/setup/`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add apps/backend/src/features/setup/
git commit -m "feat(backend): add complete, permissions, and agents setup endpoints"
```

---

### Task 5: Backend PTY WebSocket Endpoint

**Files:**
- Create: `apps/backend/src/features/terminal/pty.ts`
- Create: `apps/backend/src/features/terminal/pty.test.ts`
- Modify: `apps/backend/package.json`

- [ ] **Step 1: Install dependencies**

Run: `cd /Users/lolo/Documents/opentidy && pnpm --filter @opentidy/backend add node-pty @hono/node-ws`

- [ ] **Step 2: Write the failing test**

`apps/backend/src/features/terminal/pty.test.ts`:

```typescript
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect } from 'vitest';
import { createPtyManager, ALLOWED_COMMANDS } from './pty.js';

describe('PTY Manager', () => {
  it('rejects commands not in allowlist', () => {
    const manager = createPtyManager();
    expect(() => manager.validateCommand('rm -rf /')).toThrow('not allowed');
  });

  it('accepts known setup commands', () => {
    const manager = createPtyManager();
    for (const cmd of ALLOWED_COMMANDS) {
      expect(() => manager.validateCommand(cmd)).not.toThrow();
    }
  });

  it('accepts commands that start with allowed prefix', () => {
    const manager = createPtyManager();
    expect(() => manager.validateCommand('claude auth login --some-flag')).not.toThrow();
  });

  it('tracks zero active sessions initially', () => {
    const manager = createPtyManager();
    expect(manager.activeSessions()).toBe(0);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd /Users/lolo/Documents/opentidy && pnpm --filter @opentidy/backend test -- --run apps/backend/src/features/terminal/pty.test.ts`
Expected: FAIL

- [ ] **Step 4: Implement pty.ts — PTY manager**

`apps/backend/src/features/terminal/pty.ts`:

```typescript
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import * as pty from 'node-pty';
import type { IPty } from 'node-pty';

export const ALLOWED_COMMANDS = [
  'claude auth login',
  'claude auth status',
  'gemini auth login',
  'copilot auth login',
  'wacli auth',
  'wacli doctor',
  'cloudflared tunnel login',
  'cloudflared tunnel create',
  'cloudflared tunnel route',
  'cloudflared service install',
  'pipx install camoufox',
  'pip3 install camoufox',
];

interface PtySession {
  id: string;
  process: IPty;
  command: string;
  startedAt: Date;
}

export function createPtyManager() {
  const sessions = new Map<string, PtySession>();

  function validateCommand(command: string): void {
    const isAllowed = ALLOWED_COMMANDS.some((allowed) =>
      command.startsWith(allowed),
    );
    if (!isAllowed) {
      throw new Error(`Command not allowed: ${command}`);
    }
  }

  function spawn(id: string, command: string): IPty {
    validateCommand(command);

    const shell = process.env.SHELL || '/bin/zsh';
    const ptyProcess = pty.spawn(shell, ['-c', command], {
      name: 'xterm-256color',
      cols: 120,
      rows: 30,
      cwd: process.env.HOME || '/tmp',
      env: {
        ...process.env,
        TERM: 'xterm-256color',
      } as Record<string, string>,
    });

    sessions.set(id, { id, process: ptyProcess, command, startedAt: new Date() });

    ptyProcess.onExit(() => {
      sessions.delete(id);
    });

    console.log(`[pty] Spawned session ${id}: ${command} (pid: ${ptyProcess.pid})`);
    return ptyProcess;
  }

  function kill(id: string): void {
    const session = sessions.get(id);
    if (session) {
      session.process.kill();
      sessions.delete(id);
      console.log(`[pty] Killed session ${id}`);
    }
  }

  function killAll(): void {
    for (const [id] of sessions) {
      kill(id);
    }
  }

  function activeSessions(): number {
    return sessions.size;
  }

  return { validateCommand, spawn, kill, killAll, activeSessions };
}

export type PtyManager = ReturnType<typeof createPtyManager>;
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd /Users/lolo/Documents/opentidy && pnpm --filter @opentidy/backend test -- --run apps/backend/src/features/terminal/pty.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/features/terminal/pty.ts apps/backend/src/features/terminal/pty.test.ts apps/backend/package.json pnpm-lock.yaml
git commit -m "feat(backend): add PTY manager with command allowlist for terminal drawer"
```

---

### Task 6: Mount All Setup Routes on Server

**Files:**
- Modify: `apps/backend/src/server.ts`
- Modify: `apps/backend/src/index.ts`

- [ ] **Step 1: Add imports and deps to server.ts**

In `apps/backend/src/server.ts`, import the new setup routes:

```typescript
import { setupStatusRoute, type SetupDeps } from './features/setup/status.js';
import { setupUserInfoRoute } from './features/setup/user-info.js';
import { setupCompleteRoute } from './features/setup/complete.js';
import { permissionsRoute } from './features/setup/permissions.js';
import { agentSetupRoute } from './features/setup/agents.js';
```

Add to `AppDeps` interface:

```typescript
  setupDeps?: SetupDeps;
  configFns?: {
    loadConfig: () => OpenTidyConfig;
    saveConfig: (config: OpenTidyConfig) => void;
  };
```

Mount in `createApp()` after existing routes, before static file serving:

```typescript
    // Setup routes
    if (deps.setupDeps) {
      app.route('/api', setupStatusRoute(deps.setupDeps));
    }
    if (deps.configFns) {
      app.route('/api', setupUserInfoRoute(deps.configFns));
      app.route('/api', setupCompleteRoute(deps.configFns));
    }
    app.route('/api', permissionsRoute({}));
    if (deps.setupDeps) {
      app.route('/api', agentSetupRoute({
        checkInstalled: deps.setupDeps.checkAgentInstalled,
        checkAuth: deps.setupDeps.checkAgentAuth,
        getActiveAgent: () => deps.setupDeps!.loadConfig().agentConfig?.name ?? 'claude',
      }));
    }
```

- [ ] **Step 2: Wire deps in index.ts**

In `apps/backend/src/index.ts`, construct `setupDeps` and `configFns` and pass them to `createApp()`. The `checkAgentInstalled` and `checkAgentAuth` functions should use `which` (via `execFileSync`) to check if the binary exists and run `<agent> auth status` to check auth.

- [ ] **Step 3: Build and verify**

Run: `cd /Users/lolo/Documents/opentidy && pnpm build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/server.ts apps/backend/src/index.ts
git commit -m "feat(backend): mount setup routes on server"
```

---

### Task 7: Frontend TerminalDrawer Component

**Files:**
- Create: `apps/web/src/shared/TerminalDrawer.tsx`
- Create: `apps/web/src/shared/TerminalDrawer.test.tsx`
- Modify: `apps/web/package.json`
- Modify: `apps/web/src/main.tsx`

- [ ] **Step 1: Install xterm dependencies**

Run: `cd /Users/lolo/Documents/opentidy && pnpm --filter @opentidy/web add @xterm/xterm @xterm/addon-fit @xterm/addon-web-links`

- [ ] **Step 2: Write the test**

`apps/web/src/shared/TerminalDrawer.test.tsx`:

```tsx
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import TerminalDrawer from './TerminalDrawer';

describe('TerminalDrawer', () => {
  it('renders title when open', () => {
    render(<TerminalDrawer open title="Installing Claude..." command="echo hello" onClose={() => {}} />);
    expect(screen.getByText('Installing Claude...')).toBeDefined();
  });

  it('does not render when closed', () => {
    const { container } = render(<TerminalDrawer open={false} title="Test" command="echo hi" onClose={() => {}} />);
    expect(container.querySelector('[data-testid="terminal-drawer"]')).toBeNull();
  });

  it('shows close button', () => {
    render(<TerminalDrawer open title="Test" command="echo hi" onClose={() => {}} />);
    expect(screen.getByRole('button', { name: /close/i })).toBeDefined();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd /Users/lolo/Documents/opentidy && pnpm --filter @opentidy/web test -- --run src/shared/TerminalDrawer.test.tsx`
Expected: FAIL

- [ ] **Step 4: Implement TerminalDrawer**

`apps/web/src/shared/TerminalDrawer.tsx` — A bottom drawer (40vh) with:
- Header: title + status indicator (Connecting/Running/Completed/Error) + Retry button (on error) + Close button
- Body: `<div ref>` where xterm.js attaches
- On mount (when `open=true`): dynamically import xterm, create Terminal + FitAddon + WebLinksAddon, connect WebSocket to `/api/terminal/pty?command=<base64>`, pipe data both ways
- On PTY exit message `{"exit": N}`: set status to completed (exit 0) or error (exit non-0), call `onComplete`/`onError`
- On close: dispose terminal, close WebSocket
- Drawer stays open until user clicks Close — **no auto-close**

See spec for the full `TerminalDrawerProps` interface.

- [ ] **Step 5: Add xterm CSS import in main.tsx**

In `apps/web/src/main.tsx`, add: `import '@xterm/xterm/css/xterm.css';`

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd /Users/lolo/Documents/opentidy && pnpm --filter @opentidy/web test -- --run src/shared/TerminalDrawer.test.tsx`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/shared/TerminalDrawer.tsx apps/web/src/shared/TerminalDrawer.test.tsx apps/web/src/main.tsx apps/web/package.json pnpm-lock.yaml
git commit -m "feat(web): add TerminalDrawer component with xterm.js + WebSocket PTY"
```

---

### Task 8: Frontend Setup Wizard

**Files:**
- Create: `apps/web/src/features/setup/SetupWizard.tsx`
- Create: `apps/web/src/features/setup/UserInfoStep.tsx`
- Create: `apps/web/src/features/setup/AgentStep.tsx`
- Create: `apps/web/src/features/setup/PermissionsStep.tsx`
- Create: `apps/web/src/features/setup/DoneStep.tsx`
- Create: `apps/web/src/features/setup/SetupWizard.test.tsx`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/shared/i18n/locales/en.json`
- Modify: `apps/web/src/shared/i18n/locales/fr.json`

- [ ] **Step 1: Add i18n strings**

Add `"setup"` section to both `en.json` and `fr.json` with keys: `welcome`, `subtitle`, `name`, `namePlaceholder`, `language`, `continue`, `back`, `connectAgent`, `connectAgentDesc`, `connect`, `connected`, `permissions`, `permissionsDesc`, `authorize`, `authorized`, `optional`, `required`, `done`, `doneDesc`, `createTask`, `configureServices`, `terminal.*`.

- [ ] **Step 2: Create UserInfoStep.tsx**

Simple form with name input (required) + language select (en/fr, defaults to `navigator.language`). Calls `onNext({ name, language })` on submit.

- [ ] **Step 3: Create AgentStep.tsx**

Fetches `GET /api/setup/agents` on mount. Shows agent cards (Claude/Gemini/Copilot) with badge and status. "Connect" button fetches install-command then opens `<TerminalDrawer>` with the command. On complete, refreshes agent list. At least one connected agent required to proceed.

- [ ] **Step 4: Create PermissionsStep.tsx**

Fetches `GET /api/setup/permissions` on mount. Shows permission cards with name, required/optional badge, granted status. "Authorize" button calls `POST /api/setup/permissions/grant`. All permissions are optional — user can always continue.

- [ ] **Step 5: Create DoneStep.tsx**

Success screen with two CTAs: "Create your first task" (→ `/nouveau`) and "Configure services" (→ `/toolbox`). Calls `POST /api/setup/complete` before navigating.

- [ ] **Step 6: Create SetupWizard.tsx**

4-step wizard (user-info → agent → permissions → done). Progress bar at top. Step dots. Renders the active step component. Manages step transitions via state.

- [ ] **Step 7: Add route guard in App.tsx**

Create `SetupGuard` component that fetches `GET /api/setup/status` on mount. If `setupComplete === false`, redirect to `/setup`. Add `/setup` route outside the `<Layout>` wrapper (no nav, no sidebar). Wrap `<Layout>` with `<SetupGuard>`.

- [ ] **Step 8: Write wizard test**

`apps/web/src/features/setup/SetupWizard.test.tsx` — test that the wizard renders step 1 (welcome text, name input). Mock fetch for API calls.

- [ ] **Step 9: Run tests**

Run: `cd /Users/lolo/Documents/opentidy && pnpm --filter @opentidy/web test -- --run`
Expected: PASS

- [ ] **Step 10: Build full project**

Run: `cd /Users/lolo/Documents/opentidy && pnpm build`
Expected: Build succeeds

- [ ] **Step 11: Commit**

```bash
git add apps/web/src/features/setup/ apps/web/src/App.tsx apps/web/src/shared/i18n/locales/
git commit -m "feat(web): add setup wizard with user info, agent connect, permissions, and done steps"
```

---

### Task 9: Simplify install.sh

**Files:**
- Modify: `install.sh`

- [ ] **Step 1: Read current install.sh**

Review the existing script to understand what to keep vs remove.

- [ ] **Step 2: Rewrite install.sh**

New script behavior:
1. Silent — no interactive prompts
2. Install only: Homebrew, node@22, pnpm, tmux, ttyd
3. Do NOT install: Claude CLI, Camoufox, python3, pipx, cloudflared
4. Clone/pull repo, `pnpm install && pnpm build`
5. Create `~/.config/opentidy/config.json` with auto-generated bearer token if it doesn't exist
6. Install LaunchAgent plist and activate (`launchctl load`)
7. Wait for health check (retry up to 30s)
8. Handle port conflict: warn and suggest `OPENTIDY_PORT=XXXX`
9. Open `http://localhost:$PORT` in browser
10. Print minimal success message

The script must be idempotent — safe to re-run.

- [ ] **Step 3: Test locally**

Run: `chmod +x install.sh && bash -n install.sh` (syntax check)

- [ ] **Step 4: Commit**

```bash
git add install.sh
git commit -m "feat(cli): simplify install.sh — silent install, auto-start, open browser"
```

---

### Task 10: CLI Setup Redirect

**Files:**
- Modify: `apps/backend/src/cli/setup.ts`

- [ ] **Step 1: Read current setup.ts**

- [ ] **Step 2: Add browser redirect at top of runSetup()**

At the start of `runSetup()`, check if the server is running by calling health endpoint using `execFileSync('curl', ['-sf', url])`. If running, open the browser at the setup/settings URL and return early. Fall through to the existing CLI menu if server is not running.

Use `execFileSync` — never `exec()`.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/cli/setup.ts
git commit -m "feat(cli): redirect opentidy setup to browser when server is running"
```

---

### Task 11: E2E Tests

**Files:**
- Create: `apps/web/tests/e2e/setup-wizard.spec.ts`

- [ ] **Step 1: Write E2E tests**

Test scenarios:
1. Redirect to `/setup` when `setupComplete` is false (mock API)
2. Step 1 shows name input + continue button
3. After filling name, advances to agent step (mock user-info and agents APIs)
4. No redirect when `setupComplete` is true

Use Playwright's `page.route()` to mock all API calls.

- [ ] **Step 2: Run E2E tests**

Run: `cd /Users/lolo/Documents/opentidy && pnpm --filter @opentidy/web test:e2e -- --grep "Setup Wizard"`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/web/tests/e2e/setup-wizard.spec.ts
git commit -m "test(web): add E2E tests for setup wizard flow"
```

---

## Dependency Graph

```
Task 1 (types) ──┬→ Task 2 (status API) ──┐
                 ├→ Task 3 (user-info API) ┤
                 └→ Task 4 (complete +     ├→ Task 6 (mount routes) → Task 8 (wizard UI) → Task 11 (E2E)
                     permissions + agents) ┘
Task 5 (PTY backend) ─────────────────────→ Task 6
Task 7 (TerminalDrawer) ─────────────────→ Task 8
Task 9 (install.sh) ── independent
Task 10 (CLI redirect) ── independent
```

**Parallelizable groups:**
- Tasks 2, 3, 4, 5, 7, 9, 10 can all run in parallel (after Task 1)
- Task 6 waits for 2-5
- Task 8 waits for 6 and 7
- Task 11 waits for 8
