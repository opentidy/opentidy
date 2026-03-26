# Module System & Settings Unification: Design Spec

**Date:** 2026-03-20
**Goal:** Replace the fragmented MCP/Skills/Receivers configuration with a unified Module system. A module is a bundle that contains N MCPs + N skills + N receivers. The UI Settings page shows modules, not individual components. The setup wizard integrates module configuration as a step.

## Problem

Today OpenTidy has 3 separate systems for extending the agent:
- **MCP servers**: give capabilities to the agent (read Gmail, navigate browser)
- **Skills**: give behaviors/knowledge to the agent (markdown instructions)
- **Receivers**: listen to external sources and trigger the triage pipeline (Gmail webhook, iMessage polling)

These are interdependent but managed separately. Activating a Gmail MCP without its receiver means the agent can read emails but nothing triggers it. Activating a receiver without the MCP means events arrive but the agent can't act on them. The user has to understand technical distinctions (MCP vs skill vs receiver) that shouldn't matter to them.

Additionally, there's no UI to configure receivers, no visibility into what's entering the system, and services like Telegram/Cloudflare/GitHub are hardcoded in setup rather than being extensible.

## Design Principles

1. **Everything is a module**: Gmail, WhatsApp, Browser, Telegram, Cloudflare, GitHub. No special cases.
2. **Module = bundle**: contains N MCPs + N skills + N receivers, all optional. Enable/disable is atomic.
3. **Generic backend**: zero hardcoded knowledge of specific modules. All intelligence is in the manifest.
4. **Receiver interface is standardized**: documented, extensible, contributable. Supports webhook, polling, and long-running modes.
5. **One place to configure**: Settings > Modules. The setup wizard reuses the same components.
6. **Big bang migration**: no backward compatibility with old `mcp`/`skills`/`receivers` config.

## Module Manifest

Every module is a directory with a `module.json` manifest:

```typescript
interface ModuleManifest {
  name: string;                 // unique id: "gmail", "browser", "notion-mcp"
  label: string;                // display: "Gmail", "Browser"
  description: string;          // one-liner
  icon?: string;                // emoji or SVG path
  version: string;              // semver
  platform?: 'darwin' | 'all';  // default 'all'

  mcpServers?: McpServerDef[];
  skills?: SkillDef[];
  receivers?: ReceiverDef[];

  setup?: {
    authCommand?: string;           // opens TerminalDrawer for auth flow
    configFields?: ConfigField[];   // fields collected from user in UI
  };
}

interface McpServerDef {
  name: string;                    // unique in agent settings.json
  command: string;
  args: string[];
  env?: Record<string, string>;    // static env vars
  envFromConfig?: Record<string, string>;  // maps module config key → env var
  permissions?: string[];
}

interface SkillDef {
  name: string;
  content: string;                 // inline markdown or path to .md file
}

interface ReceiverDef {
  name: string;
  mode: 'webhook' | 'polling' | 'long-running';
  source: string;                  // EventSource: "gmail", "sms", "whatsapp"
  pollInterval?: number;           // ms, for polling mode
  entry?: string;                  // path to receiver file (polling/long-running)
  transform?: string;              // path to transform function (webhook mode)
}

interface ConfigField {
  key: string;
  label: string;
  type: 'text' | 'password' | 'select';
  required?: boolean;
  placeholder?: string;
  options?: string[];              // for select type
}
```

## Curated Modules

Seven modules ship with OpenTidy:

| Module | MCPs | Skills | Receivers | Setup |
|--------|------|--------|-----------|-------|
| **gmail** | gmail-mcp |, | gmail-webhook (webhook) | OAuth via authCommand |
| **whatsapp** | whatsapp-mcp |, | whatsapp-wacli (long-running) | wacli auth via TerminalDrawer |
| **browser** | camoufox | browser-skill |, | pipx install via TerminalDrawer |
| **imessage** |, |, | imessage (polling, osascript) | macOS permission |
| **apple-mail** |, |, | apple-mail (polling, osascript) | macOS permission |
| **telegram** | telegram-mcp |, |, (future: telegram receiver) | configFields: botToken, chatId |
| **cloudflare** |, |, |, | authCommand: cloudflared tunnel login + configFields: tunnelName, hostname |

Stored in: `apps/backend/modules/<name>/module.json` + receiver source files.

### Example: Gmail module

```json
{
  "name": "gmail",
  "label": "Gmail",
  "description": "Read, search, and draft emails via Gmail",
  "icon": "📧",
  "version": "1.0.0",
  "mcpServers": [{
    "name": "gmail",
    "command": "npx",
    "args": ["-y", "@gongrzhe/server-gmail-autoauth-mcp"]
  }],
  "receivers": [{
    "name": "gmail-webhook",
    "mode": "webhook",
    "source": "gmail",
    "transform": "./transform.ts"
  }],
  "setup": {
    "authCommand": "npx @gongrzhe/server-gmail-autoauth-mcp"
  }
}
```

### Example: Telegram module

```json
{
  "name": "telegram",
  "label": "Telegram",
  "description": "Send notifications via Telegram bot",
  "icon": "📨",
  "version": "1.0.0",
  "mcpServers": [{
    "name": "telegram",
    "command": "npx",
    "args": ["-y", "telegram-mcp"],
    "envFromConfig": { "BOT_TOKEN": "botToken" }
  }],
  "setup": {
    "configFields": [
      { "key": "botToken", "label": "Bot Token", "type": "password", "required": true, "placeholder": "123456:ABC-..." },
      { "key": "chatId", "label": "Chat ID", "type": "text", "required": true, "placeholder": "123456789" }
    ]
  }
}
```

## Custom Modules

A custom module is either:
- A local directory with a `module.json`
- An npm package that contains a `module.json` at its root

Added via UI (Settings > Modules > Add) or API (`POST /api/modules/add`).

When adding from the existing MCP registry (marketplace search), the system wraps the MCP in a module with just one `mcpServers` entry and no receivers/skills.

## Receiver Interface

Receivers are the standardized way for external events to enter OpenTidy. A receiver implements one of three modes.

### Interface

```typescript
interface Receiver {
  type: string;
  start(emit: (event: ReceiverEvent) => void): Promise<void>;
  stop(): Promise<void>;
  health?(): { ok: boolean; error?: string };
}

interface ReceiverEvent {
  source: string;                      // "gmail", "whatsapp", "sms"
  content: string;                     // raw content (email body, message text)
  metadata: Record<string, string>;    // from, subject, timestamp, etc.
}
```

### Modes

**Webhook**; receives HTTP POST on `/api/webhooks/:moduleName/:receiverName`
- Standard Webhooks compatible (signature verification via `webhook-signature` header)
- The receiver declares a `transform(body: unknown): ReceiverEvent` function to convert the payload
- OpenTidy manages the HTTP endpoint; the receiver only provides the transform logic

**Polling**. OpenTidy calls periodically
- The receiver implements `poll(): Promise<ReceiverEvent[]>`
- Interval from `ReceiverDef.pollInterval` (default 300000ms = 5 min)

**Long-running**; a process that runs continuously
- The receiver implements `start(emit)` and `stop()`
- Used for persistent connections (wacli for WhatsApp, WebSocket listeners)

### Extensibility

Anyone can publish a receiver as an npm package:

```typescript
// my-figma-receiver/index.ts
export function createReceiver(config: Record<string, unknown>): Receiver {
  return {
    type: 'figma-webhook',
    async start(emit) { /* ... */ },
    async stop() { /* ... */ },
  };
}
```

The module manifest references it via `entry` path or the npm package resolves it.

### Webhook Endpoint

```
POST /api/webhooks/:moduleName/:receiverName
```

- Validates that the module is active and the receiver exists
- Verifies Standard Webhooks signature if configured (via module config `webhookSecret`)
- Calls the receiver's `transform()` function
- Deduplicates (SHA-256, existing dedup store)
- Passes event to triage pipeline
- Returns 200 (accepted), 401 (signature invalid), 404 (module/receiver not found or disabled)

## Config Changes

### New config shape

```typescript
interface OpenTidyConfig {
  version: number;
  setupComplete?: boolean;
  // telegram field REMOVED, botToken/chatId now live in modules.telegram.config
  // The notification system reads from config.modules.telegram.config.botToken
  auth: { bearerToken: string };
  server: { port: number; appBaseUrl: string };
  workspace: { dir: string; lockDir: string };
  update: { ... };
  agentConfig: { name: AgentName; configDir: string };
  language: string;
  userInfo: UserInfo;
  modules: Record<string, ModuleState>;  // NEW; replaces mcp, skills, receivers
  github?: { token: string; owner?: string; repo?: string };  // may become a module later
}

interface ModuleState {
  enabled: boolean;
  source: 'curated' | 'custom';
  config?: Record<string, unknown>;
  health?: 'ok' | 'error' | 'unknown';
  healthError?: string;
  healthCheckedAt?: string;
}
```

### Removed fields

- `mcp: McpConfigV2`: replaced by `modules`
- `skills: SkillsConfig`: replaced by `modules`
- `receivers: ReceiverConfigEntry[]`: replaced by `modules`

### Agent config generation

`regenerateAgentConfig()` changes: iterates `config.modules`, loads each active module's manifest, aggregates all `mcpServers` and `skills` from active modules. Deduplicates MCP servers by `command + args` (same binary = one entry in `settings.json`).

## API Endpoints

All endpoints are **generic**; zero module-specific code in the backend.

```
GET    /api/modules                         → list all modules with state + manifest info
POST   /api/modules/:name/enable            → activate module, start receivers, regenerate agent config
POST   /api/modules/:name/disable           → deactivate, stop receivers, regenerate
POST   /api/modules/:name/configure         → save config fields { key: value, ... }
DELETE /api/modules/:name                   → remove custom module (curated = 400)
POST   /api/modules/add                     → add custom module (npm package or manifest JSON)
GET    /api/modules/:name/health            → check module health

POST   /api/webhooks/:moduleName/:receiverName  → unified webhook endpoint
```

### Response shape: `GET /api/modules`

```typescript
interface ModulesResponse {
  modules: ModuleInfo[];
}

interface ModuleInfo {
  name: string;
  label: string;
  description: string;
  icon?: string;
  source: 'curated' | 'custom';
  enabled: boolean;
  platform?: string;
  health?: 'ok' | 'error' | 'unknown';
  healthError?: string;
  components: {
    mcpServers: string[];
    skills: string[];
    receivers: string[];
  };
  setup?: {
    needsAuth: boolean;
    configFields: ConfigField[];
    configured: boolean;     // all required fields are filled
  };
}
```

## UI: Settings Page

### Route change

`/toolbox` → `/settings`

### Sections

| Section | What | New? |
|---------|------|------|
| **Modules** | All modules with cards (enable/disable/configure) | New (replaces MCP + Skills + Marketplace) |
| **Agents** | Claude/Gemini/Copilot selector | Existing, unchanged |
| **Security** | Bearer token reveal/copy | New |
| **Service Control** | Start/stop/restart daemon | New |
| **Danger Zone** | Reset everything | Existing, unchanged |

### Module Card

Each module is a card showing:
- Icon + name + description
- State: enabled (green) / disabled (gray) / error (red)
- Component badges: `MCP` `Skill` `Receiver`, shows what the module contains
- If receiver active: "Last event: 3 min ago"
- Actions: Enable/Disable toggle, Configure button (opens config dialog or TerminalDrawer), Remove (custom only)

### Module Config Dialog

When a module has `setup.configFields`, clicking Configure opens a dialog with:
- Form fields generated from manifest (`text`, `password`, `select`)
- If `setup.authCommand` exists: a "Connect" button that opens the TerminalDrawer
- Save + Test buttons

### Add Module Dialog

Two modes:
- **Registry search**: searches the existing MCP registry, wraps result in a module with one MCP
- **Custom**: user provides npm package name or local path, system loads the `module.json`

## Setup Wizard Integration

The setup wizard (from Plan 1) gets a new Step 4 between Permissions and Done:

```
Step 1: User info (name, language)
Step 2: Agent (connect Claude/Gemini via TerminalDrawer)
Step 3: Permissions macOS
Step 4: Modules ← NEW
Step 5: Done
```

### Step 4: Modules

Shows curated modules in a guided layout:
- Each module displayed as a card (same `ModuleCard` component as Settings)
- Pre-selected recommendations: Gmail, Telegram, Browser enabled by default
- Each card has Configure/Skip actions
- "You can configure more modules later in Settings"
- Continue button always available (no module is required)

The wizard and Settings page **share the same components** (`ModuleCard`, `ModuleConfigDialog`). The wizard wraps them in a guided context.

## Module Lifecycle

```
Module added (custom) or discovered (curated)
  → manifest loaded and validated
  → ModuleState created in config: { enabled: false, source: '...' }

Module enabled
  → config fields validated (all required filled?)
  → if authCommand needed and not done → prompt user
  → MCP servers added to agent settings.json via regenerateAgentConfig()
  → skills injected into agent instructions
  → receivers started (webhook endpoint registered / polling timer set / process spawned)
  → health check run

Module disabled
  → receivers stopped
  → MCP servers removed from settings.json (unless another active module has same MCP)
  → skills removed from instructions
  → regenerateAgentConfig()

Module removed (custom only)
  → disable first
  → delete manifest + config entry
```

## MCP Deduplication

When generating the agent's `settings.json`, if two active modules declare MCPs with the same `command + args`:
- Only one entry is written to `settings.json`
- The first module's `name` for that MCP is used
- The MCP stays active as long as any module referencing it is active

This is simple string comparison at generation time, not a runtime registry.

## Boot Sequence Changes

In `index.ts` boot:

1. Load `config.modules`
2. For each enabled module: load manifest from `apps/backend/modules/<name>/module.json` (curated) or resolved path (custom)
3. Start all receivers from active modules
4. `regenerateAgentConfig()` reads active modules instead of old `mcp`/`skills` fields

## Files Impacted

### Deleted

- `apps/backend/src/features/mcp/`: entire directory (list, toggle, add, remove, registry, setup-wizard, agents routes)
- `apps/backend/src/features/skills/`: entire directory (list, toggle, add, remove)
- `apps/web/src/features/settings/McpServersPanel.tsx`
- `apps/web/src/features/settings/SkillsPanel.tsx`
- `apps/web/src/features/settings/MarketplacePanel.tsx`
- `apps/web/src/features/settings/AddMcpDialog.tsx`

### New (backend)

- `apps/backend/modules/`: curated module directories (gmail/, whatsapp/, browser/, imessage/, apple-mail/, telegram/, cloudflare/) with `module.json` + receiver code
- `apps/backend/src/features/modules/list.ts`: GET /api/modules
- `apps/backend/src/features/modules/enable.ts`: POST enable
- `apps/backend/src/features/modules/disable.ts`: POST disable
- `apps/backend/src/features/modules/configure.ts`: POST configure
- `apps/backend/src/features/modules/add.ts`: POST add custom
- `apps/backend/src/features/modules/remove.ts`: DELETE remove custom
- `apps/backend/src/features/modules/health.ts`: GET health
- `apps/backend/src/features/modules/loader.ts`: load manifests from filesystem
- `apps/backend/src/features/modules/lifecycle.ts`: start/stop receivers, regenerate agent config
- `apps/backend/src/features/modules/webhook.ts`: unified webhook endpoint

### New (frontend)

- `apps/web/src/features/settings/ModulesPanel.tsx`: module list with cards
- `apps/web/src/features/settings/ModuleCard.tsx`: individual module card (shared with wizard)
- `apps/web/src/features/settings/AddModuleDialog.tsx`: add custom module
- `apps/web/src/features/settings/ModuleConfigDialog.tsx`: configure module fields
- `apps/web/src/features/setup/ModulesStep.tsx`: wizard Step 4

### Modified

- `packages/shared/src/types.ts`: add ModuleManifest, ModuleState, ReceiverEvent; remove McpConfigV2, SkillsConfig, ReceiverConfigEntry
- `packages/shared/src/schemas.ts`: module schemas
- `apps/backend/src/shared/config.ts`: DEFAULT_CONFIG with `modules: {}`
- `apps/backend/src/shared/agent-config.ts`: regenerateAgentConfig() reads modules
- `apps/backend/src/server.ts`: remove mcp/skills routes, mount module routes + webhook
- `apps/backend/src/index.ts`: boot: load modules, start receivers
- `apps/web/src/features/settings/Settings.tsx`: new section structure
- `apps/web/src/features/setup/SetupWizard.tsx`: add Step 4 (Modules)
- `apps/web/src/App.tsx`: `/toolbox` → `/settings`
- `apps/web/src/shared/DesktopNav.tsx`: rename Toolbox → Settings
- `apps/web/src/shared/MobileNav.tsx`: rename Toolbox → Settings
- `apps/web/src/shared/i18n/locales/en.json`: module strings
- `apps/web/src/shared/i18n/locales/fr.json`: module strings

## Relationship to Install-Setup Spec

This spec **supersedes** the Settings page structure defined in `2026-03-19-install-setup-design.md`. Specifically:
- The "Services" section (Telegram, Gmail, etc.) is replaced by "Modules", everything is a module now
- `ServiceCard` component becomes `ModuleCard`
- The "MCP Servers" and "Skills" sections are absorbed into "Modules"
- The setup wizard gains a new Step 4 (Modules) between Permissions and Done, making it a 5-step flow: `User Info → Agent → Permissions → Modules → Done`
- Setup API endpoints for individual services (`/api/setup/telegram`, `/api/setup/gmail`, etc.) are replaced by the generic `/api/modules/:name/configure`

The install-setup spec remains valid for: Phase 1 install script, bearer token handling, setup wizard Steps 1-3 and 5, TerminalDrawer component, PTY backend.

## Receiver Interface Migration

The existing `ReceiverPlugin` interface in `triage/plugin.ts` becomes the new `Receiver` interface:

| Existing (`ReceiverPlugin`) | New (`Receiver`) |
|---|---|
| `name: string` | `type: string` |
| `source: string` | Moved to `ReceiverDef.source` in manifest |
| `init(): Promise<void> \| void` | Folded into `start()` |
| `start(onMessage): Promise<void> \| void` | `start(emit): Promise<void>` (async only) |
| `stop(): Promise<void> \| void` | `stop(): Promise<void>` (async only) |
|, | `health?(): { ok: boolean; error?: string }` (new) |

`ReceiverPluginMessage` → `ReceiverEvent`:

| Existing | New |
|---|---|
| `from: string` | `metadata.from` |
| `body: string` | `content` |
| `timestamp: string` | `metadata.timestamp` |
| `metadata: Record<string, string>` | `metadata` (same) |

`ReceiverEvent` is the receiver's raw output. The system wraps it into an `AppEvent` (adding `id`, `timestamp`, `contentHash`) before passing to the triage pipeline.

## Webhook URL Migration

The Gmail webhook URL changes from `POST /api/webhook/gmail` to `POST /api/webhooks/gmail/gmail-webhook`. Users must update their Google Cloud Pub/Sub webhook configuration after migration.

## Env Vars and Secrets

`envFromConfig` maps module config keys to MCP environment variables. At `regenerateAgentConfig()` time, the actual values are resolved and written to the agent's `settings.json`. This means **secrets appear in plaintext in the agent config file**; same security model as the current system where env vars are inlined. The file at `~/.config/opentidy/agents/<name>/settings.json` must be protected by filesystem permissions.

## Config Version Migration

Removing `mcp`/`skills`/`receivers` and adding `modules` bumps config to `version: 3`. A `migrateV2ToV3()` function in `config.ts` converts old config shape to new. Since we're not in prod, this migration can be minimal (discard old fields, set `modules: {}`).

## OpenTidy MCP Server

The `opentidy` MCP server (schedule, suggestions, gaps tools) is **system infrastructure** and is always injected into the agent config regardless of modules. It is NOT a module, it's hardcoded in `regenerateAgentConfig()` as it is today.

## SSE Events

New SSE event types for module lifecycle:

```typescript
| 'module:enabled'     // module activated
| 'module:disabled'    // module deactivated
| 'module:error'       // module health check failed
| 'module:configured'  // module config updated
```

## Cloudflare Module

Cloudflare is an **infrastructure module**; it has no MCPs, no skills, no receivers. It exists purely as a config container for the tunnel setup (`authCommand` + `configFields`). This is intentional: the module abstraction allows "all optional" components. Some modules provide agent capabilities, others provide system infrastructure. Both are managed the same way in the UI.

## Not In Scope

- Multi-instance modules (same module with different configs), see TODO.md
- Reference counting for shared MCPs, see TODO.md
- Activity feed / event monitoring UI, see TODO.md
- Health checks periodic automation, see TODO.md
- Module dependency graph, see TODO.md
- GitHub as a module (stays as config field for now, migrate later)
