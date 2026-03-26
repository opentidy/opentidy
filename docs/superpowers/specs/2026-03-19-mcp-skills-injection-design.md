# Design: MCP & Skills Injection for Agent Sessions

**Date**: 2026-03-19
**Status**: Draft
**Scope**: Backend config model, settings.json generation, UI management, skill injection, marketplace integration

---

## Problem

OpenTidy spawns isolated Claude Code sessions with `CLAUDE_CONFIG_DIR` pointing to `~/.config/opentidy/agents/claude/`. This isolation means sessions don't see:

1. **MCP servers** configured in the user's personal `~/.claude/settings.json`
2. **Skills** installed in the user's personal `~/.claude/skills/` or `~/.claude/plugins/`

Currently, the `settings.json` in the agent config dir contains only permissions; no `mcpServers` section. The `generateClaudeSettings()` function in `setup/claude.ts` is designed to populate MCP servers based on `config.json`, but the `mcp` section in `config.json` is never populated by the individual setup modules.

Additionally, one-shot calls (triage, sweep, memory) correctly use `--strict-mcp-config '{"mcpServers":{}}'` to run with no MCP servers. This is correct and unchanged by this design; one-shots intentionally exclude MCPs for speed, isolation, and reduced attack surface.

---

## Design

### 1. Config Model (`config.json`)

The `mcp` and `skills` sections in `config.json` become the single source of truth for what gets injected into agent sessions. Config version bumps from `1` to `2`.

```json
{
  "version": 2,
  "mcp": {
    "curated": {
      "gmail": { "enabled": true, "configured": true },
      "camoufox": { "enabled": true, "configured": true },
      "whatsapp": { "enabled": false, "configured": false }
    },
    "marketplace": {
      "notion": {
        "label": "Notion",
        "command": "npx",
        "args": ["@notionhq/notion-mcp"],
        "envFile": "mcp-notion.env",
        "permissions": ["mcp__notion__*"],
        "source": "registry.modelcontextprotocol.io"
      }
    }
  },
  "skills": {
    "curated": {
      "browser": { "enabled": true },
      "bitwarden": { "enabled": false }
    },
    "user": [
      { "name": "comptable", "source": "~/.claude/skills/comptable", "enabled": true }
    ]
  }
}
```

#### Secret storage for marketplace MCPs

Marketplace MCP servers often require API keys. These are **not stored in `config.json`**; instead, each marketplace MCP has an `envFile` field pointing to a separate file in `~/.config/opentidy/mcp/<name>.env`:

```
# ~/.config/opentidy/mcp/notion.env
NOTION_API_KEY=sk-...
```

The `generateClaudeSettings()` function reads these env files at generation time and injects the values into `settings.json`. This keeps secrets isolated from the main config, preventing accidental exposure via debug logs or config dumps.

The env file is created by the "Add" flow (UI form or CLI) and never committed or logged.

#### Zod schemas

```typescript
const CuratedMcpStateSchema = z.object({
  enabled: z.boolean(),
  configured: z.boolean(),
});

const MarketplaceMcpSchema = z.object({
  label: z.string().min(1),
  command: z.string().min(1),
  args: z.array(z.string()),
  envFile: z.string().optional(),
  permissions: z.array(z.string().regex(/^mcp__[a-z0-9_]+__(\*|[a-z0-9_]+)$/)),
  source: z.enum(['registry.modelcontextprotocol.io', 'custom']),
});

const CuratedSkillStateSchema = z.object({
  enabled: z.boolean(),
});

const UserSkillSchema = z.object({
  name: z.string().regex(/^[a-z0-9-]+$/),
  source: z.string().refine(s => path.isAbsolute(s) || s.startsWith('~/')),
  enabled: z.boolean(),
});

const McpConfigSchema = z.object({
  curated: z.object({
    gmail: CuratedMcpStateSchema,
    camoufox: CuratedMcpStateSchema,
    whatsapp: CuratedMcpStateSchema,
  }),
  marketplace: z.record(z.string(), MarketplaceMcpSchema),
});

const SkillsConfigSchema = z.object({
  curated: z.record(z.string(), CuratedSkillStateSchema),
  user: z.array(UserSkillSchema),
});
```

#### Curated MCP servers

Known MCP servers with dedicated setup wizards, guardrail rules, and wrapper scripts. The backend knows how to build their `mcpServers` entry from minimal config:

| Name | Package | Auth type | Guardrails |
|------|---------|-----------|------------|
| `gmail` | `@gongrzhe/server-gmail-autoauth-mcp` | OAuth (browser flow) | PreToolUse: send/reply/draft verification |
| `camoufox` | `camofox-mcp` (via wrapper script) | None | PreToolUse: click/fill/eval_js verification |
| `whatsapp` | Custom Python server or `wacli` CLI | QR code | None (planned) |

Curated servers have hardcoded build logic in `generateClaudeSettings()`; the config only stores `enabled` and `configured` flags. The command, args, env, and wrapper paths are computed by the backend.

#### Marketplace MCP servers

Community MCP servers discovered from the official MCP Registry (`registry.modelcontextprotocol.io`). Stored with their full definition:

- `label`: display name
- `command`, `args`, stdio server definition
- `envFile`: optional reference to a `.env` file in `~/.config/opentidy/mcp/` (secrets stored separately)
- `permissions`: auto-generated permission patterns (e.g., `mcp__notion__*`)
- `source`: `registry.modelcontextprotocol.io` for registry servers, `custom` for user-defined

Custom MCP servers (added via "+ Add custom") use the same `marketplace` section with `source: "custom"`.

#### Curated skills

Skills that ship with OpenTidy, bundled in the repo or installed during setup:

| Name | Purpose | Essential |
|------|---------|-----------|
| `browser` | Camoufox anti-detection web navigation | Yes |
| `bitwarden` | Password manager integration | No |

Curated skills are stored in `apps/backend/config/claude/skills/` and copied to `$CLAUDE_CONFIG_DIR/skills/` when enabled.

#### User skills

Skills from the user's personal `~/.claude/skills/` or arbitrary paths. Stored as references (source path), copied/symlinked into the agent config dir when enabled.

### 2. Settings Generation Flow

**Location:** `generateClaudeSettings()` and `syncSkills()` move from `cli/setup/claude.ts` to `shared/agent-config.ts`. Both the CLI setup and API routes import from there, this avoids features importing from the CLI layer (VSA violation).

`generateClaudeSettings(config)` produces a complete `settings.json`:

```json
{
  "permissions": {
    "allow": [
      "Read", "Write", "Edit", "Glob", "Grep",
      "Bash(npm:*)", "Bash(pnpm:*)", "Bash(git:*)",
      "Bash(osascript:*)", "Bash(open:*)", "Bash(curl:*)", "Bash(python3:*)",
      "mcp__gmail__*",
      "mcp__camofox__*",
      "mcp__notion__*"
    ],
    "deny": []
  },
  "mcpServers": {
    "gmail": {
      "type": "stdio",
      "command": "npx",
      "args": ["@gongrzhe/server-gmail-autoauth-mcp"]
    },
    "camofox": {
      "type": "stdio",
      "command": "bash",
      "args": ["/Users/user/.config/opentidy/agents/claude/scripts/camofox-mcp.sh"]
    },
    "notion": {
      "type": "stdio",
      "command": "npx",
      "args": ["@notionhq/notion-mcp"],
      "env": { "NOTION_API_KEY": "sk-..." }
    }
  },
  "_regeneratedAt": "2026-03-19T14:30:00Z"
}
```

The `McpServerDef` interface adds `env`:

```typescript
interface McpServerDef {
  type: 'stdio';
  command: string;
  args: string[];
  cwd?: string;
  env?: Record<string, string>;
}
```

**Build logic:**

1. Start with `BASE_PERMISSIONS` (always granted)
2. For each curated MCP with `enabled: true` → build server entry using hardcoded logic, add permission pattern
3. For each marketplace MCP → build server entry from config + read env vars from `envFile`, add permission patterns
4. Write `settings.json` to `$CLAUDE_CONFIG_DIR/settings.json` with `_regeneratedAt` timestamp for debugging

### 3. Skill Injection Flow

Skills are synced to `$CLAUDE_CONFIG_DIR/skills/` based on config:

1. **Curated enabled** → copy from `apps/backend/config/claude/skills/<name>/` to `$CLAUDE_CONFIG_DIR/skills/<name>/`
2. **User enabled** → symlink from source path to `$CLAUDE_CONFIG_DIR/skills/<name>/`
3. **Disabled** → remove from `$CLAUDE_CONFIG_DIR/skills/`

Sync runs at:
- `opentidy setup` time
- Any config mutation (toggle, add, remove) via API
- Server startup (ensure consistency; validates symlink targets, warns/disables if broken)

**Startup validation:** at boot, the sync checks every user skill symlink. If the target path no longer exists, the skill is disabled in `config.json` and a warning is logged with `[agent-config] Skill "comptable" disabled: source path not found`.

### 4. Session Injection Matrix

| Session mode | MCP servers | Skills | Hooks |
|-------------|-------------|--------|-------|
| **One-shot** (triage, sweep, memory, title) | `--strict-mcp-config '{"mcpServers":{}}'`, none | None (not needed) | None |
| **Autonomous** (dossier work) | From `$CLAUDE_CONFIG_DIR/settings.json` | From `$CLAUDE_CONFIG_DIR/skills/` | `--plugin-dir` (guardrails) |
| **Interactive** (Take Over) | From `$CLAUDE_CONFIG_DIR/settings.json` | From `$CLAUDE_CONFIG_DIR/skills/` | `--plugin-dir` (guardrails) |

No changes to the Claude adapter's `buildArgs()`, the existing mechanism (CLAUDE_CONFIG_DIR env + settings.json) already handles autonomous/interactive. The fix is ensuring `settings.json` actually contains the MCP servers.

### 5. API Routes

New routes for MCP and skill management:

```
GET    /api/mcp                     → list all MCP servers (curated + marketplace) with status
POST   /api/mcp/curated/:name/toggle → enable/disable curated MCP
POST   /api/mcp/marketplace         → add marketplace MCP server
DELETE /api/mcp/marketplace/:name   → remove marketplace MCP server
POST   /api/setup/:name/start       → start interactive setup wizard (returns tmux session)

GET    /api/mcp/registry/search?q=  → proxy search to official MCP registry

GET    /api/skills                   → list all skills (curated + user) with status
POST   /api/skills/curated/:name/toggle → enable/disable curated skill
POST   /api/skills/user              → add user skill (path)
DELETE /api/skills/user/:name        → remove user skill
```

Every mutation endpoint:
1. Updates `config.json`
2. Calls `regenerateAgentConfig()` which rewrites `settings.json` and syncs skills
3. Returns updated state

### 6. MCP Registry Integration

The official MCP Registry API (`registry.modelcontextprotocol.io/v0.1/servers`) is used for marketplace discovery:

- **No auth required** for reads
- **Search**: `GET /v0.1/servers?search=notion`; substring search, paginated (cursor-based)
- **Server details**: `GET /v0.1/servers/{serverName}/versions/latest`, package info (npm/PyPI)
- **Cached locally**: in-memory cache with 1-hour TTL. If the registry is unreachable, serve stale cache (if available) or return an error (no stale data). Cache is not persisted to disk, rebuilds on server restart.

The backend proxies registry calls (the frontend never calls external APIs directly).

### 7. Security Model

Three trust tiers with distinct UX treatment:

| Tier | Badge | Guardrails | Warning |
|------|-------|------------|---------|
| **Curated** | "Verified by OpenTidy" | PreToolUse hooks (email, browser) | None |
| **Marketplace** | Registry source shown | PostToolUse audit (all tool calls logged) | "This MCP server is community-maintained. OpenTidy does not guarantee its security. Review the source code before enabling." |
| **Custom** | `source: "custom"` | PostToolUse audit (all tool calls logged) | "Custom MCP server, use at your own risk." |

The warning is shown:
- At install time (before the user confirms)
- Persistently in the MCP management UI (subtle indicator)

**Marketplace/Custom MCP default guardrail:** when a non-curated MCP is added, a PostToolUse `type: "http"` hook is auto-generated in `guardrails.json` that POSTs all tool calls to `http://localhost:${config.server.port}/api/hooks` for audit trail. This matches the existing curated MCP audit pattern. Non-blocking (doesn't prevent usage) but provides full visibility. The matcher uses the MCP's name prefix (e.g., `mcp__notion__` for Notion). The URL port is resolved from `config.server.port` at generation time.

**Skills security**: same tier model. Curated skills are reviewed by OpenTidy. User skills show a note that they modify agent behavior.

### 8. UI Design

The MCP/Skills management lives in a dedicated settings section of the web app:

```
┌─ MCP Servers ──────────────────────────────────────────┐
│                                                         │
│  VERIFIED BY OPENTIDY                                   │
│  ┌───────────────────────────────────────────────────┐  │
│  │ ✅ Gmail          configured    [⚙️] [Disable]    │  │
│  │ ✅ Camoufox       configured    [⚙️] [Disable]    │  │
│  │ ⬚  WhatsApp       not configured [Configure]      │  │
│  └───────────────────────────────────────────────────┘  │
│                                                         │
│  MARKETPLACE                                            │
│  ⚠️ Community servers. Verify before enabling.          │
│  ┌───────────────────────────────────────────────────┐  │
│  │ ✅ Notion         enabled       [⚙️] [Remove]     │  │
│  └───────────────────────────────────────────────────┘  │
│                                                         │
│  🔍 Search MCP registry...           [+ Add custom]    │
│                                                         │
├─ Skills ───────────────────────────────────────────────┤
│                                                         │
│  OPENTIDY                                               │
│  ┌───────────────────────────────────────────────────┐  │
│  │ ✅ /browser       essential      [Disable]        │  │
│  │ ⬚  /bitwarden     optional       [Enable]         │  │
│  └───────────────────────────────────────────────────┘  │
│                                                         │
│  USER                                                   │
│  ┌───────────────────────────────────────────────────┐  │
│  │ ✅ /comptable     ~/.claude/skills/comptable [❌] │  │
│  └───────────────────────────────────────────────────┘  │
│                                                         │
│                                      [+ Add skill]     │
└─────────────────────────────────────────────────────────┘
```

**Configure button** (curated MCP with auth flows): opens the terminal pane (xterm.js/tmux) running the existing CLI setup wizard. On completion, backend detects config change and refreshes state.

**Search MCP registry**: search input proxied to `GET /api/mcp/registry/search?q=...`. Results show name, description, package. "Add" button opens a form for required env vars, then `POST /api/mcp/marketplace`.

**Add custom**: freeform form (name, command, args as comma-separated, env vars as key-value pairs).

**Add skill**: file path input pointing to a skill directory containing `SKILL.md`.

### 9. Agent Abstraction Impact

This design is Claude Code-specific. When Gemini CLI or Copilot CLI adapters are implemented:

- Each adapter's `writeConfig()` method generates its own config format
- The `config.json` model (mcp + skills sections) stays the same, it's agent-agnostic
- Skills would need format translation (SKILL.md → GEMINI_SKILL.md), handled by the adapter
- MCP server definitions are likely compatible across agents (stdio is universal)

### 10. Files Changed

| File | Change |
|------|--------|
| `packages/shared/src/types.ts` | Rename `McpConfig` → `McpServicesConfig` (flat, used by `SetupOpts.mcpServices` for adapter), add new `McpConfig` (nested `curated`/`marketplace`, used by `OpenTidyConfig.mcp`), add `SkillsConfig`, add `env` to `McpServerDef` |
| `packages/shared/src/schemas.ts` | Add Zod schemas: `McpConfigSchema`, `MarketplaceMcpSchema`, `UserSkillSchema`, `SkillsConfigSchema` |
| `apps/backend/src/shared/agent-config.ts` | **New file**, extract `generateClaudeSettings()` + new `syncSkills()` + `regenerateAgentConfig()` from CLI layer |
| `apps/backend/src/shared/config.ts` | Add `migrateConfigV1ToV2()`, update `loadConfig()` to run migration |
| `apps/backend/src/cli/setup/claude.ts` | Import from `shared/agent-config.ts` instead of local functions |
| `apps/backend/src/cli/setup/gmail.ts` | Write `config.mcp.curated.gmail` on completion |
| `apps/backend/src/cli/setup/camoufox.ts` | Write `config.mcp.curated.camoufox` on completion |
| `apps/backend/src/cli/setup/whatsapp.ts` | Write `config.mcp.curated.whatsapp` on completion |
| `apps/backend/src/shared/agents/claude.ts` | Add comment explaining why one-shots exclude MCPs |
| `apps/backend/src/shared/spawn-agent.ts` | No changes needed |
| `apps/backend/src/server.ts` | Mount new MCP and skills API routes |
| `apps/backend/src/features/mcp/` | **New feature slice**: list, toggle, add, remove, registry proxy |
| `apps/backend/src/features/skills/` | **New feature slice**: list, toggle, add, remove |
| `apps/backend/config/claude/skills/` | **New directory**: curated skill files (browser, bitwarden) |
| `apps/web/src/features/settings/` | **New feature slice**: MCP + Skills management UI |
| `plugins/opentidy-hooks/guardrails.json` | Auto-generated PostToolUse entries for marketplace MCPs |

### 11. Migration

Config version bumps from `1` to `2`. The `loadConfig()` function detects the version and runs `migrateConfigV1ToV2()`:

```typescript
function migrateConfigV1ToV2(config: ConfigV1): ConfigV2 {
  return {
    ...config,
    version: 2,
    mcp: {
      curated: {
        gmail: config.mcp?.gmail ?? { enabled: false, configured: false },
        camoufox: config.mcp?.camoufox ?? { enabled: false, configured: false },
        whatsapp: config.mcp?.whatsapp ?? { enabled: false, configured: false },
      },
      marketplace: {},
    },
    skills: {
      curated: {
        browser: { enabled: true },
        bitwarden: { enabled: false },
      },
      user: [],
    },
  };
}
```

After migration:
1. Auto-detect what's already configured (check for Gmail OAuth tokens at `~/.gmail-mcp/`, Camoufox binary, wacli auth)
2. Update `config.mcp.curated` flags based on detection
3. Save migrated `config.json` with `version: 2`
4. Call `regenerateAgentConfig()` to write `settings.json` and sync skills
5. Log migration result: `[config] Migrated config.json v1 → v2`

This is a one-time migration, transparent to the user. The `deepMerge()` in `loadConfig()` runs **after** migration, so no hybrid state is possible.

---

## Out of Scope

- **Guardrail management UI**: adding custom PreToolUse guardrails for marketplace MCPs (PostToolUse audit is in scope)
- **Skill marketplace/registry**: no external skill registry exists yet; user skills are path-based only
- **Gemini/Copilot adapter skill format translation**: the `config.json` model is agent-agnostic, but translation logic is deferred until those adapters are implemented
- **MCP server sandboxing/containerization**: defense-in-depth measure for a future iteration
- **Per-dossier MCP/skill overrides**: all sessions get the same config. Rationale: dossiers are just markdown directories; adding per-dossier config would require a dossier metadata model that doesn't exist yet. This can be revisited if specific use cases emerge (e.g., a dossier that needs a banking MCP but not email).
