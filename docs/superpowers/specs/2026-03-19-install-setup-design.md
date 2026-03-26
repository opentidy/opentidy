# Installation & Setup Zero-Friction — Design Spec

**Date:** 2026-03-19
**Goal:** Reduce installation and setup friction to a single terminal line, then a guided UI experience. Support both human users (technical non-dev) and LLM agents.

## Problem

The current setup has too much friction:
- 10 CLI setup modules, most optional but presented as a wall
- Heavy dependency chain (Homebrew, node@22, pnpm, tmux, ttyd, python3, cloudflared, Claude CLI, Camoufox, pipx)
- Multiple OAuth flows that bounce between terminal and browser
- Manual LaunchAgent activation (`launchctl load`)
- Bearer token displayed in terminal — user must copy it somewhere
- No clear separation between "required to run" and "nice to have"
- Agent auth (Claude) hardcoded — not agent-agnostic

## Design Principles

1. **One line to start** — `curl | bash` installs everything and opens the UI
2. **Never let go** — user is guided continuously, never lost
3. **Resilient** — any step can be retried independently, no "start over"
4. **Dual-mode** — human (UI) and LLM agent (API) can complete setup
5. **Progressive** — core setup first, services at your own pace
6. **Single surface** — one place to configure things (Settings page), not two (CLI + UI)

## Architecture: 3 Phases

### Phase 1 — Install (terminal, automatic, ~3 min)

**Entry point:**
```bash
/bin/bash -c "$(curl -fsSL https://opentidy.dev/install)"
```

**What it does (silently, with progress output):**
1. Install Homebrew (if absent, detect Apple Silicon vs Intel)
2. Install system deps: `node@22`, `pnpm`, `tmux`, `ttyd`
3. Clone repo (or pull if exists) → `pnpm install && pnpm build`
4. Create config directory `~/.config/opentidy/` with default `config.json`
5. Auto-generate bearer token → write to `config.json` (silent, user never sees it)
6. Install LaunchAgent **and activate it** (`launchctl load`)
7. Wait for server health check (`GET /api/health`) → retry up to 30s
8. Open `http://localhost:5175` in default browser

**What it installs:**
- Homebrew, `node@22`, `pnpm` — build toolchain
- `tmux`, `ttyd` — session management (required for core functionality)

**What it does NOT install (deferred to Phase 2/3 via UI):**
- Agent CLIs (Claude Code, Gemini CLI, Copilot CLI) — Phase 2
- `python3`, `pipx`, Camoufox — Phase 3 (optional service)
- `cloudflared` — Phase 3 (optional service)
- `wacli` — Phase 3 (optional service)

**What it does NOT do:**
- No interactive prompts (no questions asked)
- No OAuth flows
- No MCP/skills setup
- Does not display the bearer token to the user

**Resilience:** Script is idempotent. If it crashes midway, re-run the same line.

**Port conflict:** If port 5175 is in use, the script warns and suggests `OPENTIDY_PORT=XXXX` override.

**Agent-agnostic:** No agent CLI is installed at this phase. The install script only handles system infrastructure. Agent CLIs are installed in Phase 2 via the UI terminal drawer.

### Phase 2 — Core Setup (UI wizard, first launch)

The UI detects `config.setupComplete !== true` and displays a **full-screen setup wizard** (not the dashboard). The dashboard is inaccessible until core setup is complete.

#### Step 1 — Welcome + User Info

Simple web form:
- Name (required)
- Language: fr / en (defaults to browser locale)
- Single "Continue" button

Minimal — no email, no company. Email is only used as optional context in the generated agent instructions (CLAUDE.md) and can be added later in Settings. The `status.ts` check for "user-info done" must be updated to only require `name`.

#### Step 2 — Connect an Agent

The user must connect at least one AI agent CLI for OpenTidy to function.

**UI shows agent cards:**
- Claude Code — badge "Stable"
- Gemini CLI — badge "Experimental"
- Copilot CLI — badge "Experimental" (or "Coming soon")

**Flow when user clicks "Connect" on an agent:**
1. A **drawer** slides up from the bottom of the page, containing an embedded terminal (xterm.js)
2. The backend checks if the agent CLI is installed; if not, the terminal runs the install command (e.g., `curl https://claude.ai/install.sh | bash`)
3. Once installed, the terminal runs the auth command (e.g., `claude auth login`)
4. The OAuth popup opens in the browser naturally
5. When auth completes, the terminal shows a success message
6. The drawer stays open — shows "Connected" state with a "Close" button. **No auto-close.**
7. The agent card in the UI updates to "Connected ✓"

**The user can connect multiple agents.** At least one is required to proceed. Only one agent is "active" at a time (configurable in Settings > Agents). Additional agents are available as alternatives.

**OAuth in LaunchAgent context:** When the backend runs as a LaunchAgent, `open` may not work from a PTY. The agent auth command should print the OAuth URL as a clickable link in the terminal output. The user clicks it → browser opens → OAuth completes. This works regardless of how the backend was started.

**Terminal Drawer behavior:**
- Slides from bottom, ~40% viewport height, resizable
- Contains xterm.js connected to a backend PTY via WebSocket
- Stays open until the user explicitly closes it
- On error: stays open with error visible, "Retry" button available
- Can be reopened from the agent card if closed

#### Step 3 — macOS Permissions

List of permission cards, each with:
- Icon + name (e.g., "Messages", "Mail", "Calendar")
- Status: "Required" / "Optional" / "Authorized ✓"
- "Authorize" button → backend triggers `osascript` → system permission popup appears
- After granting, status updates to "Authorized ✓"

**Required permissions** must be granted to continue. **Optional permissions** can be skipped.

**Full Disk Access** is special — cannot be triggered programmatically:
- Card shows step-by-step instructions with screenshot
- "Open System Settings" button → opens the right pane
- "I've done it" button → backend verifies via `osascript`

#### Step 4 — Done

- "OpenTidy is ready!"
- Two CTAs: "Create your first task" → /nouveau | "Configure services" → /settings
- `config.setupComplete = true` — wizard never shows again

### Phase 3 — Services Configuration (UI, progressive, Settings page)

**Location:** The existing Toolbox/Settings page, unified. One place for everything.

After core setup, the dashboard shows a **banner/nudge**:
> "Enhance OpenTidy: connect Gmail, Telegram, WhatsApp to unlock automatic task detection."
> [Configure services →]

#### Settings Page — Service Cards

Each service is a card with:
- Status indicator: `Not configured` / `Connected ✓` / `Error — reconfigure`
- "Configure" button → service-specific inline flow
- "Test" button → verifies connection works
- "Disconnect" button

**Services and their config flows:**

| Service | Config Flow |
|---------|------------|
| **Telegram** | Inline instructions with link to @BotFather → paste bot token field → "Now send a message to your bot" → auto-detect chat ID → "Test" sends a test message |
| **Gmail** | "Connect Gmail" button → OAuth popup in browser → auto-detect success → card updates |
| **WhatsApp** | "Connect" → terminal drawer opens → `wacli auth` runs → QR code visible in terminal → user scans → success detected → drawer shows "Connected" |
| **Camoufox** | "Install" button → terminal drawer opens → runs install command → success → card updates |
| **Cloudflare Tunnel** | "Connect" → terminal drawer opens → `cloudflared tunnel login` → browser OAuth → then inline form for tunnel name + hostname → backend creates tunnel + DNS + config |
| **GitHub Issues** | Inline form: PAT token field + owner + repo → "Test" verifies token has repo scope |
| **Additional agents** | Same flow as Phase 2 Step 2 — agent card + terminal drawer |
| **MCP servers** | Existing Toolbox functionality (marketplace, toggle, add custom) |
| **Skills** | Existing Toolbox functionality (curated toggle, add custom) |

#### Health Checks

- Each connected service is verified periodically (configurable, default every hour)
- On failure: card status changes to "Error — reconfigure", banner appears in dashboard
- One click → re-run the config flow for that service only

**Health status stored in config per service:**

```typescript
// Added to McpServiceState
interface McpServiceState {
  enabled: boolean;
  configured: boolean;
  health?: 'ok' | 'error' | 'unknown';  // new field
  healthCheckedAt?: string;               // ISO timestamp of last check
  healthError?: string;                   // error message if health === 'error'
}
```

#### Terminal Drawer Component

Reusable `<TerminalDrawer>` component used across the app:

```typescript
// Frontend component
interface TerminalDrawerProps {
  command: string;           // command to execute
  title: string;             // drawer title ("Connecting Claude...")
  onComplete?: () => void;   // callback when command exits 0
  onError?: () => void;      // callback when command exits non-0
}
```

- Renders xterm.js in a bottom drawer
- Backend creates a PTY, streams via WebSocket
- Drawer opens on trigger, stays open until user closes
- Shows command status: "Running..." / "Completed ✓" / "Error ✗"
- "Retry" button on error (re-runs the command)
- "Close" button always visible

This is the same component for: agent install, agent auth, WhatsApp QR, Cloudflare setup, Camoufox install, or any future flow that needs a terminal.

#### Terminal Drawer — Backend PTY

The terminal drawer requires a WebSocket PTY endpoint (new capability, distinct from the existing tmux+ttyd architecture used for agent sessions):

```
WebSocket  /api/terminal/pty?command=<base64-encoded-command>
```

**Backend implementation (`features/terminal/pty.ts`):**
1. On WebSocket upgrade, decode the `command` query parameter
2. Spawn a PTY via `node-pty` with the command, inheriting the server's environment
3. Pipe PTY stdout → WebSocket (binary frames) and WebSocket → PTY stdin
4. On PTY exit, send exit code as a final JSON message `{ "exit": 0 }`, keep WebSocket open
5. On WebSocket close, kill the PTY process if still running
6. PTY processes are tracked and cleaned up on server shutdown

**Security:**
- This endpoint is **localhost-only** — rejected if `request.headers.host` is not `localhost` or `127.0.0.1`
- The `command` parameter is validated against an allowlist of known setup commands (agent install, agent auth, wacli, cloudflared, pipx). Arbitrary command execution is not allowed.
- Setup-related endpoints (`/api/setup/*`, `/api/terminal/pty`) require auth even on localhost when `config.setupComplete === true`, to prevent post-setup abuse.

## API Endpoints (for LLM agents)

All setup flows are backed by API endpoints:

```
# Core setup
POST   /api/setup/user-info          { name, language }
GET    /api/setup/status              → all module statuses (see response shape below)

# Agent management
GET    /api/setup/agents              → list available + connected agents
POST   /api/setup/agents/install      { type: "claude" } → installs CLI
POST   /api/setup/agents/auth         { type: "claude" } → starts auth flow
GET    /api/setup/agents/auth/status  { type: "claude" } → poll auth result

# Services (same as existing + new)
POST   /api/setup/telegram            { botToken, chatId }
POST   /api/setup/gmail/start         → starts OAuth, returns URL
GET    /api/setup/gmail/status        → { connected: true/false }
POST   /api/setup/whatsapp/start      → starts wacli auth
GET    /api/setup/whatsapp/status     → { connected: true/false }
POST   /api/setup/cloudflare          { tunnelName, hostname }
POST   /api/setup/github              { token, owner?, repo? }

# Permissions (localhost-only, rejected on remote requests)
GET    /api/setup/permissions         → list with status per permission
POST   /api/setup/permissions/grant   { permission: "messages" }
POST   /api/setup/permissions/verify  → re-check all

# Health
GET    /api/services/health           → all services health status

# Service control
POST   /api/service/stop              → launchctl unload
POST   /api/service/start             → launchctl load
POST   /api/service/restart           → unload + load

# Terminal PTY (WebSocket, localhost-only)
WS     /api/terminal/pty?command=<base64>
```

**`GET /api/setup/status` response shape:**

```typescript
interface SetupStatus {
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

An LLM agent can complete the entire setup by calling these endpoints sequentially.

## Bearer Token Handling

- Auto-generated at install time (Phase 1), stored in `config.json`
- The user never sees it, never copies it
- **Localhost requests:** auth middleware skips bearer token check entirely (same-origin / localhost detection)
- **Remote requests (Cloudflare Tunnel):** bearer token required in `Authorization` header
  - On first local access, the web app stores the token in an HttpOnly, Secure, SameSite=Strict cookie with 1-year expiry
  - The web app reads the token from `GET /api/auth/token` (localhost-only endpoint) and sets the cookie
  - On remote access, the cookie is sent automatically; the backend extracts the token from the cookie as fallback if no `Authorization` header
  - If cookie expires or is cleared, user must access locally once to re-set it, or manually copy the token from Settings > Security
- **Visible in UI:** Settings > Security > "Show bearer token" (click to reveal, copy button)

## Service Start/Stop

- **Auto-start:** LaunchAgent activated during Phase 1 install, `KeepAlive: true`
- **Stop:** `opentidy stop` CLI or UI Settings > Service > Stop button
- **Start:** `opentidy start` CLI or UI Settings > Service > Start button
- **Uninstall:** `opentidy uninstall` CLI — menu: service / config / data / everything
- **UI Danger Zone:** Settings > Danger Zone > Reset config / Remove everything

## Config Type Changes

```typescript
// Added to OpenTidyConfig (packages/shared/src/types.ts)
interface OpenTidyConfig {
  // ... existing fields ...
  setupComplete?: boolean;  // set to true after Phase 2 wizard completion
}
```

## Relationship to Existing Specs

- **Onboarding spec** (`2026-03-19-onboarding-design.md`): Complementary. That spec covers the in-app experience (welcome cards, empty states, terminology) AFTER setup is complete. This spec covers getting TO that point. **Coordination:** the onboarding Welcome Card should only appear when `setupComplete === true` AND 0 dossiers exist. If `setupComplete !== true`, the setup wizard takes priority.
- **Agent-agnostic spec** (`2026-03-19-agent-agnostic-design.md`): This spec depends on the agent adapter abstraction. The setup wizard uses `resolveAgent()` and adapter-specific auth flows.

## Toolbox / Settings Page Unification

The existing `/toolbox` route becomes `/settings` and is the single location for all configuration:

**Sections:**
1. **Services** (new) — Telegram, Gmail, WhatsApp, Cloudflare, GitHub, Camoufox service cards
2. **Agents** (existing, enhanced) — agent cards with connect/disconnect, active agent selector
3. **MCP Servers** (existing) — marketplace, toggle, add custom
4. **Skills** (existing) — curated toggle, add custom
5. **Security** (new) — bearer token reveal, auth settings
6. **Service Control** (new) — start/stop/restart OpenTidy daemon
7. **Danger Zone** (existing) — reset config, remove everything

The setup wizard (Phase 2) and the Settings page share the same underlying components (AgentSetup, ServiceCard, PermissionsStep). The wizard is a guided walkthrough; Settings is the freeform access to the same controls.

## Migration from Current Setup

The current `opentidy setup` CLI command remains functional as a fallback:
- `opentidy setup` → opens `http://localhost:5175/settings` in the default browser
- `opentidy setup <module>` → opens `http://localhost:5175/settings?section=<module>` (scrolls to that section)
- The old interactive CLI menu is deprecated but not removed immediately

## Files Impacted

**New files:**
- `apps/web/src/shared/TerminalDrawer.tsx` — reusable terminal drawer component
- `apps/web/src/features/settings/SetupWizard.tsx` — full-screen first-run wizard
- `apps/web/src/features/settings/ServiceCard.tsx` — service config card component
- `apps/web/src/features/settings/PermissionsStep.tsx` — permissions wizard step
- `apps/web/src/features/settings/AgentSetup.tsx` — agent connection flow
- `apps/backend/src/features/setup/` — new feature slice for setup API endpoints
- `apps/backend/src/features/setup/user-info.ts`
- `apps/backend/src/features/setup/agents.ts`
- `apps/backend/src/features/setup/permissions.ts`
- `apps/backend/src/features/setup/services.ts`
- `apps/backend/src/features/setup/health.ts`
- `apps/backend/src/features/terminal/pty.ts` — WebSocket PTY endpoint for terminal drawer

**Modified files:**
- `install.sh` — simplified: silent install, auto-start service, open browser
- `apps/backend/src/server.ts` — mount setup routes
- `apps/backend/src/index.ts` — skip periodic tasks if `setupComplete !== true`
- `apps/web/src/App.tsx` — route guard: redirect to wizard if setup incomplete
- `apps/web/src/features/settings/` — integrate service cards into existing Toolbox
- `apps/backend/src/cli/setup.ts` — redirect to UI wizard instead of CLI menu
- `packages/shared/src/types.ts` — add `setupComplete`, service health types

**Deprecated (not removed yet):**
- `apps/backend/src/cli/setup/` modules — still functional via CLI fallback
- `setup.sh` — legacy Mac Mini script

## Not In Scope

- Mobile app installation
- Windows/Linux installation (macOS only for now)
- Auto-update redesign (existing system works)
- MCP marketplace discovery UI (existing Toolbox handles this)
- Notification preferences UI (separate concern)
