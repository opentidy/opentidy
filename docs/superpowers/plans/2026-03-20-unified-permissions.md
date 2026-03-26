# Unified Module-Agnostic Permission System

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `--dangerously-skip-permissions` and mini-Claude hooks with a deterministic, human-controlled permission system where each module declares its tool risk levels and the user chooses how to handle them.

**Architecture:** Each module manifest declares `safe` vs `critical` tools with a scope (`per-call`/`per-task`). The user sets a permission level per module (`allow`/`confirm`/`ask`). At session launch, the backend builds `--allowedTools` dynamically and generates a single PreToolUse hook that calls `POST /api/permissions/check`. For `confirm`-level tools, the hook blocks until the user approves via notification. No AI in the decision loop — AI only summarizes actions for human-readable notifications.

**Tech Stack:** TypeScript, Hono, Zod, React 19, Tailwind CSS v4, Vitest

**Spec:** `docs/specification.md` section 5.4

---

### Task 1: Add permission types to shared package

**Files:**
- Modify: `packages/shared/src/types.ts:269-286` (ModuleManifest)
- Modify: `packages/shared/src/types.ts:411-448` (OpenTidyConfig)
- Modify: `packages/shared/src/schemas.ts` (Zod schemas)

- [ ] **Step 1: Add ToolPermissions type to ModuleManifest**

In `packages/shared/src/types.ts`, add after the `MacPermission` interface (line 267):

```typescript
export type PermissionScope = 'per-call' | 'per-task';

export interface ToolPermissions {
  scope: PermissionScope;
  safe: string[];
  critical: string[];
}
```

Then add to `ModuleManifest` (after `permissions?: MacPermission[]`):

```typescript
  toolPermissions?: ToolPermissions;
```

- [ ] **Step 2: Add PermissionLevel and PermissionConfig types**

In `packages/shared/src/types.ts`, add before `OpenTidyConfig`:

```typescript
export type PermissionLevel = 'allow' | 'confirm' | 'ask';
export type PermissionPreset = 'supervised' | 'autonomous' | 'full-auto';

export interface PermissionConfig {
  preset: PermissionPreset;
  defaultLevel: PermissionLevel;
  modules: Record<string, PermissionLevel>;
}
```

- [ ] **Step 3: Add permissions to OpenTidyConfig**

Add to the `OpenTidyConfig` interface:

```typescript
  permissions: PermissionConfig;
```

- [ ] **Step 4: Add Zod schemas for new types**

In `packages/shared/src/schemas.ts`, add:

```typescript
export const PermissionScopeSchema = z.enum(['per-call', 'per-task']);
export const PermissionLevelSchema = z.enum(['allow', 'confirm', 'ask']);
export const PermissionPresetSchema = z.enum(['supervised', 'autonomous', 'full-auto']);

export const ToolPermissionsSchema = z.object({
  scope: PermissionScopeSchema,
  safe: z.array(z.string()),
  critical: z.array(z.string()),
});

export const PermissionConfigSchema = z.object({
  preset: PermissionPresetSchema,
  defaultLevel: PermissionLevelSchema,
  modules: z.record(PermissionLevelSchema),
});
```

Update `ModuleManifestSchema` to include:
```typescript
  toolPermissions: ToolPermissionsSchema.optional(),
```

- [ ] **Step 5: Export new types**

Verify all new types are exported from `packages/shared/src/index.ts`.

- [ ] **Step 6: Build shared package**

Run: `pnpm --filter @opentidy/shared build`
Expected: Build succeeds with no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/shared/
git commit -m "feat(shared): add permission types and schemas for unified permission system"
```

---

### Task 2: Add toolPermissions to module manifests

**Files:**
- Modify: `apps/backend/modules/gmail/module.json`
- Modify: `apps/backend/modules/browser/module.json`
- Modify: `apps/backend/modules/whatsapp/module.json`
- Modify: `apps/backend/modules/telegram/module.json`
- Modify: `apps/backend/modules/imessage/module.json`

- [ ] **Step 1: Add toolPermissions to Gmail manifest**

```json
"toolPermissions": {
  "scope": "per-call",
  "safe": ["mcp__gmail__search", "mcp__gmail__read_message", "mcp__gmail__list_labels", "mcp__gmail__get_message"],
  "critical": ["mcp__gmail__send", "mcp__gmail__reply", "mcp__gmail__draft", "mcp__gmail__forward"]
}
```

- [ ] **Step 2: Add toolPermissions to Browser manifest**

```json
"toolPermissions": {
  "scope": "per-task",
  "safe": ["mcp__camofox__navigate", "mcp__camofox__navigate_and_snapshot", "mcp__camofox__snapshot", "mcp__camofox__scroll", "mcp__camofox__scroll_and_snapshot", "mcp__camofox__get_links", "mcp__camofox__list_tabs", "mcp__camofox__screenshot", "mcp__camofox__extract_resources"],
  "critical": ["mcp__camofox__click", "mcp__camofox__fill_form", "mcp__camofox__camofox_evaluate_js", "mcp__camofox__type_text", "mcp__camofox__type_and_submit", "mcp__camofox__batch_click"]
}
```

- [ ] **Step 3: Add toolPermissions to WhatsApp manifest**

```json
"toolPermissions": {
  "scope": "per-call",
  "safe": ["mcp__whatsapp__list_chats", "mcp__whatsapp__read_messages", "mcp__whatsapp__search"],
  "critical": ["mcp__whatsapp__send_message", "mcp__whatsapp__send_media"]
}
```

- [ ] **Step 4: Add toolPermissions to Telegram manifest**

```json
"toolPermissions": {
  "scope": "per-call",
  "safe": ["mcp__telegram__get_updates", "mcp__telegram__get_chat"],
  "critical": ["mcp__telegram__send_message", "mcp__telegram__send_photo"]
}
```

- [ ] **Step 5: iMessage has no MCP tools (receiver only) — skip**

iMessage module has no mcpServers, only a receiver. No toolPermissions needed.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/modules/
git commit -m "feat(backend): add toolPermissions to module manifests"
```

---

### Task 3: Permission state manager (per-task grants)

**Files:**
- Create: `apps/backend/src/features/permissions/state.ts`
- Create: `apps/backend/src/features/permissions/state.test.ts`

- [ ] **Step 1: Write tests for permission state**

```typescript
// apps/backend/src/features/permissions/state.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createPermissionState } from './state';

describe('PermissionState', () => {
  let state: ReturnType<typeof createPermissionState>;

  beforeEach(() => {
    state = createPermissionState();
  });

  it('returns false for unknown task+module', () => {
    expect(state.isGranted('task-1', 'gmail')).toBe(false);
  });

  it('grants and checks per-task', () => {
    state.grant('task-1', 'camofox');
    expect(state.isGranted('task-1', 'camofox')).toBe(true);
  });

  it('does not leak grants across tasks', () => {
    state.grant('task-1', 'camofox');
    expect(state.isGranted('task-2', 'camofox')).toBe(false);
  });

  it('revokes grants for a task', () => {
    state.grant('task-1', 'camofox');
    state.revokeTask('task-1');
    expect(state.isGranted('task-1', 'camofox')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @opentidy/backend test -- src/features/permissions/state.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement permission state**

```typescript
// apps/backend/src/features/permissions/state.ts
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

export function createPermissionState() {
  // Map<taskId, Set<moduleName>>
  const grants = new Map<string, Set<string>>();

  return {
    isGranted(taskId: string, moduleName: string): boolean {
      return grants.get(taskId)?.has(moduleName) ?? false;
    },

    grant(taskId: string, moduleName: string): void {
      if (!grants.has(taskId)) grants.set(taskId, new Set());
      grants.get(taskId)!.add(moduleName);
    },

    revokeTask(taskId: string): void {
      grants.delete(taskId);
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @opentidy/backend test -- src/features/permissions/state.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/features/permissions/
git commit -m "feat(backend): add permission state manager for per-task grants"
```

---

### Task 4: Permission resolver (manifest lookup)

**Files:**
- Create: `apps/backend/src/features/permissions/resolver.ts`
- Create: `apps/backend/src/features/permissions/resolver.test.ts`

- [ ] **Step 1: Write tests for permission resolver**

```typescript
// apps/backend/src/features/permissions/resolver.test.ts
import { describe, it, expect } from 'vitest';
import { createPermissionResolver } from './resolver';
import type { ModuleManifest, PermissionConfig } from '@opentidy/shared';

const gmailManifest: ModuleManifest = {
  name: 'gmail', label: 'Gmail', description: '', version: '1.0.0',
  toolPermissions: {
    scope: 'per-call',
    safe: ['mcp__gmail__search', 'mcp__gmail__read_message'],
    critical: ['mcp__gmail__send', 'mcp__gmail__reply'],
  },
};

const browserManifest: ModuleManifest = {
  name: 'browser', label: 'Browser', description: '', version: '1.0.0',
  toolPermissions: {
    scope: 'per-task',
    safe: ['mcp__camofox__navigate', 'mcp__camofox__snapshot'],
    critical: ['mcp__camofox__click', 'mcp__camofox__fill_form'],
  },
};

const noPermManifest: ModuleManifest = {
  name: 'unknown', label: 'Unknown', description: '', version: '1.0.0',
};

const config: PermissionConfig = {
  preset: 'autonomous',
  defaultLevel: 'confirm',
  modules: { gmail: 'confirm', browser: 'allow' },
};

describe('PermissionResolver', () => {
  const manifests = new Map<string, ModuleManifest>([
    ['gmail', gmailManifest],
    ['browser', browserManifest],
    ['unknown', noPermManifest],
  ]);
  const resolver = createPermissionResolver(manifests, config);

  it('returns allow for safe tools regardless of module level', () => {
    const result = resolver.resolve('mcp__gmail__search');
    expect(result).toEqual({ level: 'allow', scope: 'per-call', moduleName: 'gmail' });
  });

  it('returns module level for critical tools', () => {
    const result = resolver.resolve('mcp__gmail__send');
    expect(result).toEqual({ level: 'confirm', scope: 'per-call', moduleName: 'gmail' });
  });

  it('returns allow for critical tools when module level is allow', () => {
    const result = resolver.resolve('mcp__camofox__click');
    expect(result).toEqual({ level: 'allow', scope: 'per-task', moduleName: 'browser' });
  });

  it('returns defaultLevel for modules without explicit config', () => {
    const result = resolver.resolve('mcp__unknown_tool__action');
    // Unknown tool from unknown module → defaults to critical + defaultLevel
    expect(result.level).toBe('confirm');
  });

  it('returns confirm+per-call for completely unknown tools (fail-safe)', () => {
    const result = resolver.resolve('mcp__totally_unknown__foo');
    expect(result).toEqual({ level: 'confirm', scope: 'per-call', moduleName: null });
  });

  it('builds allowedTools list (safe + allow-level critical + confirm-level critical)', () => {
    const list = resolver.getAllowedTools();
    expect(list).toContain('mcp__gmail__search');     // safe
    expect(list).toContain('mcp__gmail__send');        // confirm but needs to be in allowedTools for hook to fire
    expect(list).toContain('mcp__camofox__navigate');  // safe
    expect(list).toContain('mcp__camofox__click');     // allow-level critical
  });

  it('builds confirm matcher regex', () => {
    const matcher = resolver.getConfirmMatcher();
    expect(matcher).toContain('mcp__gmail__send');
    expect(matcher).toContain('mcp__gmail__reply');
    expect(matcher).not.toContain('mcp__camofox__click'); // allow-level, not confirm
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @opentidy/backend test -- src/features/permissions/resolver.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement permission resolver**

```typescript
// apps/backend/src/features/permissions/resolver.ts
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import type { ModuleManifest, PermissionConfig, PermissionLevel, PermissionScope } from '@opentidy/shared';

export interface ResolveResult {
  level: PermissionLevel;
  scope: PermissionScope;
  moduleName: string | null;
}

export function createPermissionResolver(
  manifests: Map<string, ModuleManifest>,
  config: PermissionConfig,
) {
  // Build lookup: toolName → { moduleName, isSafe, scope }
  const toolIndex = new Map<string, { moduleName: string; isSafe: boolean; scope: PermissionScope }>();

  for (const [, manifest] of manifests) {
    if (!manifest.toolPermissions) continue;
    const { scope, safe, critical } = manifest.toolPermissions;
    for (const tool of safe) {
      toolIndex.set(tool, { moduleName: manifest.name, isSafe: true, scope });
    }
    for (const tool of critical) {
      toolIndex.set(tool, { moduleName: manifest.name, isSafe: false, scope });
    }
  }

  function getModuleLevel(moduleName: string): PermissionLevel {
    return config.modules[moduleName] ?? config.defaultLevel;
  }

  function resolve(toolName: string): ResolveResult {
    const indexed = toolIndex.get(toolName);

    if (indexed) {
      if (indexed.isSafe) {
        return { level: 'allow', scope: indexed.scope, moduleName: indexed.moduleName };
      }
      return { level: getModuleLevel(indexed.moduleName), scope: indexed.scope, moduleName: indexed.moduleName };
    }

    // Try to guess module from tool name pattern mcp__<server>__<action>
    const match = toolName.match(/^mcp__(.+?)__/);
    if (match) {
      const serverName = match[1];
      // Find manifest by mcp server name
      for (const [, manifest] of manifests) {
        if (manifest.mcpServers?.some(s => s.name === serverName)) {
          return { level: getModuleLevel(manifest.name), scope: 'per-call', moduleName: manifest.name };
        }
      }
    }

    // Completely unknown tool — fail-safe: confirm per-call
    return { level: config.defaultLevel, scope: 'per-call', moduleName: null };
  }

  function getAllowedTools(): string[] {
    const tools: string[] = [];
    for (const [toolName, info] of toolIndex) {
      if (info.isSafe) {
        tools.push(toolName);
      } else {
        const level = getModuleLevel(info.moduleName);
        // Both allow and confirm tools go in allowedTools.
        // confirm tools are intercepted by the PreToolUse hook.
        // ask tools are NOT in allowedTools → agent CLI prompts.
        if (level === 'allow' || level === 'confirm') {
          tools.push(toolName);
        }
      }
    }
    return tools;
  }

  function getConfirmMatcher(): string {
    const confirmTools: string[] = [];
    for (const [toolName, info] of toolIndex) {
      if (!info.isSafe && getModuleLevel(info.moduleName) === 'confirm') {
        confirmTools.push(toolName);
      }
    }
    return confirmTools.join('|');
  }

  return { resolve, getAllowedTools, getConfirmMatcher };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @opentidy/backend test -- src/features/permissions/resolver.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/features/permissions/
git commit -m "feat(backend): add permission resolver with manifest lookup and allowedTools builder"
```

---

### Task 5: Permission check endpoint

**Files:**
- Create: `apps/backend/src/features/permissions/check.ts`
- Create: `apps/backend/src/features/permissions/check.test.ts`
- Create: `apps/backend/src/features/permissions/types.ts`

- [ ] **Step 1: Create deps interface**

```typescript
// apps/backend/src/features/permissions/types.ts
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import type { ModuleManifest, PermissionConfig } from '@opentidy/shared';

export interface PermissionCheckDeps {
  manifests: Map<string, ModuleManifest>;
  loadConfig: () => PermissionConfig;
  state: {
    isGranted(taskId: string, moduleName: string): boolean;
    grant(taskId: string, moduleName: string): void;
  };
  requestApproval: (opts: {
    taskId: string;
    toolName: string;
    toolInput: Record<string, unknown>;
    moduleName: string | null;
  }) => Promise<boolean>;
  audit: {
    log(input: { sessionId: string; toolName: string; toolInput: Record<string, unknown>; decision: string }): void;
  };
}
```

- [ ] **Step 2: Write tests for check endpoint**

```typescript
// apps/backend/src/features/permissions/check.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createPermissionChecker } from './check';
import type { ModuleManifest, PermissionConfig } from '@opentidy/shared';
import type { PermissionCheckDeps } from './types';

const gmailManifest: ModuleManifest = {
  name: 'gmail', label: 'Gmail', description: '', version: '1.0.0',
  toolPermissions: {
    scope: 'per-call',
    safe: ['mcp__gmail__search'],
    critical: ['mcp__gmail__send'],
  },
};

const browserManifest: ModuleManifest = {
  name: 'browser', label: 'Browser', description: '', version: '1.0.0',
  toolPermissions: {
    scope: 'per-task',
    safe: ['mcp__camofox__navigate'],
    critical: ['mcp__camofox__click'],
  },
};

function makeDeps(overrides: Partial<PermissionCheckDeps> = {}): PermissionCheckDeps {
  const config: PermissionConfig = {
    preset: 'autonomous',
    defaultLevel: 'confirm',
    modules: { gmail: 'confirm', browser: 'confirm' },
  };
  return {
    manifests: new Map([['gmail', gmailManifest], ['browser', browserManifest]]),
    loadConfig: () => config,
    state: { isGranted: vi.fn(() => false), grant: vi.fn() },
    requestApproval: vi.fn(async () => true),
    audit: { log: vi.fn() },
    ...overrides,
  };
}

describe('PermissionChecker', () => {
  it('allows safe tools immediately (exit 0)', async () => {
    const deps = makeDeps();
    const checker = createPermissionChecker(deps);
    const result = await checker.check('task-1', 'session-1', 'mcp__gmail__search', {});
    expect(result).toBe('allow');
    expect(deps.requestApproval).not.toHaveBeenCalled();
  });

  it('requests approval for confirm+per-call critical tools', async () => {
    const deps = makeDeps();
    const checker = createPermissionChecker(deps);
    const result = await checker.check('task-1', 'session-1', 'mcp__gmail__send', { to: 'test@example.com' });
    expect(result).toBe('allow');
    expect(deps.requestApproval).toHaveBeenCalledOnce();
  });

  it('denies when user rejects', async () => {
    const deps = makeDeps({ requestApproval: vi.fn(async () => false) });
    const checker = createPermissionChecker(deps);
    const result = await checker.check('task-1', 'session-1', 'mcp__gmail__send', { to: 'test@example.com' });
    expect(result).toBe('deny');
  });

  it('checks per-task grant before requesting approval', async () => {
    const deps = makeDeps({
      state: { isGranted: vi.fn(() => true), grant: vi.fn() },
    });
    const checker = createPermissionChecker(deps);
    const result = await checker.check('task-1', 'session-1', 'mcp__camofox__click', { element: 'Search' });
    expect(result).toBe('allow');
    expect(deps.requestApproval).not.toHaveBeenCalled();
  });

  it('grants per-task after first approval', async () => {
    const grantFn = vi.fn();
    const deps = makeDeps({
      state: { isGranted: vi.fn(() => false), grant: grantFn },
    });
    const checker = createPermissionChecker(deps);
    await checker.check('task-1', 'session-1', 'mcp__camofox__click', { element: 'Search' });
    expect(grantFn).toHaveBeenCalledWith('task-1', 'browser');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @opentidy/backend test -- src/features/permissions/check.test.ts`
Expected: FAIL — module not found

- [ ] **Step 4: Implement permission checker**

```typescript
// apps/backend/src/features/permissions/check.ts
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { createPermissionResolver } from './resolver';
import type { PermissionCheckDeps } from './types';

export function createPermissionChecker(deps: PermissionCheckDeps) {
  async function check(
    taskId: string,
    sessionId: string,
    toolName: string,
    toolInput: Record<string, unknown>,
  ): Promise<'allow' | 'deny'> {
    const config = deps.loadConfig();
    const resolver = createPermissionResolver(deps.manifests, config);
    const { level, scope, moduleName } = resolver.resolve(toolName);

    console.log(`[permissions] ${toolName} → level=${level}, scope=${scope}, module=${moduleName ?? 'unknown'}`);

    // Safe or allow-level → pass immediately
    if (level === 'allow') {
      deps.audit.log({ sessionId, toolName, toolInput, decision: 'auto-allowed' });
      return 'allow';
    }

    // Ask level should never reach this endpoint (tool not in allowedTools → agent CLI prompts)
    // Defensive: deny if it somehow does
    if (level === 'ask') {
      console.warn(`[permissions] ask-level tool ${toolName} reached check endpoint — denying`);
      deps.audit.log({ sessionId, toolName, toolInput, decision: 'ask-denied' });
      return 'deny';
    }

    // Confirm level — check per-task grant first
    if (scope === 'per-task' && moduleName && deps.state.isGranted(taskId, moduleName)) {
      console.log(`[permissions] ${toolName} → already granted for task ${taskId}`);
      deps.audit.log({ sessionId, toolName, toolInput, decision: 'task-granted' });
      return 'allow';
    }

    // Request human approval
    const approved = await deps.requestApproval({ taskId, toolName, toolInput, moduleName });

    if (approved) {
      if (scope === 'per-task' && moduleName) {
        deps.state.grant(taskId, moduleName);
      }
      deps.audit.log({ sessionId, toolName, toolInput, decision: 'user-approved' });
      return 'allow';
    }

    deps.audit.log({ sessionId, toolName, toolInput, decision: 'user-denied' });
    return 'deny';
  }

  return { check };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @opentidy/backend test -- src/features/permissions/check.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/features/permissions/
git commit -m "feat(backend): add permission checker with per-task grants and human approval"
```

---

### Task 6: Permission check HTTP route

**Files:**
- Create: `apps/backend/src/features/permissions/route.ts`
- Modify: `apps/backend/src/server.ts`

- [ ] **Step 1: Create the Hono route**

```typescript
// apps/backend/src/features/permissions/route.ts
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { Hono } from 'hono';
import { HookPayloadSchema } from '@opentidy/shared';

interface PermissionRouteDeps {
  checker: {
    check(taskId: string, sessionId: string, toolName: string, toolInput: Record<string, unknown>): Promise<'allow' | 'deny'>;
  };
}

function extractTaskId(payload: { session_id: string; cwd?: string }): string | null {
  if (payload.session_id.startsWith('opentidy-')) {
    return payload.session_id.slice('opentidy-'.length);
  }
  if (payload.cwd?.includes('/workspace/')) {
    const parts = payload.cwd.split('/workspace/');
    const taskId = parts[parts.length - 1]?.split('/')[0];
    if (taskId && !taskId.startsWith('_') && !taskId.startsWith('.')) return taskId;
  }
  return null;
}

export function permissionCheckRoute(deps: PermissionRouteDeps) {
  const router = new Hono();

  router.post('/permissions/check', async (c) => {
    const body = await c.req.json();
    const parsed = HookPayloadSchema.safeParse(body);
    if (!parsed.success) {
      // Fail-safe: deny unknown payloads
      return c.text('invalid payload', 400);
    }

    const payload = parsed.data;
    const taskId = extractTaskId(payload);
    if (!taskId || !payload.tool_name) {
      // Can't identify task or tool → deny
      return c.text('unknown task or tool', 500);
    }

    const decision = await deps.checker.check(
      taskId,
      payload.session_id,
      payload.tool_name,
      payload.tool_input ?? {},
    );

    if (decision === 'allow') {
      return c.text('approved');
    }

    // Exit code 2 = DENY in Claude Code hooks
    c.status(403);
    return c.text('denied by user');
  });

  return router;
}
```

Note: The HTTP status code determines the hook exit code. 200 → exit 0 (allow). 4xx/5xx → exit 2 (deny). The hook script uses curl, so non-200 = non-zero exit.

- [ ] **Step 2: Mount route in server.ts**

Add to `apps/backend/src/server.ts` after the hooks route:

```typescript
import { permissionCheckRoute } from './features/permissions/route';
// ... in the route mounting section:
app.route('/api', permissionCheckRoute({ checker: deps.permissionChecker }));
```

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/features/permissions/route.ts apps/backend/src/server.ts
git commit -m "feat(backend): add POST /api/permissions/check HTTP route"
```

---

### Task 7: Approval request via notification system

**Files:**
- Create: `apps/backend/src/features/permissions/approval.ts`
- Create: `apps/backend/src/features/permissions/approval.test.ts`

This is the bridge between the permission checker and the notification system. When the checker needs human approval, it calls `requestApproval()` which:
1. Calls an AI one-shot to summarize the action in a human-readable sentence
2. Sends the summary as a notification
3. Waits for the user's response

- [ ] **Step 1: Write tests for approval manager**

```typescript
// apps/backend/src/features/permissions/approval.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createApprovalManager } from './approval';

describe('ApprovalManager', () => {
  it('summarizes and sends notification, resolves on approve', async () => {
    const summarize = vi.fn(async () => 'Send email to test@example.com about Hello');
    const sendConfirmation = vi.fn(async () => {});
    const manager = createApprovalManager({ summarize, sendConfirmation });

    const promise = manager.requestApproval({
      taskId: 'task-1',
      toolName: 'mcp__gmail__send',
      toolInput: { to: 'test@example.com', subject: 'Hello' },
      moduleName: 'gmail',
    });

    // Wait for summarize + send to complete
    await vi.waitFor(() => expect(sendConfirmation).toHaveBeenCalledOnce());
    const approvalId = sendConfirmation.mock.calls[0][0];
    const summary = sendConfirmation.mock.calls[0][5]; // 6th arg is summary
    expect(summary).toBe('Send email to test@example.com about Hello');

    manager.respond(approvalId, true);
    const result = await promise;
    expect(result).toBe(true);
  });

  it('resolves false on deny', async () => {
    const summarize = vi.fn(async () => 'Send email');
    const sendConfirmation = vi.fn(async () => {});
    const manager = createApprovalManager({ summarize, sendConfirmation });

    const promise = manager.requestApproval({
      taskId: 'task-1',
      toolName: 'mcp__gmail__send',
      toolInput: { to: 'test@example.com' },
      moduleName: 'gmail',
    });

    await vi.waitFor(() => expect(sendConfirmation).toHaveBeenCalledOnce());
    const approvalId = sendConfirmation.mock.calls[0][0];
    manager.respond(approvalId, false);

    const result = await promise;
    expect(result).toBe(false);
  });

  it('lists pending approvals', async () => {
    const summarize = vi.fn(async () => 'Send email');
    const sendConfirmation = vi.fn(async () => {});
    const manager = createApprovalManager({ summarize, sendConfirmation });

    manager.requestApproval({
      taskId: 'task-1',
      toolName: 'mcp__gmail__send',
      toolInput: {},
      moduleName: 'gmail',
    });

    await vi.waitFor(() => expect(sendConfirmation).toHaveBeenCalledOnce());
    const pending = manager.listPending();
    expect(pending).toHaveLength(1);
    expect(pending[0].taskId).toBe('task-1');
    expect(pending[0].toolName).toBe('mcp__gmail__send');
  });

  it('cancels pending approvals for a task', async () => {
    const summarize = vi.fn(async () => 'Click button');
    const sendConfirmation = vi.fn(async () => {});
    const manager = createApprovalManager({ summarize, sendConfirmation });

    const promise = manager.requestApproval({
      taskId: 'task-1',
      toolName: 'mcp__camofox__click',
      toolInput: {},
      moduleName: 'browser',
    });

    await vi.waitFor(() => expect(sendConfirmation).toHaveBeenCalledOnce());
    manager.cancelTask('task-1');

    const result = await promise;
    expect(result).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @opentidy/backend test -- src/features/permissions/approval.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement approval manager**

```typescript
// apps/backend/src/features/permissions/approval.ts
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import crypto from 'crypto';

interface PendingApproval {
  id: string;
  taskId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  moduleName: string | null;
  summary: string;
  createdAt: string;
  resolve: (approved: boolean) => void;
}

interface ApprovalDeps {
  /** AI one-shot: summarize a tool call into a human-readable sentence */
  summarize: (toolName: string, toolInput: Record<string, unknown>) => Promise<string>;
  /** Send a confirmation notification via the configured channel */
  sendConfirmation: (approvalId: string, taskId: string, toolName: string, toolInput: Record<string, unknown>, moduleName: string | null, summary: string) => Promise<void>;
}

export function createApprovalManager(deps: ApprovalDeps) {
  const pending = new Map<string, PendingApproval>();

  async function requestApproval(opts: {
    taskId: string;
    toolName: string;
    toolInput: Record<string, unknown>;
    moduleName: string | null;
  }): Promise<boolean> {
    const id = crypto.randomUUID();

    // AI one-shot summary for human-readable notification
    let summary: string;
    try {
      summary = await deps.summarize(opts.toolName, opts.toolInput);
    } catch (err) {
      console.error('[permissions] Summarize failed, using fallback:', err);
      summary = `${opts.moduleName ?? 'unknown'}: ${opts.toolName}`;
    }

    return new Promise<boolean>((resolvePromise) => {
      pending.set(id, {
        id,
        taskId: opts.taskId,
        toolName: opts.toolName,
        toolInput: opts.toolInput,
        moduleName: opts.moduleName,
        summary,
        createdAt: new Date().toISOString(),
        resolve: resolvePromise,
      });

      deps.sendConfirmation(id, opts.taskId, opts.toolName, opts.toolInput, opts.moduleName, summary)
        .catch(err => console.error('[permissions] Failed to send confirmation:', err));
    });
  }

  function respond(approvalId: string, approved: boolean): boolean {
    const entry = pending.get(approvalId);
    if (!entry) return false;
    pending.delete(approvalId);
    entry.resolve(approved);
    return true;
  }

  function cancelTask(taskId: string): void {
    for (const [id, entry] of pending) {
      if (entry.taskId === taskId) {
        pending.delete(id);
        entry.resolve(false);
      }
    }
  }

  function listPending(): Array<Omit<PendingApproval, 'resolve'>> {
    return Array.from(pending.values()).map(({ resolve: _, ...rest }) => rest);
  }

  return { requestApproval, respond, cancelTask, listPending };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @opentidy/backend test -- src/features/permissions/approval.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/features/permissions/approval.ts apps/backend/src/features/permissions/approval.test.ts
git commit -m "feat(backend): add approval manager for human confirmation flow"
```

---

### Task 8: Approval response routes (web + Telegram callback)

**Files:**
- Create: `apps/backend/src/features/permissions/respond.ts`

- [ ] **Step 1: Create response routes**

```typescript
// apps/backend/src/features/permissions/respond.ts
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { Hono } from 'hono';

interface RespondDeps {
  approvalManager: {
    respond(approvalId: string, approved: boolean): boolean;
    listPending(): Array<{ id: string; taskId: string; toolName: string; toolInput: Record<string, unknown>; moduleName: string | null; createdAt: string }>;
  };
  sse: {
    emit(event: { type: string; data: Record<string, unknown>; timestamp: string }): void;
  };
}

export function permissionRespondRoute(deps: RespondDeps) {
  const router = new Hono();

  // GET /permissions/pending — list pending approvals (for web UI)
  router.get('/permissions/pending', (c) => {
    return c.json({ pending: deps.approvalManager.listPending() });
  });

  // POST /permissions/:id/approve — approve a pending request
  router.post('/permissions/:id/approve', (c) => {
    const id = c.req.param('id');
    const found = deps.approvalManager.respond(id, true);
    if (!found) return c.json({ error: 'not found' }, 404);
    deps.sse.emit({ type: 'permission:resolved', data: { id, approved: true }, timestamp: new Date().toISOString() });
    return c.json({ ok: true });
  });

  // POST /permissions/:id/deny — deny a pending request
  router.post('/permissions/:id/deny', (c) => {
    const id = c.req.param('id');
    const found = deps.approvalManager.respond(id, false);
    if (!found) return c.json({ error: 'not found' }, 404);
    deps.sse.emit({ type: 'permission:resolved', data: { id, approved: false }, timestamp: new Date().toISOString() });
    return c.json({ ok: true });
  });

  return router;
}
```

- [ ] **Step 2: Mount in server.ts**

```typescript
import { permissionRespondRoute } from './features/permissions/respond';
// ... in the route mounting section:
app.route('/api', permissionRespondRoute({ approvalManager: deps.approvalManager, sse: deps.sse }));
```

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/features/permissions/respond.ts apps/backend/src/server.ts
git commit -m "feat(backend): add approval response routes for web and Telegram"
```

---

### Task 9: Update Claude adapter (remove old, add new)

**Files:**
- Modify: `apps/backend/src/shared/agents/claude.ts`
- Modify: `apps/backend/src/shared/agents/claude.test.ts`
- Modify: `packages/shared/src/types.ts` (SpawnOpts, SetupOpts)

- [ ] **Step 1: Update SpawnOpts — remove skipPermissions**

In `packages/shared/src/types.ts`, remove `skipPermissions` from `SpawnOpts`:

```typescript
export interface SpawnOpts {
  mode: 'autonomous' | 'interactive' | 'one-shot';
  cwd: string;
  systemPrompt?: string;
  instruction?: string;
  resumeSessionId?: string;
  allowedTools?: string[];
  outputFormat?: 'text' | 'json' | 'stream-json';
  pluginDir?: string;
  // skipPermissions removed — replaced by allowedTools
}
```

- [ ] **Step 2: Update SetupOpts — replace guardrails with permissions**

```typescript
export interface SetupOpts {
  permissionConfig: PermissionConfig;
  manifests: Map<string, ModuleManifest>;
  mcpServices: McpServicesConfig;
  configDir: string;
  serverPort: number;
}
```

- [ ] **Step 3: Update Claude adapter buildArgs**

In `apps/backend/src/shared/agents/claude.ts`, remove the `skipPermissions` block (lines 30-32):

```typescript
// REMOVE:
// if (opts.skipPermissions) {
//   args.push('--dangerously-skip-permissions');
// }
```

- [ ] **Step 4: Update Claude adapter writeConfig**

Replace the `writeConfig` method to generate hooks from permission config instead of guardrails:

```typescript
writeConfig(opts: SetupOpts): void {
  const resolver = createPermissionResolver(opts.manifests, opts.permissionConfig);
  const confirmMatcher = resolver.getConfirmMatcher();

  const hooksConfig: Record<string, unknown[]> = {};

  // PreToolUse: single hook for all confirm-level critical tools
  if (confirmMatcher) {
    hooksConfig['PreToolUse'] = [{
      matcher: confirmMatcher,
      hooks: [{
        type: 'command',
        command: `curl -s -X POST http://localhost:${opts.serverPort}/api/permissions/check -H 'Content-Type: application/json' -d @-`,
        timeout: 3_600_000, // 1h — zombie guard, not a perf constraint (matches agent timeout convention)
      }],
    }];
  }

  // PostToolUse: audit all tool calls
  hooksConfig['PostToolUse'] = [{
    hooks: [{
      type: 'command',
      command: `curl -s -X POST http://localhost:${opts.serverPort}/api/hooks -H 'Content-Type: application/json' -d @-`,
    }],
  }];

  // Stop + SessionEnd: lifecycle (unchanged)
  hooksConfig['Stop'] = [{
    hooks: [{
      type: 'command',
      command: `curl -s -X POST http://localhost:${opts.serverPort}/api/hooks -H 'Content-Type: application/json' -d @-`,
    }],
  }];

  hooksConfig['SessionEnd'] = [{
    hooks: [{
      type: 'command',
      command: `curl -s -X POST http://localhost:${opts.serverPort}/api/hooks -H 'Content-Type: application/json' -d @-`,
    }],
  }];

  const hooksDir = path.join(opts.configDir, 'hooks');
  fs.mkdirSync(hooksDir, { recursive: true });
  fs.writeFileSync(
    path.join(hooksDir, 'hooks.json'),
    JSON.stringify({ hooks: hooksConfig }, null, 2),
  );
},
```

- [ ] **Step 5: Update adapter tests**

Update `apps/backend/src/shared/agents/claude.test.ts`:
- Remove tests for `--dangerously-skip-permissions`
- Add test: "does not add --dangerously-skip-permissions"
- Update writeConfig tests to use new SetupOpts shape

- [ ] **Step 6: Run tests**

Run: `pnpm --filter @opentidy/backend test -- src/shared/agents/claude.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/types.ts apps/backend/src/shared/agents/
git commit -m "refactor(backend): replace skipPermissions with allowedTools in Claude adapter"
```

---

### Task 10: Update session launch

**Files:**
- Modify: `apps/backend/src/features/sessions/launch.ts:253-277`
- Modify: `apps/backend/src/features/sessions/launch.test.ts`

- [ ] **Step 1: Update buildAgentCommand**

Replace `skipPermissions: true` with `allowedTools` from permission resolver:

```typescript
function buildAgentCommand(
  workspaceDir: string,
  taskDir: string,
  adapter: AgentAdapter,
  allowedTools: string[],
  instruction?: string,
  resumeId?: string,
): string {
  const pluginDir = path.resolve(workspaceDir, '..', 'plugins', 'opentidy-hooks');
  const pluginDirExists = fs.existsSync(pluginDir);

  const args = adapter.buildArgs({
    mode: 'interactive',
    cwd: taskDir,
    allowedTools,
    instruction,
    resumeSessionId: resumeId,
    pluginDir: pluginDirExists ? pluginDir : undefined,
  });

  // ... rest unchanged
}
```

- [ ] **Step 2: Pass allowedTools from launcher deps**

The `launchSession` function needs access to the permission resolver. Add to launcher deps:

```typescript
getAllowedTools: () => string[];
```

Pass `deps.getAllowedTools()` to `buildAgentCommand()`.

- [ ] **Step 3: Update launch tests**

Update mocks to no longer expect `--dangerously-skip-permissions`. Expect `--allowedTools` instead.

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @opentidy/backend test -- src/features/sessions/launch.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/features/sessions/
git commit -m "refactor(backend): use allowedTools instead of skipPermissions in session launch"
```

---

### Task 11: Remove old guardrails system

**Files:**
- Modify: `plugins/opentidy-hooks/guardrails.json` — replace content with deprecation notice
- Modify: `packages/shared/src/types.ts` — mark GuardrailRule as deprecated
- Modify: `apps/backend/src/features/hooks/handler.ts` — update PreToolUse handler

- [ ] **Step 1: Deprecate GuardrailRule type**

In `packages/shared/src/types.ts`, add `@deprecated` to GuardrailRule:

```typescript
/** @deprecated Replaced by module toolPermissions + PermissionConfig */
export interface GuardrailRule {
```

- [ ] **Step 2: Update guardrails.json**

Replace `plugins/opentidy-hooks/guardrails.json` with lifecycle-only rules (remove pre-tool prompt hooks):

```json
{
  "rules": [
    {
      "event": "post-tool",
      "type": "http",
      "match": "*",
      "url": "http://localhost:5175/api/hooks"
    },
    {
      "event": "stop",
      "type": "command",
      "match": "*",
      "command": "OPENTIDY_WORKSPACE=${OPENTIDY_WORKSPACE:-$PWD/workspace} OPENTIDY_PORT=${OPENTIDY_PORT:-5175} $PWD/apps/backend/scripts/on-stop.sh"
    },
    {
      "event": "session-end",
      "type": "http",
      "match": "*",
      "url": "http://localhost:5175/api/hooks"
    }
  ]
}
```

Note: This file is kept for backward compatibility with the plugin system but the PreToolUse prompt hooks are removed. The new permission system generates hooks.json dynamically via `writeConfig()`.

- [ ] **Step 3: Commit**

```bash
git add plugins/opentidy-hooks/guardrails.json packages/shared/src/types.ts
git commit -m "refactor: deprecate old guardrails system, remove mini-Claude hooks"
```

---

### Task 12: Permission config API route (for setup + settings)

**Files:**
- Create: `apps/backend/src/features/permissions/config-route.ts`

- [ ] **Step 1: Create config route**

```typescript
// apps/backend/src/features/permissions/config-route.ts
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { Hono } from 'hono';
import { PermissionConfigSchema } from '@opentidy/shared';
import type { PermissionConfig, PermissionPreset, PermissionLevel, ModuleManifest } from '@opentidy/shared';

const PRESET_DEFAULTS: Record<PermissionPreset, PermissionLevel> = {
  'supervised': 'ask',
  'autonomous': 'confirm',
  'full-auto': 'allow',
};

interface ConfigRouteDeps {
  loadConfig: () => { permissions: PermissionConfig };
  saveConfig: (update: (config: Record<string, unknown>) => void) => void;
  manifests: Map<string, ModuleManifest>;
}

export function permissionConfigRoute(deps: ConfigRouteDeps) {
  const router = new Hono();

  // GET /permissions/config — current config + available modules with their tool info
  router.get('/permissions/config', (c) => {
    const config = deps.loadConfig();
    const modules = Array.from(deps.manifests.values())
      .filter(m => m.toolPermissions)
      .map(m => ({
        name: m.name,
        label: m.label,
        icon: m.icon,
        toolPermissions: m.toolPermissions,
      }));
    return c.json({ permissions: config.permissions, modules });
  });

  // PUT /permissions/config — update config (preset or per-module overrides)
  router.put('/permissions/config', async (c) => {
    const body = await c.req.json();
    const parsed = PermissionConfigSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: parsed.error.message }, 400);
    }
    deps.saveConfig((cfg: Record<string, unknown>) => {
      cfg.permissions = parsed.data;
    });
    return c.json({ ok: true });
  });

  // POST /permissions/preset — apply a preset (resets all modules to preset default)
  router.post('/permissions/preset', async (c) => {
    const { preset } = await c.req.json() as { preset: PermissionPreset };
    const defaultLevel = PRESET_DEFAULTS[preset];
    if (!defaultLevel) return c.json({ error: 'invalid preset' }, 400);

    const modules: Record<string, PermissionLevel> = {};
    for (const [, manifest] of deps.manifests) {
      if (manifest.toolPermissions) {
        modules[manifest.name] = defaultLevel;
      }
    }

    deps.saveConfig((cfg: Record<string, unknown>) => {
      cfg.permissions = { preset, defaultLevel, modules };
    });

    return c.json({ ok: true, permissions: { preset, defaultLevel, modules } });
  });

  return router;
}
```

- [ ] **Step 2: Mount in server.ts**

```typescript
import { permissionConfigRoute } from './features/permissions/config-route';
app.route('/api', permissionConfigRoute({ loadConfig: deps.loadConfig, saveConfig: deps.saveConfig, manifests: deps.manifests }));
```

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/features/permissions/config-route.ts apps/backend/src/server.ts
git commit -m "feat(backend): add permission config API routes (GET/PUT config, POST preset)"
```

---

### Task 13: Setup wizard — permissions mode step

**Files:**
- Create: `apps/web/src/features/setup/PermissionsModeStep.tsx`
- Modify: `apps/web/src/features/setup/SetupWizard.tsx`
- Modify: `apps/web/src/shared/i18n/locales/en.json`
- Modify: `apps/web/src/shared/i18n/locales/fr.json`

- [ ] **Step 1: Add i18n keys**

In `en.json`, add to `setup` namespace:

```json
"permissionsMode": "Security Mode",
"permissionsModeDesc": "Choose how OpenTidy handles sensitive actions (sending emails, browser interactions, payments).",
"presetSupervised": "Supervised",
"presetSupervisedDesc": "You validate every action from the web terminal. Maximum control.",
"presetAutonomous": "Autonomous",
"presetAutonomousDesc": "The agent works freely but asks your approval for critical actions via notification.",
"presetFullAuto": "Full Auto",
"presetFullAutoDesc": "The agent does everything. You review the audit log afterwards."
```

Same in `fr.json` with French translations.

- [ ] **Step 2: Create PermissionsModeStep component**

```tsx
// apps/web/src/features/setup/PermissionsModeStep.tsx
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PermissionPreset } from '@opentidy/shared';
import { api } from '../../shared/api';

const PRESETS: Array<{ key: PermissionPreset; icon: string }> = [
  { key: 'supervised', icon: '🛡️' },
  { key: 'autonomous', icon: '🤖' },
  { key: 'full-auto', icon: '🚀' },
];

interface Props {
  onNext: () => void;
}

export default function PermissionsModeStep({ onNext }: Props) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<PermissionPreset>('autonomous');
  const [saving, setSaving] = useState(false);

  async function handleContinue() {
    setSaving(true);
    await api.post('/api/permissions/preset', { preset: selected });
    setSaving(false);
    onNext();
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">{t('setup.permissionsMode')}</h2>
        <p className="text-muted-foreground mt-1">{t('setup.permissionsModeDesc')}</p>
      </div>

      <div className="grid gap-4">
        {PRESETS.map(({ key, icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setSelected(key)}
            className={`p-4 rounded-lg border text-left transition-colors ${
              selected === key
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50'
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">{icon}</span>
              <div>
                <div className="font-medium">
                  {t(`setup.preset${key.charAt(0).toUpperCase() + key.slice(1).replace('-', '')}`)}
                </div>
                <div className="text-sm text-muted-foreground">
                  {t(`setup.preset${key.charAt(0).toUpperCase() + key.slice(1).replace('-', '')}Desc`)}
                </div>
              </div>
            </div>
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={handleContinue}
        disabled={saving}
        className="btn btn-primary w-full"
      >
        {t('setup.continue')}
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Add step to SetupWizard**

In `SetupWizard.tsx`, add `'permissions-mode'` to `STEPS` array after `'permissions'`:

```typescript
const STEPS = ['user-info', 'agent', 'permissions', 'permissions-mode', 'modules', 'done'] as const;
```

Add the case in the step renderer to render `<PermissionsModeStep />`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/features/setup/ apps/web/src/shared/i18n/
git commit -m "feat(web): add permissions mode step to setup wizard"
```

---

### Task 14: Settings UI — permissions panel

**Files:**
- Create: `apps/web/src/features/settings/PermissionsPanel.tsx`
- Modify: `apps/web/src/features/settings/Settings.tsx`

- [ ] **Step 1: Add i18n keys for settings**

In `en.json` `settings` namespace:

```json
"permissionsTitle": "Permissions",
"permissionsDesc": "Control how the agent handles sensitive actions for each module.",
"preset": "Preset",
"perModule": "Per module",
"level.allow": "Allow",
"level.confirm": "Confirm",
"level.ask": "Ask",
"scope.per-call": "Each time",
"scope.per-task": "Once per task"
```

Same in `fr.json`.

- [ ] **Step 2: Create PermissionsPanel component**

```tsx
// apps/web/src/features/settings/PermissionsPanel.tsx
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../shared/api';
import type { PermissionConfig, PermissionLevel, PermissionPreset, ToolPermissions } from '@opentidy/shared';

interface ModulePermissionInfo {
  name: string;
  label: string;
  icon?: string;
  toolPermissions: ToolPermissions;
}

const PRESETS: PermissionPreset[] = ['supervised', 'autonomous', 'full-auto'];
const LEVELS: PermissionLevel[] = ['allow', 'confirm', 'ask'];

export default function PermissionsPanel() {
  const { t } = useTranslation();
  const [config, setConfig] = useState<PermissionConfig | null>(null);
  const [modules, setModules] = useState<ModulePermissionInfo[]>([]);

  useEffect(() => {
    api.get('/api/permissions/config').then(res => res.json()).then(data => {
      setConfig(data.permissions);
      setModules(data.modules);
    });
  }, []);

  async function handlePreset(preset: PermissionPreset) {
    const res = await api.post('/api/permissions/preset', { preset });
    const data = await res.json();
    setConfig(data.permissions);
  }

  async function handleModuleLevel(moduleName: string, level: PermissionLevel) {
    if (!config) return;
    const updated = {
      ...config,
      preset: 'autonomous' as PermissionPreset, // custom = reset preset indicator
      modules: { ...config.modules, [moduleName]: level },
    };
    await api.put('/api/permissions/config', updated);
    setConfig(updated);
  }

  if (!config) return null;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold">{t('settings.permissionsTitle')}</h3>
        <p className="text-sm text-muted-foreground">{t('settings.permissionsDesc')}</p>
      </div>

      {/* Preset buttons */}
      <div className="flex gap-2">
        {PRESETS.map(preset => (
          <button
            key={preset}
            type="button"
            onClick={() => handlePreset(preset)}
            className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
              config.preset === preset
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border hover:border-primary/50'
            }`}
          >
            {t(`setup.preset${preset.charAt(0).toUpperCase() + preset.slice(1).replace('-', '')}`)}
          </button>
        ))}
      </div>

      {/* Per-module grid */}
      <div className="border rounded-lg divide-y divide-border">
        {modules.map(mod => (
          <div key={mod.name} className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              {mod.icon && <span className="text-xl">{mod.icon}</span>}
              <div>
                <div className="font-medium">{mod.label}</div>
                <div className="text-xs text-muted-foreground">
                  {t(`settings.scope.${mod.toolPermissions.scope}`)}
                  {' · '}
                  {mod.toolPermissions.critical.length} {t('settings.criticalTools', { count: mod.toolPermissions.critical.length })}
                </div>
              </div>
            </div>

            <div className="flex gap-1">
              {LEVELS.map(level => (
                <button
                  key={level}
                  type="button"
                  onClick={() => handleModuleLevel(mod.name, level)}
                  className={`px-3 py-1.5 rounded text-sm transition-colors ${
                    (config.modules[mod.name] ?? config.defaultLevel) === level
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted hover:bg-muted/80'
                  }`}
                >
                  {t(`settings.level.${level}`)}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Add PermissionsPanel to Settings page**

In `apps/web/src/features/settings/Settings.tsx`:

```tsx
import PermissionsPanel from './PermissionsPanel';

export default function Settings() {
  return (
    <div className="p-6 md:p-8 space-y-8 overflow-y-auto h-full">
      <PermissionsPanel />
      <div className="border-t border-border pt-8">
        <SecurityPanel />
      </div>
      <div className="border-t border-border pt-8">
        <ServiceControlPanel />
      </div>
      <div className="border-t border-border pt-8">
        <DangerZonePanel />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/features/settings/ apps/web/src/shared/i18n/
git commit -m "feat(web): add permissions panel to settings page"
```

---

### Task 15: Wire everything in backend bootstrap

**Files:**
- Modify: `apps/backend/src/index.ts`

- [ ] **Step 1: Create and wire permission services in boot**

In `apps/backend/src/index.ts`, after config load:

```typescript
import { createPermissionState } from './features/permissions/state';
import { createApprovalManager } from './features/permissions/approval';
import { createPermissionChecker } from './features/permissions/check';

// After config and manifests are loaded:
const permissionState = createPermissionState();
const approvalManager = createApprovalManager({
  sendConfirmation: async (approvalId, taskId, toolName, toolInput, moduleName) => {
    const summary = `${moduleName ?? 'unknown'}: ${toolName}`;
    const text = `🔔 Task ${taskId} requests permission\n${summary}\n\nApprove: ${config.server.appBaseUrl}/api/permissions/${approvalId}/approve\nDeny: ${config.server.appBaseUrl}/api/permissions/${approvalId}/deny`;
    await notifier.notifyAction(taskId, text);
  },
});
const permissionChecker = createPermissionChecker({
  manifests,
  loadConfig: () => loadConfig(getConfigPath()).permissions,
  state: permissionState,
  requestApproval: (opts) => approvalManager.requestApproval(opts),
  audit,
});
```

- [ ] **Step 2: Pass to server deps**

Add `permissionChecker`, `approvalManager`, and permission resolver to the deps object passed to the server.

- [ ] **Step 3: Clean up session end — revoke per-task grants + cancel pending approvals**

In the session end handler, add:

```typescript
permissionState.revokeTask(taskId);
approvalManager.cancelTask(taskId);
```

- [ ] **Step 4: Run full test suite**

Run: `pnpm test`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/index.ts apps/backend/src/server.ts
git commit -m "feat(backend): wire permission system in boot and server"
```

---

### Task 16: Update docs

**Files:**
- Modify: `docs/security.md` — already updated earlier in this conversation
- Modify: `docs/specification.md` — already updated earlier in this conversation
- Modify: `CLAUDE.md` — update permission model description

- [ ] **Step 1: Update CLAUDE.md guardrails section**

Replace references to `--dangerously-skip-permissions` and mini-Claude hooks with the new permission system description.

- [ ] **Step 2: Commit**

```bash
git add docs/ CLAUDE.md
git commit -m "docs: update security and spec docs for unified permission system"
```

---

### Summary

| Task | Description | New files | Modified files |
|------|-------------|-----------|---------------|
| 1 | Shared types & schemas | — | 2 |
| 2 | Module manifest toolPermissions | — | 5 |
| 3 | Permission state (per-task grants) | 2 | — |
| 4 | Permission resolver (manifest lookup) | 2 | — |
| 5 | Permission check endpoint | 3 | — |
| 6 | Permission check HTTP route | 1 | 1 |
| 7 | Approval manager | 2 | — |
| 8 | Approval response routes | 1 | 1 |
| 9 | Update Claude adapter | — | 3 |
| 10 | Update session launch | — | 2 |
| 11 | Remove old guardrails | — | 3 |
| 12 | Permission config API | 1 | 1 |
| 13 | Setup wizard step | 1 | 3 |
| 14 | Settings UI panel | 1 | 3 |
| 15 | Wire in bootstrap | — | 2 |
| 16 | Update docs | — | 3 |
