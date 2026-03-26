# Password Manager Module: Design Spec

**Date:** 2026-03-21
**Goal:** Add a `password-manager` module that gives the agent access to the user's Bitwarden/Vaultwarden vault via the official Bitwarden MCP Server, with secure master password storage using the OS keychain.

## Problem

OpenTidy agents need credentials to perform tasks (e.g., log into a website via Camoufox). Today there's no way for an agent to retrieve passwords; the user must manually provide them or the task fails.

## Constraints

- **OS-agnostic**: must work on macOS + Linux (Homebrew distribution)
- **Safe**: master password never on disk, never in env vars globally
- **No re-auth**: user does setup once, never re-enters credentials
- **No core hardcoding**: self-contained module, standard manifest
- **Open-source safe**: no secrets in repo

## Chosen Approach

**Bitwarden MCP Server** (`@bitwarden/mcp-server`) + **`@napi-rs/keyring`** for OS keychain storage.

### Why this approach

| Alternative | Why rejected |
|---|---|
| `bw serve` (REST API) | No authentication on HTTP endpoint, so any local process reads the whole vault |
| `rbw` (Rust CLI) | Unofficial, single maintainer, no MCP server |
| Vaultwarden API direct | Vault is E2E encrypted, would need to reimplement Bitwarden crypto stack |
| Static `BW_SESSION` in config | Token expires, user must re-unlock weekly |
| macOS Keychain via `security` CLI | macOS only, not OS-agnostic |
| `keytar` (npm) | Archived since 2022, dead project |

### Why `@napi-rs/keyring`

- Successor to keytar, used by VS Code, Azure SDK, MSAL
- 77k downloads/week, actively maintained
- Prebuilt binaries (no compilation at install)
- Single API: Keychain (macOS), Secret Service (Linux), Credential Manager (Windows)
- Same pattern as GitHub CLI (`gh`) and Docker CLI

## Architecture

### Module structure

```
apps/backend/modules/password-manager/
├── module.json          # standard module manifest
├── start-mcp.js         # wrapper: keychain → bw unlock → exec MCP server (compiled JS)
└── setup.ts             # setup script: bw login + keychain storage
```

### module.json

```json
{
  "name": "password-manager",
  "label": "Password Manager",
  "description": "Access Bitwarden/Vaultwarden passwords for task execution",
  "icon": "🔐",
  "version": "1.0.0",
  "mcpServers": [{
    "name": "bitwarden",
    "command": "node",
    "args": ["./start-mcp.js"],
    "envFromConfig": {
      "BW_API_BASE_URL": "apiUrl",
      "BW_IDENTITY_URL": "identityUrl"
    }
  }],
  "skills": [{
    "name": "password-manager-skill",
    "content": "When you need credentials to log into a service, use the Bitwarden MCP tools to search the vault and retrieve passwords. Always use search_vault first to find the right entry, then get_item to retrieve credentials. Never ask the user for passwords; look them up in the vault."
  }],
  "setup": {
    "checkCommand": "command -v bw >/dev/null 2>&1",
    "configFields": [
      { "key": "apiUrl", "label": "Vaultwarden API URL", "type": "text", "required": false, "placeholder": "https://vault.example.com/api (leave empty for Bitwarden cloud)" },
      { "key": "identityUrl", "label": "Vaultwarden Identity URL", "type": "text", "required": false, "placeholder": "https://vault.example.com/identity (leave empty for Bitwarden cloud)" }
    ]
  },
  "toolPermissions": {
    "scope": "per-call",
    "safe": [
      { "tool": "mcp__bitwarden__vault_status", "label": "Check vault status" },
      { "tool": "mcp__bitwarden__search_vault", "label": "Search vault entries" }
    ],
    "critical": [
      { "tool": "mcp__bitwarden__get_item", "label": "Read credential details" },
      { "tool": "mcp__bitwarden__generate_password", "label": "Generate passwords" },
      { "tool": "mcp__bitwarden__get_totp", "label": "Get TOTP codes" }
    ]
  }
}
```

**Note on tool names:** The exact MCP tool names (`mcp__bitwarden__*`) must be verified against the actual `@bitwarden/mcp-server` tool list at implementation time. The names above are based on research and may need adjustment.

### start-mcp.js (wrapper script, ~30 lines, compiled JS)

The wrapper is shipped as compiled `.js` (not `.ts`) because Claude Code spawns it as a child process via `node`. TypeScript files cannot be run by raw `node` without a loader. The `.ts` source is compiled during `pnpm build`.

Responsibilities:
1. Read master password from OS keychain via `@napi-rs/keyring`
2. Run `bw unlock --passwordenv OPENTIDY_BW_MASTER --raw` to get a fresh `BW_SESSION`
3. Resolve `@bitwarden/mcp-server` binary via `npx -y @bitwarden/mcp-server`
4. Spawn the MCP server with `BW_SESSION` in env
5. Pipe stdio through (MCP uses stdin/stdout)

The master password is:
- Read from keychain into a Node.js variable (in-memory only)
- Injected as env var into the `bw unlock` child process only (not global)
- The `bw unlock` process outputs the session token to stdout
- The session token is injected into the MCP server child process env
- Nothing touches disk

### MCP command path resolution

The manifest declares `"command": "node", "args": ["./start-mcp.js"]`. The relative path `./start-mcp.js` must resolve to the module directory.

Today `agent-config.ts` passes `mcpDef.command` and `mcpDef.args` verbatim to `settings.json`. The loader (`loader.ts`) discards the module directory path after loading the manifest. For the wrapper script to work, the path needs resolution.

**Enhancement needed:**

1. **`loader.ts`**: pass `modulesBaseDir` through so directory paths are available at config generation time.

2. **`generateSettingsFromModules()`**: accept `modulesBaseDir` parameter and resolve `./` prefixed args:

```typescript
export function generateSettingsFromModules(
  modules: Record<string, ModuleState>,
  manifests: Map<string, ModuleManifest>,
  modulesBaseDir?: string,  // NEW
): ModuleSettingsResult {
  // ...
  const resolvedArgs = (mcpDef.args ?? []).map(arg =>
    arg.startsWith('./') && modulesBaseDir
      ? join(modulesBaseDir, moduleName, arg)
      : arg
  );
```

This is consistent with how receivers already use `"transform": "./transform.ts"` with relative paths. The `modulesBaseDir` is already available at all call sites (`index.ts`, `lifecycle.ts`).

This benefits any future module that ships its own scripts.

## Setup Flow

### During `opentidy setup`

1. **Check `bw` CLI installed**: `checkCommand: "command -v bw"`
   - If missing: prompt user to install (`brew install bitwarden-cli`)
2. **Configure Vaultwarden URLs** (optional): `configFields` in UI
3. **Auth step**: runs `setup.ts` via `authCommand`:
   - `bw config server <apiUrl>` (if self-hosted, read from module config)
   - `bw login` (interactive: email + master password + 2FA in terminal)
   - Script prompts user for master password separately (secure terminal input, no echo)
   - Store master password in OS keychain via `@napi-rs/keyring`
   - Verify: `bw unlock --passwordenv OPENTIDY_BW_MASTER --raw` succeeds
4. **Done**: user never enters credentials again

### Master password capture flow

The setup script (`setup.ts`) handles this explicitly:

```
1. Run `bw login` interactively (user enters email + password + 2FA in terminal)
2. Prompt: "Enter your Bitwarden master password to store securely:"
   → uses readline with terminal echo disabled (no password visible)
3. Store in keychain: Entry('opentidy', 'bitwarden-master-password').setPassword(password)
4. Verify: spawn `bw unlock` with the stored password → must return a valid session token
5. If verify fails → delete keychain entry, show error, ask to retry
```

The master password is prompted by the setup script itself, not intercepted from `bw login`. This is a clean two-step approach: `bw login` handles auth/2FA interactively, then the script captures the password separately for keychain storage.

### Setup manifest integration

```json
"setup": {
  "authCommand": "npx tsx ./setup.ts",
  "checkCommand": "command -v bw >/dev/null 2>&1",
  "configFields": [...]
}
```

The `authCommand` uses `npx tsx` (not `node`) because setup scripts run in the OpenTidy context where tsx is available. This is different from `start-mcp.js` which is spawned by Claude Code (external process, no tsx guarantee).

## Session Flow

```
Agent session starts
  → Claude Code reads settings.json
  → Starts MCP server: node /path/to/start-mcp.js
  → start-mcp.js:
    1. keyring.getPassword('opentidy', 'bitwarden-master-password')
    2. spawn('bw', ['unlock', '--passwordenv', 'OPENTIDY_BW_MASTER', '--raw'])
    3. capture stdout → BW_SESSION token
    4. spawn('@bitwarden/mcp-server', { env: { BW_SESSION } })
    5. pipe stdin/stdout through
  → Agent uses search_vault, get_item via MCP
  → Critical tools → confirm flow (Telegram approve/deny)
```

## Security Model

| Layer | Protection |
|---|---|
| **Master password storage** | OS keychain (AES-256 on macOS, encrypted on Linux), requires OS login |
| **Master password in transit** | In-memory only, env var scoped to `bw unlock` child process |
| **Session token** | Ephemeral, scoped to MCP server child process, never persisted |
| **Vault access** | MCP server is stdio (no HTTP surface), local-only |
| **Tool gating** | `search_vault` = safe (find entries), `get_item` = critical (confirm flow via Telegram) |
| **Repo safety** | No secrets in code, all config at `~/.config/opentidy/` |

## Known Limitations

### Session token lifetime

`BW_SESSION` tokens expire after the vault locks (configurable timeout on the Bitwarden/Vaultwarden server, typically 2-4 hours of inactivity). Since `start-mcp.js` generates a fresh token each time Claude Code starts the MCP server, this is only a concern for very long-running agent sessions.

**Mitigation:** Agent sessions in OpenTidy are typically task-scoped (minutes to ~1 hour). The MCP server process is started fresh per session, so each session gets a fresh token. If a session outlives the token, the MCP server will return errors and the agent will report the failure. This is acceptable for v1.

### Offline operation

When offline, `bw unlock` works (local vault), but the MCP server's `bw sync` will fail. Cached vault entries remain accessible. The agent can retrieve credentials that were synced before going offline.

## Dependencies

| Package | Purpose | Size impact |
|---|---|---|
| `@napi-rs/keyring` | OS keychain access | ~2MB (prebuilt binary) |
| `@bitwarden/mcp-server` | Bitwarden MCP server | Installed via npx at runtime (not bundled) |
| `bw` (Bitwarden CLI) | Vault unlock | User installs via Homebrew |

Only `@napi-rs/keyring` is added to `package.json`. The Bitwarden MCP server is run via `npx` (like all other MCP servers). The `bw` CLI is a user dependency checked at setup.

## Error Handling

| Error | Behavior |
|---|---|
| Keychain empty (no master password) | MCP server fails to start → module health = error → UI shows "Run opentidy setup" |
| Wrong master password | `bw unlock` fails → MCP server fails → module health = error |
| `bw` CLI not installed | `checkCommand` fails → setup wizard prompts installation |
| Vault locked on Bitwarden server side | `bw unlock` succeeds (local vault), but `bw` operations may need `bw sync` → handled by MCP server |
| Linux without Secret Service | `@napi-rs/keyring` throws → setup step fails with clear message: "Install gnome-keyring or kwallet" |

## Files Changed

### New files
- `apps/backend/modules/password-manager/module.json`: module manifest
- `apps/backend/modules/password-manager/start-mcp.ts`: wrapper script source (compiled to `.js` by build)
- `apps/backend/modules/password-manager/setup.ts`: setup script (keychain storage + bw login)

### Modified files
- `apps/backend/src/shared/agent-config.ts`: accept `modulesBaseDir`, resolve `./` paths in MCP args (~10 lines)
- `apps/backend/src/features/modules/lifecycle.ts`: pass `modulesBaseDir` to `generateSettingsFromModules()`
- `apps/backend/src/index.ts`: pass `modulesBaseDir` to `regenerateAgentConfig()`
- `apps/backend/package.json`: add `@napi-rs/keyring` dependency

### No changes to
- Module loader (`loader.ts`): already has access to `modulesBaseDir`
- Permission system (resolver, checker, approval)
- Shared types/schemas (`ModuleManifest` unchanged)
- Frontend (ModuleList, ModuleCard, already generic)
- spawn-agent.ts

## Out of Scope

- Encrypted file fallback for headless Linux (YAGNI, add if users request)
- 1Password support (different module, different MCP server)
- Vault write operations (create/edit items): read-only for now
- `rbw` support
- Custom `envFromCommand` module system feature (wrapper script is sufficient)
