# WhatsApp Baileys Migration + Module Daemon System: Design Spec

**Date:** 2026-03-22
**Extends:** `2026-03-20-module-system-design.md`
**Goal:** Migrate the WhatsApp module from wacli/whatsapp-mcp (external Go + npm processes) to Baileys (in-process TypeScript). Introduce the **daemon** concept to the module system to support modules that need a long-running process providing both event receiving AND MCP tools.

## Problem

The WhatsApp module currently depends on two external processes:
- `wacli` (Go binary): long-running WhatsApp sync process
- `whatsapp-mcp` (npm package): MCP server that reads wacli's SQLite and calls wacli CLI for sending

Issues:
1. **Orphaned processes**: wacli runs as an unmanaged external process. If the backend crashes or restarts, the wacli process survives and holds a store lock, blocking all future use (the exact bug that triggered this work).
2. **Three moving parts**: wacli binary + whatsapp-mcp npm + receiver stub = fragile, hard to debug.
3. **Not module-agnostic**: a third-party developer cannot build a similar module without understanding OpenTidy internals.

## Design Decision: Daemon Modules

### Why a new concept

The existing module system supports three patterns:
1. **MCP only** (JSON manifest): external process spawned per agent session
2. **Receiver only** (receiver.ts): long-running or polling, managed by lifecycle
3. **MCP + Receiver** (both): two separate mechanisms that don't share state

WhatsApp needs a **single persistent connection** (Baileys WebSocket) that serves both as a receiver (incoming messages to triage) and as an MCP tool provider (agent queries chats, sends messages). The current system cannot express this because MCP servers and receivers are independent.

The **daemon** is the missing primitive: a long-running module process managed by the backend that can both emit events AND register MCP tools on the shared server.

### What changes

The daemon is purely **additive**. Existing module patterns (Level 1: JSON-only MCP, Level 2: receiver.ts) are unchanged.

**New in ModuleManifest:**
```typescript
interface ModuleManifest {
  // ... all existing fields unchanged ...
  daemon?: {
    entry: string;  // path to daemon module, e.g. "./daemon.ts"
  };
}
```

**New interface, ModuleContext:**
```typescript
interface ModuleContext {
  /** Module config values from config.modules[name].config */
  config: Record<string, unknown>;
  /** Persistent data directory: ~/.config/opentidy/modules/<name>/ */
  dataDir: string;
  /** Emit a ReceiverEvent to the triage pipeline (with dedup) */
  emit(event: ReceiverEvent): void;
  /** Register an MCP tool on the shared HTTP server */
  registerTool(name: string, schema: ToolSchema, handler: ToolHandler): void;
  /** Scoped logger: console.log/warn/error with [module-name] prefix */
  logger: ModuleLogger;
  /** Register a cleanup function called on stop */
  onShutdown(fn: () => void | Promise<void>): void;
}

interface ToolSchema {
  description: string;
  inputSchema: Record<string, unknown>;  // JSON Schema
}

type ToolHandler = (input: Record<string, unknown>) => Promise<unknown>;

interface ModuleLogger {
  log(msg: string, ...args: unknown[]): void;
  warn(msg: string, ...args: unknown[]): void;
  error(msg: string, ...args: unknown[]): void;
}
```

**Daemon module contract:**
```typescript
// daemon.ts: what the module developer implements
export function start(ctx: ModuleContext): Promise<void>;
export function stop(): Promise<void>;
export function health?(): { ok: boolean; error?: string };
```

Both `start()` and `stop()` are **required** exports (async only, matching the receiver contract). `health()` is optional; if provided, the checkup system calls it periodically to report module status.

### Lifecycle

```
Module enabled (has daemon.entry)
  -> backend resolves daemon entry path
  -> imports module, calls start(ctx)
  -> daemon registers tools via ctx.registerTool()
  -> daemon emits events via ctx.emit()
  -> tools appear on the shared MCP HTTP server (/mcp)
  -> activeReceivers map tracks the daemon for stop

Module disabled
  -> calls stop() on daemon
  -> calls all onShutdown() handlers
  -> unregisters tools from MCP server
  -> removes from activeReceivers

Backend shutdown (SIGTERM/SIGINT)
  -> stopAll() calls stop() on all active daemons (same as receivers today)

Daemon crash (unhandled error in start())
  -> catch error, log it
  -> set module health to 'error' with message
  -> retry with exponential backoff: 2s, 4s, 8s, 16s, 32s (max 5 attempts)
  -> after max attempts: stay in error state, emit SSE module:error
  -> user can manually re-enable to retry
```

### Integration with existing lifecycle.ts

The daemon uses the same `activeReceivers` map as receivers. In `startReceivers()`:

```typescript
// Existing: handle polling/long-running receivers via entry file
// New: handle daemon modules
if (manifest.daemon?.entry) {
  const daemonPath = resolve(modulesBaseDir, name, manifest.daemon.entry);
  const mod = await import(daemonPath);
  const ctx = createModuleContext(name, moduleConfig, emit, mcpServer);
  await mod.start(ctx);
  activeReceivers.set(`${name}:daemon`, {
    stop: async () => {
      await mod.stop();
      await ctx.runShutdownHandlers();
      ctx.unregisterAllTools();
    }
  });
}
```

A daemon **replaces** both `mcpServers` and `receivers` for that module. If a module has `daemon.entry`, the lifecycle ignores `mcpServers` and `receivers` fields (they should be empty anyway).

### createModuleContext factory

```typescript
function createModuleContext(
  name: string,
  moduleConfig: Record<string, unknown>,
  emitToTriage: (event: ReceiverEvent) => void,
  dynamicToolRegistry: DynamicToolRegistry,
): ModuleContext {
  const dataDir = join(getOpenTidyPaths().configDir, 'modules', name);
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
      log: (msg, ...args) => console.log(`[${name}]`, msg, ...args),
      warn: (msg, ...args) => console.warn(`[${name}]`, msg, ...args),
      error: (msg, ...args) => console.error(`[${name}]`, msg, ...args),
    },
    onShutdown(fn) { shutdownHandlers.push(fn); },
    // Internal methods (not in ModuleContext interface):
    async runShutdownHandlers() {
      for (const fn of shutdownHandlers) await fn();
    },
    unregisterAllTools() {
      for (const t of registeredTools) dynamicToolRegistry.unregister(t);
    },
  };
}
```

`dataDir` is created lazily (mkdir -p) on context creation. It lives at `~/.config/opentidy/modules/<name>/`. Cleaned up by `opentidy uninstall` (same as other config data).

### Restart endpoint

`POST /api/modules/:name/restart`: calls `stop()` then `start(ctx)` with reset retry counter. Provides a clean way to restart a daemon without cycling disable/enable. Added to the existing module API endpoints.

### Tool registration on MCP server

Tools registered via `ctx.registerTool()` are added to the existing MCP HTTP server (`features/mcp-server/server.ts`). The server already handles tool listing and execution; we just need a registry that daemon modules can write to.

```typescript
// In mcp-server/server.ts, new:
const dynamicTools = new Map<string, { schema: ToolSchema; handler: ToolHandler }>();

function registerDynamicTool(name: string, schema: ToolSchema, handler: ToolHandler): void {
  dynamicTools.set(name, { schema, handler });
}

function unregisterDynamicTool(name: string): void {
  dynamicTools.delete(name);
}
```

**Integration with per-request McpServer model:** The existing MCP server creates a fresh `McpServer` instance per HTTP request (stateless mode). Dynamic tools are stored in the shared `Map` above (module-scoped, persists across requests). In `registerAllTools()`, after registering static tools, iterate `dynamicTools` and call `server.tool()` for each. The `Map` is the source of truth; each per-request instance reads from it.

**ToolHandler return normalization:** `ToolHandler` returns `Promise<unknown>`. The `registerDynamicTool` wrapper normalizes the result into the MCP SDK format: if the handler returns a plain object/string, it wraps it in `{ content: [{ type: 'text', text: JSON.stringify(result) }] }`. This shields daemon developers from MCP SDK internals.

### Tool permissions

Daemon tools use the same `toolPermissions` in module.json. The tool names declared in `toolPermissions.safe` and `toolPermissions.critical` must match the names passed to `ctx.registerTool()`.

For agent config generation (`generateSettingsFromModules`): when a module has `daemon.entry` and `toolPermissions`, generate permission entries for the daemon-registered tools. These tools are served by the OpenTidy MCP server, so from the agent's perspective they appear as `mcp__opentidy__whatsapp_list_chats`, etc. The `toolPermissions` in module.json uses the **short name** (`whatsapp_list_chats`), and the agent config builder prefixes `mcp__opentidy__` when generating the `--allowedTools` list and permission rules.

### Tool naming convention

Daemon tools use the pattern `<module>_<action>` in module.json and `ctx.registerTool()`:
- `whatsapp_list_chats`, `whatsapp_send_message`, etc.

The agent sees them as `mcp__opentidy__whatsapp_list_chats` (standard MCP tool naming). The mapping is automatic; module developers only deal with short names.

## WhatsApp Module: Baileys Implementation

### Files

```
apps/backend/modules/whatsapp/
  module.json        # manifest with daemon entry
  auth.js            # standalone QR auth script
  daemon.ts          # Baileys connection + SQLite store + receiver + MCP tools
  daemon.test.ts     # unit tests
```

### module.json

```json
{
  "name": "whatsapp",
  "label": "WhatsApp",
  "description": "Send and receive WhatsApp messages",
  "icon": "message-circle",
  "version": "2.0.0",
  "daemon": {
    "entry": "./daemon.ts"
  },
  "setup": {
    "authCommand": "node ./auth.js",
    "checkCommand": "node -e \"require('@whiskeysockets/baileys')\""
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

No `mcpServers`, no `receivers`, no `cli`. The daemon handles everything.

### auth.js

Standalone script run via `setup.authCommand` during module setup. Uses `useMultiFileAuthState()` to save credentials to `~/.config/opentidy/modules/whatsapp/auth/`. Calls `makeWASocket({ printQRInTerminal: true })`, waits for QR scan, exits on success. Timeout: 2 minutes.

### daemon.ts

Single file containing:

**Connection manager:**
- `makeWASocket()` with auth from `ctx.dataDir/auth/`
- Reconnection with exponential backoff (2s base, 30s max, 1.8 factor, 12 max attempts)
- `DisconnectReason.loggedOut` → no reconnect, log error, module health set to `error`
- Browser identification: `['OpenTidy', 'Daemon', '1.0.0']`
- **Retry interaction:** Baileys reconnection is self-contained within the daemon. If all 12 attempts fail, the daemon sets health to `error` via `ctx.logger.error()`. It does NOT throw to the daemon crash handler. The daemon-level crash recovery (5 attempts) only triggers on unexpected exceptions (import failure, SQLite corruption, etc.), not on Baileys connection issues.

**SQLite store (`ctx.dataDir/whatsapp.db`):**
- 3 tables: `chats`, `messages`, `contacts`
- FTS5 virtual table: `messages_fts` on `messages.content`
- Triggers for FTS5 sync on INSERT/DELETE
- WAL mode enabled for read/write concurrency (MCP reads interleave with event-driven writes)
- Listeners on Baileys events: `messaging-history.set`, `chats.upsert`, `contacts.upsert`, `messages.upsert`
- **History sync volume:** initial sync can produce thousands of messages. Use `db.transaction()` to batch inserts from `messaging-history.set` in a single transaction for performance.

**Receiver (event emitter):**
- Listens to `messages.upsert` with `type === 'notify'` (real-time only, not history sync)
- Skips `fromMe` messages
- Calls `ctx.emit({ source: 'whatsapp', content, metadata: { from, messageId, timestamp, pushName } })`
- Also persists to SQLite

**MCP tools (5 tools):**

| Tool | Implementation |
|------|---------------|
| `whatsapp_list_chats` | `SELECT FROM chats ORDER BY last_message_at DESC LIMIT ?` |
| `whatsapp_read_messages` | `SELECT FROM messages WHERE chat_jid = ? ORDER BY timestamp DESC LIMIT ?` |
| `whatsapp_search` | `SELECT FROM messages JOIN messages_fts WHERE content MATCH ? LIMIT ?` |
| `whatsapp_send_message` | `sock.sendMessage(jid, { text })` |
| `whatsapp_send_media` | Read file buffer + `sock.sendMessage(jid, { [mediaType]: buffer })`. Path must be absolute. Media type inferred from file extension if not specified. |

### daemon.test.ts

Tests use mocked Baileys + in-memory SQLite:

1. `start()` initializes SQLite schema (3 tables + FTS5)
2. `messages.upsert` (type: notify) → `emit()` called with correct ReceiverEvent
3. `messages.upsert` (type: append) → `emit()` NOT called (history sync)
4. `messages.upsert` (fromMe) → `emit()` NOT called
5. `whatsapp_list_chats` → returns chats from SQLite
6. `whatsapp_read_messages` → returns messages for a chat
7. `whatsapp_search` → FTS5 query returns matching messages
8. `whatsapp_send_message` → calls `sock.sendMessage()`
9. `whatsapp_send_media` → reads file + calls `sock.sendMessage()`
10. Connection close (not loggedOut) → reconnect with backoff
11. Connection close (loggedOut) → no reconnect, log error
12. `stop()` → `sock.end()` + `db.close()`
13. `onShutdown` handlers called on stop

## Cleanup

### Removed

| Item | Reason |
|------|--------|
| `whatsapp-mcp` npm dependency | Replaced by daemon MCP tools |
| `wacli` CLI dependency | Replaced by Baileys |
| `configFields.wacliPath` | No external binary |
| `WACLI_PATH` references | No external binary |
| Old `receiver.ts` (stub) | Replaced by daemon |

### New dependency

| Package | Version | Purpose |
|---------|---------|---------|
| `@whiskeysockets/baileys` | `^7.0.0` | WhatsApp Web protocol |

`better-sqlite3` is already a dependency of the backend.

## Changes to Module System Code

### packages/shared/src/types.ts

Add to `ModuleManifest`:
```typescript
daemon?: {
  entry: string;
};
```

Add new types: `ModuleContext`, `ToolSchema`, `ToolHandler`, `ModuleLogger`.

### packages/shared/src/schemas.ts

Add Zod schema for daemon field in `ModuleManifestSchema`.

### apps/backend/src/features/modules/lifecycle.ts

Extend `startReceivers()` to handle daemon modules (as described in Integration section above).

### apps/backend/src/features/mcp-server/server.ts

Add dynamic tool registry: `registerDynamicTool()`, `unregisterDynamicTool()`. Merge dynamic tools in tool listing and execution.

### apps/backend/src/shared/agent-config.ts

In `generateSettingsFromModules()`: when a module has `daemon.entry` and `toolPermissions`, generate permission entries for the daemon-registered tools (using `mcp__opentidy__<toolname>` pattern).

## Documentation Updates

### docs/specification.md

- Add daemon concept to Module System section
- Update WhatsApp module description (Baileys instead of wacli)
- Add ModuleContext interface description
- Update data flow diagram to show daemon path

### CLAUDE.md

- Update module system description with daemon pattern
- Remove references to wacli
- Update curated modules table
- Add daemon lifecycle to Architecture section

### docs/contributing.md

- Add "Creating a daemon module" section with examples
- Document ModuleContext API

### docs/architecture.md

- Add daemon module pattern to module system docs

## Not In Scope

- Pairing code auth (alternative to QR), can be added later
- Web UI QR code display; auth stays in terminal for now
- Message retention policy / cleanup cron, add when needed
- Group message handling refinements; basic support works, optimize later
- Voice note transcription (future enhancement)
- Read receipt tracking (future enhancement)
- Media download and storage; basic buffer support, optimize later
