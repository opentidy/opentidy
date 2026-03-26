# WhatsApp Baileys + Daemon Module System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the WhatsApp module from wacli/whatsapp-mcp to Baileys (in-process) and introduce the daemon module primitive to the module system.

**Architecture:** The daemon is a new module capability: a long-running in-process function that can both emit events (receiver) AND register MCP tools on the shared HTTP server. The WhatsApp module uses it to manage a single Baileys connection that handles receiving, querying, and sending.

**Tech Stack:** TypeScript, @whiskeysockets/baileys, better-sqlite3, @modelcontextprotocol/sdk, Vitest

**Spec:** `docs/superpowers/specs/2026-03-22-whatsapp-baileys-daemon-design.md`

---

## File Structure

### New files
| File | Responsibility |
|------|---------------|
| `apps/backend/src/features/modules/daemon.ts` | `createModuleContext()` factory |
| `apps/backend/src/features/modules/daemon.test.ts` | Tests for createModuleContext |
| `apps/backend/src/features/mcp-server/dynamic-tools.ts` | DynamicToolRegistry |
| `apps/backend/src/features/mcp-server/dynamic-tools.test.ts` | Tests for DynamicToolRegistry |
| `apps/backend/src/features/modules/restart.ts` | `POST /api/modules/:name/restart` route |
| `apps/backend/modules/whatsapp/daemon.ts` | Baileys connection + SQLite store + receiver + MCP tools |
| `apps/backend/modules/whatsapp/daemon.test.ts` | Tests for WhatsApp daemon |
| `apps/backend/modules/whatsapp/auth.js` | Standalone QR auth script |

### Modified files
| File | Change |
|------|--------|
| `packages/shared/src/types.ts` | Add `daemon` to `ModuleManifest`, add `ModuleContext`, `ToolSchema`, `ToolHandler`, `ModuleLogger` types |
| `packages/shared/src/schemas.ts` | Add `DaemonDefSchema` to `ModuleManifestSchema` |
| `apps/backend/src/features/modules/lifecycle.ts` | Handle daemon start/stop/restart with crash recovery + backoff |
| `apps/backend/src/features/modules/lifecycle.test.ts` | Tests for daemon lifecycle (start, stop, restart, crash recovery) |
| `apps/backend/src/features/modules/types.ts` | Add `restartDaemon` to `ModuleRouteDeps.lifecycle` |
| `apps/backend/src/features/mcp-server/server.ts` | Accept DynamicToolRegistry, merge dynamic tools in `registerAllTools()` |
| `apps/backend/src/shared/agent-config.ts` | Generate `mcp__opentidy__*` permissions for daemon tools |
| `apps/backend/src/index.ts` | Create DynamicToolRegistry, pass to lifecycle + MCP server, start daemons at boot |
| `apps/backend/src/server.ts` | Import + mount restart route |
| `apps/backend/modules/whatsapp/module.json` | Replace with daemon-based manifest |
| `apps/backend/modules/whatsapp/receiver.ts` | Delete (replaced by daemon) |
| `apps/backend/package.json` | Add `@whiskeysockets/baileys` |
| `CLAUDE.md` | Update module system docs, remove wacli references |
| `docs/specification.md` | Add daemon concept |
| `docs/contributing.md` | Add "Creating a daemon module" section |
| `docs/architecture.md` | Add daemon module pattern |

---

## Task 1: Shared types for daemon + ModuleContext

**Files:**
- Modify: `packages/shared/src/types.ts:286-305`
- Modify: `packages/shared/src/schemas.ts:186-210`
- Test: `packages/shared/tests/schemas.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `packages/shared/tests/schemas.test.ts`:

```typescript
describe('ModuleManifestSchema daemon', () => {
  it('accepts manifest with daemon field', () => {
    const manifest = {
      name: 'test-daemon',
      label: 'Test Daemon',
      description: 'A test daemon module',
      version: '1.0.0',
      daemon: { entry: './daemon.ts' },
    };
    const result = ModuleManifestSchema.safeParse(manifest);
    expect(result.success).toBe(true);
  });

  it('rejects daemon with missing entry', () => {
    const manifest = {
      name: 'test-daemon',
      label: 'Test Daemon',
      description: 'A test daemon module',
      version: '1.0.0',
      daemon: {},
    };
    const result = ModuleManifestSchema.safeParse(manifest);
    expect(result.success).toBe(false);
  });

  it('accepts manifest without daemon field', () => {
    const manifest = {
      name: 'test',
      label: 'Test',
      description: 'No daemon',
      version: '1.0.0',
    };
    const result = ModuleManifestSchema.safeParse(manifest);
    expect(result.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @opentidy/shared test -- --run`
Expected: FAIL because `daemon` field not in schema

- [ ] **Step 3: Add types to `packages/shared/src/types.ts`**

After the `ModuleManifest` interface (line ~305), add:

```typescript
export interface DaemonDef {
  entry: string;
}
```

Add `daemon?: DaemonDef;` to `ModuleManifest` interface after `setup`.

Add after `ReceiverEvent`:

```typescript
export interface ToolSchema {
  description: string;
  inputSchema: Record<string, unknown>;
}

export type ToolHandler = (input: Record<string, unknown>) => Promise<unknown>;

export interface ModuleLogger {
  log(msg: string, ...args: unknown[]): void;
  warn(msg: string, ...args: unknown[]): void;
  error(msg: string, ...args: unknown[]): void;
}

export interface ModuleContext {
  config: Record<string, unknown>;
  dataDir: string;
  emit(event: ReceiverEvent): void;
  registerTool(name: string, schema: ToolSchema, handler: ToolHandler): void;
  logger: ModuleLogger;
  onShutdown(fn: () => void | Promise<void>): void;
}
```

- [ ] **Step 4: Add Zod schema to `packages/shared/src/schemas.ts`**

Before `ModuleManifestSchema`:

```typescript
const DaemonDefSchema = z.object({
  entry: z.string().min(1),
});
```

Add to `ModuleManifestSchema`:

```typescript
daemon: DaemonDefSchema.optional(),
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @opentidy/shared test -- --run`
Expected: PASS

- [ ] **Step 6: Build shared package**

Run: `pnpm --filter @opentidy/shared build`
Expected: Build succeeds

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/types.ts packages/shared/src/schemas.ts packages/shared/tests/schemas.test.ts
git commit -m "feat(shared): add daemon module types and ModuleContext interface"
```

---

## Task 2: Dynamic tool registry in MCP server

**Files:**
- Modify: `apps/backend/src/features/mcp-server/server.ts`
- Create: `apps/backend/src/features/mcp-server/dynamic-tools.ts`
- Create: `apps/backend/src/features/mcp-server/dynamic-tools.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/backend/src/features/mcp-server/dynamic-tools.test.ts`:

```typescript
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect } from 'vitest';
import { createDynamicToolRegistry } from './dynamic-tools.js';

describe('DynamicToolRegistry', () => {
  it('registers and retrieves a tool', () => {
    const registry = createDynamicToolRegistry();
    const handler = async () => ({ ok: true });
    registry.register('test_tool', { description: 'A test', inputSchema: { type: 'object' } }, handler);

    const tools = registry.listAll();
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe('test_tool');
  });

  it('unregisters a tool', () => {
    const registry = createDynamicToolRegistry();
    registry.register('tool_a', { description: 'A', inputSchema: {} }, async () => ({}));
    registry.unregister('tool_a');
    expect(registry.listAll()).toHaveLength(0);
  });

  it('executes a tool handler and normalizes result to MCP format', async () => {
    const registry = createDynamicToolRegistry();
    registry.register('my_tool', { description: 'Test', inputSchema: {} }, async (input) => {
      return { count: input.n };
    });
    const result = await registry.execute('my_tool', { n: 42 });
    expect(result.content).toEqual([{ type: 'text', text: JSON.stringify({ count: 42 }) }]);
  });

  it('throws on execute of unknown tool', async () => {
    const registry = createDynamicToolRegistry();
    await expect(registry.execute('nope', {})).rejects.toThrow('Unknown dynamic tool: nope');
  });

  it('unregisterAll removes all tools for a prefix', () => {
    const registry = createDynamicToolRegistry();
    registry.register('whatsapp_list', { description: '', inputSchema: {} }, async () => ({}));
    registry.register('whatsapp_send', { description: '', inputSchema: {} }, async () => ({}));
    registry.register('telegram_send', { description: '', inputSchema: {} }, async () => ({}));
    registry.unregisterAll('whatsapp_');
    const tools = registry.listAll();
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe('telegram_send');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @opentidy/backend test -- --run dynamic-tools`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement `dynamic-tools.ts`**

Create `apps/backend/src/features/mcp-server/dynamic-tools.ts`:

```typescript
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import type { ToolSchema, ToolHandler } from '@opentidy/shared';

interface RegisteredTool {
  name: string;
  schema: ToolSchema;
  handler: ToolHandler;
}

interface McpToolResult {
  content: Array<{ type: string; text: string }>;
}

export interface DynamicToolRegistry {
  register(name: string, schema: ToolSchema, handler: ToolHandler): void;
  unregister(name: string): void;
  unregisterAll(prefix: string): void;
  listAll(): RegisteredTool[];
  execute(name: string, input: Record<string, unknown>): Promise<McpToolResult>;
  has(name: string): boolean;
}

export function createDynamicToolRegistry(): DynamicToolRegistry {
  const tools = new Map<string, RegisteredTool>();

  return {
    register(name, schema, handler) {
      tools.set(name, { name, schema, handler });
    },
    unregister(name) {
      tools.delete(name);
    },
    unregisterAll(prefix) {
      for (const key of [...tools.keys()]) {
        if (key.startsWith(prefix)) tools.delete(key);
      }
    },
    listAll() {
      return [...tools.values()];
    },
    async execute(name, input) {
      const tool = tools.get(name);
      if (!tool) throw new Error(`Unknown dynamic tool: ${name}`);
      const result = await tool.handler(input);
      // Normalize to MCP SDK format
      const text = typeof result === 'string' ? result : JSON.stringify(result);
      return { content: [{ type: 'text', text }] };
    },
    has(name) {
      return tools.has(name);
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @opentidy/backend test -- --run dynamic-tools`
Expected: PASS

- [ ] **Step 5: Wire into MCP server**

Modify `apps/backend/src/features/mcp-server/server.ts`:

Add to `McpServerDeps`:
```typescript
dynamicToolRegistry?: DynamicToolRegistry;
```

In `registerAllTools()`, after existing static tool registrations, add:
```typescript
// Register dynamic tools from daemon modules
if (deps.dynamicToolRegistry) {
  for (const tool of deps.dynamicToolRegistry.listAll()) {
    server.tool(tool.name, tool.schema.description, tool.schema.inputSchema, async (input) => {
      return deps.dynamicToolRegistry!.execute(tool.name, input.arguments ?? {});
    });
  }
}
```

- [ ] **Step 6: Run all MCP server tests**

Run: `pnpm --filter @opentidy/backend test -- --run mcp-server`
Expected: PASS (existing tests unaffected)

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/features/mcp-server/dynamic-tools.ts apps/backend/src/features/mcp-server/dynamic-tools.test.ts apps/backend/src/features/mcp-server/server.ts
git commit -m "feat(backend): add dynamic tool registry for daemon modules"
```

---

## Task 3: createModuleContext factory

**Files:**
- Create: `apps/backend/src/features/modules/daemon.ts`
- Create: `apps/backend/src/features/modules/daemon.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/backend/src/features/modules/daemon.test.ts`:

```typescript
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createModuleContext } from './daemon.js';
import { createDynamicToolRegistry } from '../mcp-server/dynamic-tools.js';

describe('createModuleContext', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'opentidy-daemon-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates dataDir on initialization', () => {
    const registry = createDynamicToolRegistry();
    const ctx = createModuleContext('test-mod', {}, () => {}, registry, tmpDir);
    const { existsSync } = require('fs');
    expect(existsSync(ctx.dataDir)).toBe(true);
    expect(ctx.dataDir).toBe(join(tmpDir, 'test-mod'));
  });

  it('emit forwards ReceiverEvent to callback', () => {
    const registry = createDynamicToolRegistry();
    const emitFn = vi.fn();
    const ctx = createModuleContext('test-mod', {}, emitFn, registry, tmpDir);
    ctx.emit({ source: 'test', content: 'hello', metadata: {} });
    expect(emitFn).toHaveBeenCalledWith({ source: 'test', content: 'hello', metadata: {} });
  });

  it('registerTool adds tool to dynamic registry', () => {
    const registry = createDynamicToolRegistry();
    const ctx = createModuleContext('test-mod', {}, () => {}, registry, tmpDir);
    ctx.registerTool('test_tool', { description: 'A test', inputSchema: {} }, async () => ({}));
    expect(registry.has('test_tool')).toBe(true);
  });

  it('logger prefixes messages with module name', () => {
    const registry = createDynamicToolRegistry();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const ctx = createModuleContext('mymod', {}, () => {}, registry, tmpDir);
    ctx.logger.log('hello');
    expect(logSpy).toHaveBeenCalledWith('[mymod]', 'hello');
    logSpy.mockRestore();
  });

  it('runShutdownHandlers calls all registered handlers', async () => {
    const registry = createDynamicToolRegistry();
    const ctx = createModuleContext('test-mod', {}, () => {}, registry, tmpDir);
    const fn1 = vi.fn();
    const fn2 = vi.fn();
    ctx.onShutdown(fn1);
    ctx.onShutdown(fn2);
    await ctx.runShutdownHandlers();
    expect(fn1).toHaveBeenCalled();
    expect(fn2).toHaveBeenCalled();
  });

  it('unregisterAllTools removes all tools registered by this context', () => {
    const registry = createDynamicToolRegistry();
    const ctx = createModuleContext('test-mod', {}, () => {}, registry, tmpDir);
    ctx.registerTool('test_a', { description: '', inputSchema: {} }, async () => ({}));
    ctx.registerTool('test_b', { description: '', inputSchema: {} }, async () => ({}));
    ctx.unregisterAllTools();
    expect(registry.listAll()).toHaveLength(0);
  });

  it('passes config through', () => {
    const registry = createDynamicToolRegistry();
    const cfg = { apiKey: 'abc' };
    const ctx = createModuleContext('test-mod', cfg, () => {}, registry, tmpDir);
    expect(ctx.config).toBe(cfg);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @opentidy/backend test -- --run daemon.test`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement `daemon.ts`**

Create `apps/backend/src/features/modules/daemon.ts`:

```typescript
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { mkdirSync } from 'fs';
import { join } from 'path';
import type { ReceiverEvent, ModuleContext } from '@opentidy/shared';
import type { DynamicToolRegistry } from '../mcp-server/dynamic-tools.js';

export interface InternalModuleContext extends ModuleContext {
  runShutdownHandlers(): Promise<void>;
  unregisterAllTools(): void;
}

export function createModuleContext(
  name: string,
  moduleConfig: Record<string, unknown>,
  emitToTriage: (event: ReceiverEvent) => void,
  dynamicToolRegistry: DynamicToolRegistry,
  modulesDataBaseDir: string,
): InternalModuleContext {
  const dataDir = join(modulesDataBaseDir, name);
  mkdirSync(dataDir, { recursive: true });

  const shutdownHandlers: Array<() => void | Promise<void>> = [];
  const registeredTools: string[] = [];

  return {
    config: moduleConfig,
    dataDir,
    emit: emitToTriage,
    registerTool(toolName, schema, handler) {
      dynamicToolRegistry.register(toolName, schema, handler);
      registeredTools.push(toolName);
    },
    logger: {
      log: (msg: string, ...args: unknown[]) => console.log(`[${name}]`, msg, ...args),
      warn: (msg: string, ...args: unknown[]) => console.warn(`[${name}]`, msg, ...args),
      error: (msg: string, ...args: unknown[]) => console.error(`[${name}]`, msg, ...args),
    },
    onShutdown(fn) {
      shutdownHandlers.push(fn);
    },
    async runShutdownHandlers() {
      for (const fn of shutdownHandlers) await fn();
    },
    unregisterAllTools() {
      for (const t of registeredTools) dynamicToolRegistry.unregister(t);
      registeredTools.length = 0;
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @opentidy/backend test -- --run daemon.test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/features/modules/daemon.ts apps/backend/src/features/modules/daemon.test.ts
git commit -m "feat(backend): add createModuleContext factory for daemon modules"
```

---

## Task 4: Daemon lifecycle integration

**Files:**
- Modify: `apps/backend/src/features/modules/lifecycle.ts`
- Modify: `apps/backend/src/features/modules/lifecycle.test.ts`
- Modify: `apps/backend/src/features/modules/types.ts`

- [ ] **Step 1: Write the failing tests**

Add to `apps/backend/src/features/modules/lifecycle.test.ts`:

```typescript
describe('daemon lifecycle', () => {
  it('starts daemon when module with daemon.entry is enabled', async () => {
    // Setup manifests with daemon entry, mock dynamic import
    // Verify mod.start(ctx) called, activeReceivers has key
  });

  it('skips receivers when module has daemon.entry', async () => {
    // Module with both daemon and receivers → startReceivers returns early
  });

  it('stops daemon on disable, calls stop() and unregisters tools', async () => {
    // Enable daemon module, then disable
    // Verify mod.stop() called, dynamic tools unregistered
  });

  it('stopAll() stops running daemons', async () => {
    // Enable daemon module, call stopAll()
    // Verify mod.stop() called
  });

  it('restartDaemon stops then restarts', async () => {
    // Enable daemon module, call restartDaemon
    // Verify stop called then start called again
  });

  it('retries daemon start with backoff on crash (max 5 attempts)', async () => {
    // Mock daemon start() to throw 6 times
    // Verify it retried 5 times then set health to error
    // Verify SSE module:error emitted
  });

  it('sets module health to error after max retries', async () => {
    // After 5 failed starts, config.modules[name].health === 'error'
  });

  it('enable() does not throw when daemon entry does not exist', async () => {
    // Graceful error on missing file
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @opentidy/backend test -- --run lifecycle.test`
Expected: FAIL

- [ ] **Step 3: Add daemon support to lifecycle.ts**

Add to `ModuleLifecycleDeps`:
```typescript
dynamicToolRegistry?: DynamicToolRegistry;
modulesDataBaseDir?: string;
```

Add imports:
```typescript
import { createModuleContext, type InternalModuleContext } from './daemon.js';
import type { DynamicToolRegistry } from '../mcp-server/dynamic-tools.js';
```

Implement `startDaemon` with crash recovery:

```typescript
const DAEMON_MAX_RETRIES = 5;
const DAEMON_RETRY_BASE_MS = 2_000;

async function startDaemon(name: string, retryCount = 0): Promise<void> {
  const manifest = manifests.get(name);
  if (!manifest?.daemon?.entry) return;
  if (!deps.dynamicToolRegistry) {
    console.warn(`[modules] Cannot start daemon for ${name}: no dynamic tool registry`);
    return;
  }

  const config = loadConfig();
  const moduleConfig = config.modules[name]?.config ?? {};
  const key = `${name}:daemon`;

  try {
    const entryPath = manifest.daemon.entry.startsWith('.') && deps.modulesBaseDir
      ? join(deps.modulesBaseDir, name, manifest.daemon.entry)
      : manifest.daemon.entry;
    const mod = await import(entryPath);

    const emit = (receiverEvent: ReceiverEvent): void => {
      // Same emit wrapper as existing receivers (dedup + triage)
      const appEvent: AppEvent = {
        id: crypto.randomUUID(),
        source: receiverEvent.source as AppEvent['source'],
        content: receiverEvent.content,
        timestamp: new Date().toISOString(),
        metadata: receiverEvent.metadata,
        contentHash: '',
      };
      if (dedup) {
        if (dedup.isDuplicate(appEvent.content)) return;
        dedup.record(appEvent.content);
      }
      triageHandler?.(appEvent).catch((err: unknown) => {
        console.error(`[modules] triageHandler error for ${key}:`, (err as Error).message);
      });
    };

    const modulesDataDir = deps.modulesDataBaseDir
      || join(process.env.HOME || '', '.config', 'opentidy', 'modules');
    const ctx = createModuleContext(name, moduleConfig, emit, deps.dynamicToolRegistry, modulesDataDir);
    await mod.start(ctx);

    activeReceivers.set(key, {
      stop: async () => {
        await mod.stop();
        await ctx.runShutdownHandlers();
        ctx.unregisterAllTools();
      },
    });
    console.log(`[modules] Started daemon ${key}`);
  } catch (err) {
    console.error(`[modules] Failed to start daemon ${key}:`, (err as Error).message);

    if (retryCount < DAEMON_MAX_RETRIES) {
      const delay = DAEMON_RETRY_BASE_MS * Math.pow(2, retryCount);
      console.warn(`[modules] Retrying daemon ${key} in ${delay}ms (attempt ${retryCount + 1}/${DAEMON_MAX_RETRIES})`);
      setTimeout(() => startDaemon(name, retryCount + 1), delay);
    } else {
      console.error(`[modules] Daemon ${key} failed after ${DAEMON_MAX_RETRIES} attempts`);
      // Set module health to error
      const cfg = loadConfig();
      if (cfg.modules[name]) {
        cfg.modules[name].health = 'error';
        cfg.modules[name].healthError = (err as Error).message;
        cfg.modules[name].healthCheckedAt = new Date().toISOString();
        saveConfig(cfg);
      }
      emitSSE({ type: 'module:error', data: { name, error: (err as Error).message }, timestamp: new Date().toISOString() });
    }
  }
}
```

In `startReceivers()`, skip if daemon:
```typescript
if (manifest?.daemon?.entry) return; // daemon handles receiving
```

In `enable()`, after `startReceivers(name)`:
```typescript
await startDaemon(name);
```

Add `restartDaemon`:
```typescript
async function restartDaemon(name: string): Promise<void> {
  const key = `${name}:daemon`;
  const existing = activeReceivers.get(key);
  if (existing) {
    await existing.stop();
    activeReceivers.delete(key);
  }
  await startDaemon(name);
}
```

Export `restartDaemon` from return object.

- [ ] **Step 4: Add `restartDaemon` to `ModuleRouteDeps` in `types.ts`**

```typescript
lifecycle: {
  // ... existing ...
  restartDaemon?(name: string): Promise<void>;
};
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @opentidy/backend test -- --run lifecycle.test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/features/modules/lifecycle.ts apps/backend/src/features/modules/lifecycle.test.ts apps/backend/src/features/modules/types.ts
git commit -m "feat(backend): add daemon lifecycle with crash recovery and backoff"
```

---

## Task 5: Agent config for daemon tool permissions

**Files:**
- Modify: `apps/backend/src/shared/agent-config.ts:330-370`
- Modify: `apps/backend/src/shared/agent-config.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `apps/backend/src/shared/agent-config.test.ts`:

```typescript
it('generates mcp__opentidy__ permissions for daemon tool permissions', () => {
  const manifests = new Map([['whatsapp', {
    name: 'whatsapp',
    label: 'WhatsApp',
    description: 'Send and receive WhatsApp messages',
    version: '2.0.0',
    daemon: { entry: './daemon.ts' },
    toolPermissions: {
      scope: 'per-call' as const,
      safe: [{ tool: 'whatsapp_list_chats', label: 'List conversations' }],
      critical: [{ tool: 'whatsapp_send_message', label: 'Send messages' }],
    },
  }]]);
  const modules = { whatsapp: { enabled: true, source: 'curated' as const } };
  // Call regenerateAgentConfig or generateSettingsFromModules and check permissions include mcp__opentidy__whatsapp_*
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @opentidy/backend test -- --run agent-config`
Expected: FAIL

- [ ] **Step 3: Add daemon permission handling**

In `regenerateAgentConfig()` (line ~356), in the manifests loop, add handling for daemon modules:

```typescript
// Daemon modules register tools on the opentidy MCP server
if (manifest.daemon?.entry && manifest.toolPermissions) {
  const allTools = [
    ...(manifest.toolPermissions.safe ?? []),
    ...(manifest.toolPermissions.critical ?? []),
  ];
  for (const tool of allTools) {
    modulePermissions.push(`mcp__opentidy__${tool.tool}`);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @opentidy/backend test -- --run agent-config`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/shared/agent-config.ts apps/backend/src/shared/agent-config.test.ts
git commit -m "feat(backend): generate permissions for daemon module tools"
```

---

## Task 6: Restart route + boot wiring

**Files:**
- Create: `apps/backend/src/features/modules/restart.ts`
- Modify: `apps/backend/src/server.ts`
- Modify: `apps/backend/src/index.ts`

- [ ] **Step 1: Create restart route (VSA pattern)**

Create `apps/backend/src/features/modules/restart.ts` following the same pattern as `enable.ts`:

```typescript
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import type { Context } from 'hono';
import type { ModuleRouteDeps } from './types.js';

export function restartModuleRoute(deps: ModuleRouteDeps) {
  return async (c: Context) => {
    const name = c.req.param('name');
    if (!deps.lifecycle.restartDaemon) {
      return c.json({ error: 'Restart not available' }, 501);
    }
    try {
      await deps.lifecycle.restartDaemon(name);
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: (err as Error).message }, 500);
    }
  };
}
```

- [ ] **Step 2: Mount in server.ts**

Import `restartModuleRoute` and add:
```typescript
app.post('/api/modules/:name/restart', authMiddleware, restartModuleRoute(moduleDeps));
```

- [ ] **Step 3: Wire DynamicToolRegistry in index.ts**

In `apps/backend/src/index.ts`, before `createModuleLifecycle()`:

```typescript
import { createDynamicToolRegistry } from './features/mcp-server/dynamic-tools.js';

const dynamicToolRegistry = createDynamicToolRegistry();
```

Pass to `createModuleLifecycle()`:
```typescript
const moduleLifecycle = createModuleLifecycle({
  // ... existing deps ...
  dynamicToolRegistry,
  modulesDataBaseDir: join(openTidyPaths.configDir, 'modules'),
});
```

Pass to `createMcpServer()`:
```typescript
const mcpServer = createMcpServer({
  // ... existing deps ...
  dynamicToolRegistry,
});
```

- [ ] **Step 4: Start daemons at boot**

In `index.ts`, update the boot loop (line ~338) to also start daemons:

```typescript
// Start receivers and daemons for enabled modules
for (const [name, state] of Object.entries(config.modules)) {
  if (state.enabled && manifests.has(name)) {
    moduleLifecycle.startReceivers(name).catch(err => {
      console.error(`[modules] Failed to start receivers for ${name}:`, err);
    });
    // startDaemon is called from enable() but at boot we need to start directly
    // since we don't call enable() for already-enabled modules
  }
}
```

Note: `startDaemon` is already called inside `startReceivers` flow. Add a new exported `startModule(name)` function to lifecycle.ts that calls both `startReceivers` and `startDaemon`, and use that at boot instead.

- [ ] **Step 5: Run backend tests**

Run: `pnpm --filter @opentidy/backend test -- --run`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/features/modules/restart.ts apps/backend/src/server.ts apps/backend/src/index.ts
git commit -m "feat(backend): add restart route and wire daemon system at boot"
```

---

## Task 7: Install Baileys + WhatsApp auth script

**Files:**
- Modify: `apps/backend/package.json`
- Create: `apps/backend/modules/whatsapp/auth.js`

- [ ] **Step 1: Install Baileys**

Run: `cd /Users/lolo/Documents/opentidy && pnpm --filter @opentidy/backend add @whiskeysockets/baileys`

- [ ] **Step 2: Create auth.mjs (ESM, project is ESM-only)**

Create `apps/backend/modules/whatsapp/auth.mjs`:

```javascript
#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { makeWASocket, useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import { join } from 'path';
import { mkdirSync } from 'fs';
import { homedir } from 'os';

const AUTH_DIR = join(
  homedir(),
  '.config', 'opentidy', 'modules', 'whatsapp', 'auth',
);
mkdirSync(AUTH_DIR, { recursive: true });

async function auth() {
  console.log('WhatsApp Authentication');
  console.log('Scan the QR code below with WhatsApp > Linked Devices > Link a Device\n');

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: true,
    browser: ['OpenTidy', 'CLI', '1.0.0'],
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', ({ connection, lastDisconnect }) => {
    if (connection === 'open') {
      console.log('\nWhatsApp connected successfully!');
      console.log(`Auth credentials saved to ${AUTH_DIR}`);
      sock.end();
      process.exit(0);
    }
    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      if (statusCode === DisconnectReason.loggedOut) {
        console.error('Authentication failed. Please try again.');
        process.exit(1);
      }
    }
  });

  setTimeout(() => {
    console.error('\nTimeout: no QR scan within 2 minutes.');
    sock.end();
    process.exit(1);
  }, 120_000);
}

auth().catch((err) => {
  console.error('Auth error:', err.message);
  process.exit(1);
});
```

- [ ] **Step 3: Commit**

Also update `module.json` `authCommand` to `node ./auth.mjs` and `checkCommand` to use dynamic import:
```json
"checkCommand": "node -e \"import('@whiskeysockets/baileys').then(() => process.exit(0)).catch(() => process.exit(1))\""
```

```bash
git add apps/backend/package.json pnpm-lock.yaml apps/backend/modules/whatsapp/auth.mjs
git commit -m "feat(backend): add Baileys dependency and WhatsApp auth script"
```

---

## Task 8: WhatsApp daemon implementation

**Files:**
- Create: `apps/backend/modules/whatsapp/daemon.ts`
- Create: `apps/backend/modules/whatsapp/daemon.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/backend/modules/whatsapp/daemon.test.ts` with tests for:

1. `start()` initializes SQLite schema (3 tables + FTS5)
2. `messages.upsert` (type: notify) → `emit()` called with correct ReceiverEvent
3. `messages.upsert` (type: append) → `emit()` NOT called
4. `messages.upsert` (fromMe) → `emit()` NOT called
5. `whatsapp_list_chats` tool handler returns chats from SQLite
6. `whatsapp_read_messages` tool handler returns messages
7. `whatsapp_search` tool handler searches via FTS5
8. `whatsapp_send_message` tool handler calls `sock.sendMessage()`
9. `stop()` calls `sock.end()` and closes db

Use mocked Baileys (vi.mock) + real SQLite in tmpdir. Mock `makeWASocket` to return a fake socket with an `ev` EventEmitter.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @opentidy/backend test -- --run daemon.test`
Expected: FAIL

- [ ] **Step 3: Implement daemon.ts**

Create `apps/backend/modules/whatsapp/daemon.ts` following the spec. Key sections:

- **Connection:** `makeWASocket()` with `useMultiFileAuthState(ctx.dataDir + '/auth')`, reconnect with backoff (2s base, 1.8 factor, 30s max, 12 attempts). `DisconnectReason.loggedOut` → no reconnect.
- **SQLite store:** `better-sqlite3` at `ctx.dataDir + '/whatsapp.db'`, WAL mode, 3 tables (chats, messages, contacts) + FTS5 virtual table with triggers. Batch inserts in transactions for `messaging-history.set`.
- **Receiver:** `sock.ev.on('messages.upsert', ...)` with `type === 'notify'` filter, skip `fromMe`, call `ctx.emit()`.
- **MCP tools:** 5 tools registered via `ctx.registerTool()`: list_chats, read_messages, search, send_message, send_media.
- **Cleanup:** `ctx.onShutdown(() => { sock.end(); db.close(); })`

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @opentidy/backend test -- --run daemon.test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/modules/whatsapp/daemon.ts apps/backend/modules/whatsapp/daemon.test.ts
git commit -m "feat(backend): implement WhatsApp daemon with Baileys + SQLite"
```

---

## Task 9: Update module.json + cleanup old files

**Files:**
- Modify: `apps/backend/modules/whatsapp/module.json`
- Delete: `apps/backend/modules/whatsapp/receiver.ts`

- [ ] **Step 1: Update module.json**

Replace `apps/backend/modules/whatsapp/module.json` with:

```json
{
  "name": "whatsapp",
  "label": "WhatsApp",
  "description": "Send and receive WhatsApp messages",
  "icon": "💬",
  "version": "2.0.0",
  "daemon": {
    "entry": "./daemon.ts"
  },
  "setup": {
    "authCommand": "node ./auth.mjs",
    "checkCommand": "node -e \"import('@whiskeysockets/baileys').then(() => process.exit(0)).catch(() => process.exit(1))\""
  },
  "toolPermissions": {
    "scope": "per-call",
    "safe": [
      { "tool": "whatsapp_list_chats", "label": "List conversations" },
      { "tool": "whatsapp_read_messages", "label": "Read messages" },
      { "tool": "whatsapp_search", "label": "Search messages" }
    ],
    "critical": [
      { "tool": "whatsapp_send_message", "label": "Send messages" },
      { "tool": "whatsapp_send_media", "label": "Send media files" }
    ]
  }
}
```

- [ ] **Step 2: Delete old receiver stub**

```bash
rm apps/backend/modules/whatsapp/receiver.ts
```

- [ ] **Step 3: Run all backend tests**

Run: `pnpm --filter @opentidy/backend test -- --run`
Expected: PASS (no test references the old receiver)

- [ ] **Step 4: Commit**

```bash
git add apps/backend/modules/whatsapp/module.json
git rm apps/backend/modules/whatsapp/receiver.ts
git commit -m "refactor(backend)!: migrate WhatsApp module to Baileys daemon"
```

---

## Task 10: Documentation updates

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/specification.md`
- Modify: `docs/contributing.md`
- Modify: `docs/architecture.md`

- [ ] **Step 1: Update CLAUDE.md**

In the Architecture > Modules section, add daemon as a third pattern:

```markdown
**Level 3: Daemon** (WhatsApp):
A `daemon.ts` that runs in-process, managing a persistent connection. Provides both
event receiving (via `ctx.emit()`) and MCP tools (via `ctx.registerTool()`).
The daemon is managed by the backend lifecycle (start/stop/restart with backoff).
```

Remove all references to `wacli` throughout. Update WhatsApp module description to mention Baileys instead of wacli/whatsapp-mcp.

- [ ] **Step 2: Update docs/specification.md**

Add a "Daemon Modules" subsection under the Module System section. Document:
- The `daemon` field in ModuleManifest
- The `ModuleContext` interface (`emit`, `registerTool`, `logger`, `onShutdown`, `dataDir`)
- The daemon lifecycle (start/stop/restart/crash recovery with backoff)
- Tool naming: short names in module.json, agent sees `mcp__opentidy__<name>`
- Example: WhatsApp daemon

Update WhatsApp module description to reference Baileys.

- [ ] **Step 3: Update docs/contributing.md**

Add a "Creating a daemon module" section with:
- When to use a daemon (needs both receiver + MCP tools sharing a connection)
- Module structure example (module.json + daemon.ts + auth.js)
- `ModuleContext` API reference with code examples
- How to register tools, emit events, use dataDir for storage

- [ ] **Step 4: Update docs/architecture.md**

Add daemon module pattern to the module system section. Document the 3 levels:
- Level 1: JSON-only (MCP external)
- Level 2: JSON + receiver.ts
- Level 3: JSON + daemon.ts (replaces both MCP + receiver)

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md docs/specification.md docs/contributing.md docs/architecture.md
git commit -m "docs: add daemon module system, ModuleContext API, and update WhatsApp docs"
```

---

## Task 11: Integration test for full daemon lifecycle

**Files:**
- Create: `apps/backend/src/features/modules/integration.test.ts` (extend if exists)

- [ ] **Step 1: Write integration test**

Test the full flow: create a mock daemon module in a tmpdir, enable it via lifecycle, verify tools are registered in the dynamic registry, verify emit works, then disable and verify cleanup.

- [ ] **Step 2: Run test**

Run: `pnpm --filter @opentidy/backend test -- --run integration.test`
Expected: PASS

- [ ] **Step 3: Run full test suite**

Run: `pnpm test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/features/modules/integration.test.ts
git commit -m "test(backend): add daemon module integration test"
```
