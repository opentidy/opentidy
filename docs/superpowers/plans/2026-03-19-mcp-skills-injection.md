# MCP & Skills Injection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable OpenTidy agent sessions to use MCP servers and skills by injecting them into the isolated `CLAUDE_CONFIG_DIR/settings.json`, with a config model, API routes, and UI for management.

**Architecture:** Config-driven approach — `config.json` is the SSOT for enabled MCP servers (curated + marketplace) and skills (curated + user). A `regenerateAgentConfig()` function writes `settings.json` and syncs skills to `$CLAUDE_CONFIG_DIR/`. API routes enable CRUD via the web app. Registry proxy provides marketplace discovery.

**Tech Stack:** TypeScript, Zod, Hono, Vitest, React 19, Tailwind CSS v4

**Spec:** `docs/superpowers/specs/2026-03-19-mcp-skills-injection-design.md`

---

## File Structure

### Shared package (`packages/shared/src/`)

| File | Responsibility |
|------|---------------|
| `types.ts` | Rename existing `McpConfig` → `McpServicesConfig` (used by `SetupOpts.mcpServices`), add `McpConfigV2` (used by `OpenTidyConfig.mcp`), add `SkillsConfig`, `MarketplaceMcp`, `UserSkill` |
| `schemas.ts` | Zod schemas for all new types |

### Backend — shared (`apps/backend/src/shared/`)

| File | Responsibility |
|------|---------------|
| `agent-config.ts` (new) | `generateClaudeSettings()`, `syncSkills()`, `regenerateAgentConfig()`, `readEnvFile()` |
| `agent-config.test.ts` (new) | Tests for settings generation + skill sync |
| `config.ts` | Add `migrateConfigV1ToV2()`, update `loadConfig()`, update `DEFAULT_CONFIG` |
| `config.test.ts` | Add migration tests |

### Backend — features (`apps/backend/src/features/`)

| File | Responsibility |
|------|---------------|
| `mcp/list.ts` (new) | `GET /api/mcp` — list curated + marketplace MCPs |
| `mcp/toggle.ts` (new) | `POST /api/mcp/curated/:name/toggle` — enable/disable curated |
| `mcp/add.ts` (new) | `POST /api/mcp/marketplace` — add marketplace/custom MCP |
| `mcp/remove.ts` (new) | `DELETE /api/mcp/marketplace/:name` — remove marketplace MCP |
| `mcp/registry.ts` (new) | `GET /api/mcp/registry/search` — proxy to official MCP registry |
| `mcp/mcp.test.ts` (new) | Tests for all MCP routes |
| `skills/list.ts` (new) | `GET /api/skills` — list curated + user skills |
| `skills/toggle.ts` (new) | `POST /api/skills/curated/:name/toggle` — enable/disable curated |
| `skills/add.ts` (new) | `POST /api/skills/user` — add user skill |
| `skills/remove.ts` (new) | `DELETE /api/skills/user/:name` — remove user skill |
| `skills/skills.test.ts` (new) | Tests for all skills routes |

### Backend — CLI (`apps/backend/src/cli/setup/`)

| File | Responsibility |
|------|---------------|
| `claude.ts` | Import `generateClaudeSettings` from `shared/agent-config.ts` instead of local |
| `gmail.ts` | Write to `config.mcp.curated.gmail` on completion |
| `camoufox.ts` | Write to `config.mcp.curated.camoufox` on completion |
| `whatsapp.ts` | Write to `config.mcp.curated.whatsapp` on completion |

### Backend — config templates

| File | Responsibility |
|------|---------------|
| `config/claude/skills/browser/SKILL.md` (new) | Curated browser skill (Camoufox) |
| `config/claude/skills/bitwarden/SKILL.md` (new) | Curated bitwarden skill |

### Frontend (`apps/web/src/features/settings/`)

| File | Responsibility |
|------|---------------|
| `Settings.tsx` (new) | Settings page — MCP + Skills management |
| `McpSection.tsx` (new) | MCP servers section (curated + marketplace + search) |
| `SkillsSection.tsx` (new) | Skills section (curated + user) |
| `AddMcpDialog.tsx` (new) | Add custom MCP dialog |
| `Settings.test.tsx` (new) | Component tests |

---

## Task 1: Types & Schemas

**Files:**
- Modify: `packages/shared/src/types.ts:225-240`
- Modify: `packages/shared/src/schemas.ts`
- Test: `packages/shared/tests/schemas.test.ts`

- [ ] **Step 1: Write failing test for new schemas**

```typescript
// packages/shared/tests/schemas.test.ts — add at end
import { MarketplaceMcpSchema, UserSkillSchema, McpConfigV2Schema, SkillsConfigSchema } from '../src/schemas.js';

describe('MarketplaceMcpSchema', () => {
  it('validates a valid marketplace MCP', () => {
    const result = MarketplaceMcpSchema.safeParse({
      label: 'Notion',
      command: 'npx',
      args: ['@notionhq/notion-mcp'],
      envFile: 'mcp-notion.env',
      permissions: ['mcp__notion__*'],
      source: 'registry.modelcontextprotocol.io',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid permission pattern', () => {
    const result = MarketplaceMcpSchema.safeParse({
      label: 'Bad',
      command: 'npx',
      args: [],
      permissions: ['invalid-pattern'],
      source: 'custom',
    });
    expect(result.success).toBe(false);
  });
});

describe('UserSkillSchema', () => {
  it('validates a valid user skill', () => {
    const result = UserSkillSchema.safeParse({
      name: 'comptable',
      source: '/Users/alice/.claude/skills/comptable',
      enabled: true,
    });
    expect(result.success).toBe(true);
  });

  it('accepts tilde paths', () => {
    const result = UserSkillSchema.safeParse({
      name: 'my-skill',
      source: '~/.claude/skills/my-skill',
      enabled: false,
    });
    expect(result.success).toBe(true);
  });

  it('rejects relative paths', () => {
    const result = UserSkillSchema.safeParse({
      name: 'bad',
      source: 'relative/path',
      enabled: true,
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid skill names', () => {
    const result = UserSkillSchema.safeParse({
      name: 'Bad Name!',
      source: '/valid/path',
      enabled: true,
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @opentidy/shared test -- --run`
Expected: FAIL — `MarketplaceMcpSchema` not exported

- [ ] **Step 3: Add types to `types.ts`**

In `packages/shared/src/types.ts`:

First, rename the existing `McpConfig` interface (line 236) to `McpServicesConfig` and update `SetupOpts.mcpServices` (line 199) to use the new name. This preserves the flat shape used by `AgentAdapter.writeConfig()`.

Then, after the renamed interface, add:

```typescript
// === MCP Config V2 (nested curated/marketplace) ===
export interface MarketplaceMcp {
  label: string;
  command: string;
  args: string[];
  envFile?: string;
  permissions: string[];
  source: 'registry.modelcontextprotocol.io' | 'custom';
}

export interface McpConfigV2 {
  curated: {
    gmail: McpServiceState;
    camoufox: McpServiceState;
    whatsapp: WhatsAppMcpState;
  };
  marketplace: Record<string, MarketplaceMcp>;
}

// === Skills Config ===
export interface CuratedSkillState {
  enabled: boolean;
}

export interface UserSkill {
  name: string;
  source: string;
  enabled: boolean;
}

export interface SkillsConfig {
  curated: Record<string, CuratedSkillState>;
  user: UserSkill[];
}
```

Update `OpenTidyConfig.mcp` type to `McpConfigV2` and add `skills`:

```typescript
export interface OpenTidyConfig {
  // ... existing fields ...
  mcp: McpConfigV2;
  skills: SkillsConfig;
}
```

- [ ] **Step 4: Add Zod schemas to `schemas.ts`**

In `packages/shared/src/schemas.ts`, add:

```typescript
// === MCP & Skills Config Schemas ===
export const CuratedMcpStateSchema = z.object({
  enabled: z.boolean(),
  configured: z.boolean(),
});

export const MarketplaceMcpSchema = z.object({
  label: z.string().min(1),
  command: z.string().min(1),
  args: z.array(z.string()),
  envFile: z.string().optional(),
  permissions: z.array(z.string().regex(/^mcp__[a-z0-9_-]+__(\*|[a-z0-9_-]+)$/)),
  source: z.enum(['registry.modelcontextprotocol.io', 'custom']),
});

export const CuratedSkillStateSchema = z.object({
  enabled: z.boolean(),
});

export const UserSkillSchema = z.object({
  name: z.string().regex(/^[a-z0-9-]+$/),
  source: z.string().refine(s => s.startsWith('/') || s.startsWith('~/')),
  enabled: z.boolean(),
});

export const McpConfigV2Schema = z.object({
  curated: z.object({
    gmail: CuratedMcpStateSchema,
    camoufox: CuratedMcpStateSchema,
    whatsapp: CuratedMcpStateSchema.extend({
      wacliPath: z.string(),
      mcpServerPath: z.string(),
    }),
  }),
  marketplace: z.record(z.string(), MarketplaceMcpSchema),
});

export const SkillsConfigSchema = z.object({
  curated: z.record(z.string(), CuratedSkillStateSchema),
  user: z.array(UserSkillSchema),
});
```

Export the inferred types:

```typescript
export type MarketplaceMcpInput = z.infer<typeof MarketplaceMcpSchema>;
export type UserSkillInput = z.infer<typeof UserSkillSchema>;
```

Update `packages/shared/src/index.ts` to export the new schemas and types.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @opentidy/shared test -- --run`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/types.ts packages/shared/src/schemas.ts packages/shared/src/index.ts packages/shared/tests/schemas.test.ts
git commit -m "feat(shared): add McpConfigV2, SkillsConfig types and Zod schemas"
```

---

## Task 2: Config Migration v1 → v2

**Files:**
- Modify: `apps/backend/src/shared/config.ts`
- Test: `apps/backend/src/shared/config.test.ts`

- [ ] **Step 1: Write failing test for migration**

In `apps/backend/src/shared/config.test.ts`, add:

```typescript
describe('config v1 → v2 migration', () => {
  it('migrates flat mcp to nested curated/marketplace', () => {
    const configPath = join(configDir, 'config.json');
    writeFileSync(configPath, JSON.stringify({
      version: 1,
      mcp: {
        gmail: { enabled: true, configured: true },
        camoufox: { enabled: false, configured: false },
        whatsapp: { enabled: false, configured: false, wacliPath: '', mcpServerPath: '' },
      },
    }));
    const config = loadConfig(configPath);
    expect(config.version).toBe(2);
    expect(config.mcp.curated.gmail.enabled).toBe(true);
    expect(config.mcp.marketplace).toEqual({});
    expect(config.skills.curated.browser.enabled).toBe(true);
    expect(config.skills.user).toEqual([]);
  });

  it('handles missing mcp section in v1', () => {
    const configPath = join(configDir, 'config.json');
    writeFileSync(configPath, JSON.stringify({ version: 1 }));
    const config = loadConfig(configPath);
    expect(config.version).toBe(2);
    expect(config.mcp.curated.gmail.enabled).toBe(false);
  });

  it('does not re-migrate v2 config', () => {
    const configPath = join(configDir, 'config.json');
    writeFileSync(configPath, JSON.stringify({
      version: 2,
      mcp: {
        curated: {
          gmail: { enabled: true, configured: true },
          camoufox: { enabled: false, configured: false },
          whatsapp: { enabled: false, configured: false, wacliPath: '', mcpServerPath: '' },
        },
        marketplace: { notion: { label: 'Notion', command: 'npx', args: ['@notionhq/notion-mcp'], permissions: ['mcp__notion__*'], source: 'custom' } },
      },
      skills: { curated: { browser: { enabled: true } }, user: [] },
    }));
    const config = loadConfig(configPath);
    expect(config.mcp.marketplace.notion).toBeDefined();
    expect(config.mcp.marketplace.notion.label).toBe('Notion');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @opentidy/backend test -- --run config.test`
Expected: FAIL — `config.mcp.curated` is undefined

- [ ] **Step 3: Implement migration in `config.ts`**

In `apps/backend/src/shared/config.ts`:

1. Update `DEFAULT_CONFIG.mcp` to the V2 shape:

```typescript
mcp: {
  curated: {
    gmail: { enabled: false, configured: false },
    camoufox: { enabled: false, configured: false },
    whatsapp: { enabled: false, configured: false, wacliPath: '', mcpServerPath: '' },
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
```

2. Update `DEFAULT_CONFIG.version` to `2`.

3. Add migration function before `loadConfig`:

```typescript
function migrateV1ToV2(parsed: Record<string, any>): Record<string, any> {
  if (parsed.version && parsed.version >= 2) return parsed;

  console.log('[config] Migrating config.json v1 → v2');

  const oldMcp = parsed.mcp || {};
  parsed.version = 2;
  parsed.mcp = {
    curated: {
      gmail: oldMcp.gmail ?? { enabled: false, configured: false },
      camoufox: oldMcp.camoufox ?? { enabled: false, configured: false },
      whatsapp: oldMcp.whatsapp ?? { enabled: false, configured: false, wacliPath: '', mcpServerPath: '' },
    },
    marketplace: {},
  };
  parsed.skills = parsed.skills ?? {
    curated: { browser: { enabled: true }, bitwarden: { enabled: false } },
    user: [],
  };

  return parsed;
}
```

4. Call `migrateV1ToV2(parsed)` in `loadConfig()` before `deepMerge`:

```typescript
export function loadConfig(configPath?: string): OpenTidyConfig {
  const path = configPath || getConfigPath();
  try {
    const raw = readFileSync(path, 'utf-8');
    let parsed = JSON.parse(raw);
    const migrated = migrateV1ToV2(parsed);
    const config = deepMerge(DEFAULT_CONFIG, migrated);
    // ... existing claudeConfig → agentConfig migration ...

    // Persist migration if version changed
    if (parsed.version !== config.version) {
      saveConfig(path, config);
    }

    return config;
  } catch {
    return { ...structuredClone(DEFAULT_CONFIG) };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @opentidy/backend test -- --run config.test`
Expected: PASS

- [ ] **Step 5: Fix existing tests that use old McpConfig shape**

Search for tests that use `config.mcp.gmail` directly (flat) and update to `config.mcp.curated.gmail`. Key files:
- `apps/backend/src/cli/setup/claude.test.ts` — `buildTestConfig` overrides
- `apps/backend/src/cli/setup/gmail.test.ts`
- `apps/backend/src/cli/setup/camoufox.test.ts`
- `apps/backend/src/cli/setup/whatsapp.test.ts`
- `apps/backend/src/cli/setup/config-shape.test.ts`

Run: `pnpm --filter @opentidy/backend test -- --run`
Expected: PASS (all existing tests)

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/shared/config.ts apps/backend/src/shared/config.test.ts
git add apps/backend/src/cli/setup/claude.test.ts apps/backend/src/cli/setup/gmail.test.ts
git add apps/backend/src/cli/setup/camoufox.test.ts apps/backend/src/cli/setup/whatsapp.test.ts
git add apps/backend/src/cli/setup/config-shape.test.ts
git commit -m "feat(backend): config v1→v2 migration for nested MCP + skills"
```

---

## Task 3: Agent Config Generation

**Files:**
- Create: `apps/backend/src/shared/agent-config.ts`
- Create: `apps/backend/src/shared/agent-config.test.ts`
- Modify: `apps/backend/src/cli/setup/claude.ts` (remove extracted functions)

- [ ] **Step 1: Write failing test for `generateClaudeSettings` with marketplace MCPs**

```typescript
// apps/backend/src/shared/agent-config.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { generateClaudeSettings, syncSkills, regenerateAgentConfig, readEnvFile } from './agent-config.js';
import type { OpenTidyConfig } from '@opentidy/shared';
import { loadConfig } from './config.js';

function buildTestConfig(overrides: Record<string, unknown> = {}): OpenTidyConfig {
  const dir = join(tmpdir(), `opentidy-cfg-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, 'config.json');
  writeFileSync(path, JSON.stringify({ version: 2, ...overrides }));
  const config = loadConfig(path);
  rmSync(dir, { recursive: true, force: true });
  return config;
}

describe('generateClaudeSettings', () => {
  it('includes curated MCP servers when enabled', () => {
    const config = buildTestConfig({
      claudeConfig: { dir: '/tmp/test' },
      mcp: {
        curated: {
          gmail: { enabled: true, configured: true },
          camoufox: { enabled: false, configured: false },
          whatsapp: { enabled: false, configured: false, wacliPath: '', mcpServerPath: '' },
        },
        marketplace: {},
      },
    });
    const settings = generateClaudeSettings(config);
    expect(settings.mcpServers.gmail).toBeDefined();
    expect(settings.permissions.allow).toContain('mcp__gmail__*');
  });

  it('includes marketplace MCP servers', () => {
    const config = buildTestConfig({
      claudeConfig: { dir: '/tmp/test' },
      mcp: {
        curated: {
          gmail: { enabled: false, configured: false },
          camoufox: { enabled: false, configured: false },
          whatsapp: { enabled: false, configured: false, wacliPath: '', mcpServerPath: '' },
        },
        marketplace: {
          notion: {
            label: 'Notion',
            command: 'npx',
            args: ['@notionhq/notion-mcp'],
            permissions: ['mcp__notion__*'],
            source: 'custom',
          },
        },
      },
    });
    const settings = generateClaudeSettings(config);
    expect(settings.mcpServers.notion).toBeDefined();
    expect(settings.mcpServers.notion.command).toBe('npx');
    expect(settings.permissions.allow).toContain('mcp__notion__*');
  });

  it('reads env from envFile', () => {
    const envDir = mkdtempSync(join(tmpdir(), 'opentidy-env-'));
    writeFileSync(join(envDir, 'mcp-notion.env'), 'NOTION_API_KEY=sk-test-123\nANOTHER=val');
    const config = buildTestConfig({
      claudeConfig: { dir: '/tmp/test' },
      mcp: {
        curated: {
          gmail: { enabled: false, configured: false },
          camoufox: { enabled: false, configured: false },
          whatsapp: { enabled: false, configured: false, wacliPath: '', mcpServerPath: '' },
        },
        marketplace: {
          notion: {
            label: 'Notion',
            command: 'npx',
            args: ['@notionhq/notion-mcp'],
            envFile: 'mcp-notion.env',
            permissions: ['mcp__notion__*'],
            source: 'custom',
          },
        },
      },
    });
    const settings = generateClaudeSettings(config, envDir);
    expect(settings.mcpServers.notion.env).toEqual({ NOTION_API_KEY: 'sk-test-123', ANOTHER: 'val' });
    rmSync(envDir, { recursive: true, force: true });
  });

  it('adds _regeneratedAt timestamp', () => {
    const config = buildTestConfig({
      claudeConfig: { dir: '/tmp/test' },
    });
    const settings = generateClaudeSettings(config);
    expect(settings._regeneratedAt).toBeDefined();
  });
});

describe('readEnvFile', () => {
  it('parses KEY=VALUE lines', () => {
    const dir = mkdtempSync(join(tmpdir(), 'opentidy-env-'));
    writeFileSync(join(dir, 'test.env'), 'FOO=bar\n# comment\nBAZ=qux\n');
    const env = readEnvFile(join(dir, 'test.env'));
    expect(env).toEqual({ FOO: 'bar', BAZ: 'qux' });
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns empty object for missing file', () => {
    const env = readEnvFile('/nonexistent/file.env');
    expect(env).toEqual({});
  });
});

describe('syncSkills', () => {
  let configDir: string;

  beforeEach(() => {
    configDir = mkdtempSync(join(tmpdir(), 'opentidy-skills-'));
  });

  afterEach(() => {
    rmSync(configDir, { recursive: true, force: true });
  });

  it('copies curated skill when enabled', () => {
    // Create a fake curated skill source
    const curatedDir = join(configDir, 'curated-skills', 'browser');
    mkdirSync(curatedDir, { recursive: true });
    writeFileSync(join(curatedDir, 'SKILL.md'), '---\nname: browser\n---\nUse Camoufox');

    const targetDir = join(configDir, 'target');
    mkdirSync(targetDir, { recursive: true });

    syncSkills(
      { curated: { browser: { enabled: true } }, user: [] },
      targetDir,
      join(configDir, 'curated-skills'),
    );

    expect(existsSync(join(targetDir, 'skills', 'browser', 'SKILL.md'))).toBe(true);
  });

  it('removes disabled skills', () => {
    const targetDir = join(configDir, 'target');
    const skillDir = join(targetDir, 'skills', 'browser');
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, 'SKILL.md'), 'old content');

    syncSkills(
      { curated: { browser: { enabled: false } }, user: [] },
      targetDir,
      join(configDir, 'curated-skills'),
    );

    expect(existsSync(skillDir)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @opentidy/backend test -- --run agent-config.test`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `agent-config.ts`**

Create `apps/backend/src/shared/agent-config.ts`:

```typescript
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync, symlinkSync, lstatSync } from 'fs';
import { join, resolve } from 'path';
import type { OpenTidyConfig, SkillsConfig } from '@opentidy/shared';

const BASE_PERMISSIONS = [
  'Read', 'Write', 'Edit', 'Glob', 'Grep',
  'Bash(npm:*)', 'Bash(pnpm:*)', 'Bash(git:*)',
  'Bash(osascript:*)', 'Bash(open:*)',
  'Bash(curl:*)', 'Bash(python3:*)',
];

interface McpServerDef {
  type: 'stdio';
  command: string;
  args: string[];
  cwd?: string;
  env?: Record<string, string>;
}

interface ClaudeSettings {
  permissions: { allow: string[]; deny: string[] };
  mcpServers: Record<string, McpServerDef>;
  _regeneratedAt: string;
}

export function readEnvFile(filePath: string): Record<string, string> {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const env: Record<string, string> = {};
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex > 0) {
        env[trimmed.slice(0, eqIndex)] = trimmed.slice(eqIndex + 1);
      }
    }
    return env;
  } catch {
    return {};
  }
}

export function generateClaudeSettings(config: OpenTidyConfig, envDir?: string): ClaudeSettings {
  const allow = [...BASE_PERMISSIONS];
  const mcpServers: Record<string, McpServerDef> = {};
  const mcp = config.mcp;

  // Curated: Gmail
  if (mcp.curated.gmail.enabled) {
    allow.push('mcp__gmail__*');
    mcpServers.gmail = {
      type: 'stdio',
      command: 'npx',
      args: ['@gongrzhe/server-gmail-autoauth-mcp'],
    };
  }

  // Curated: Camoufox
  if (mcp.curated.camoufox.enabled) {
    allow.push('mcp__camofox__*');
    const configDir = config.agentConfig?.configDir || config.claudeConfig?.dir || '';
    const wrapperPath = join(configDir, 'scripts', 'camofox-mcp.sh');
    mcpServers.camofox = {
      type: 'stdio',
      command: 'bash',
      args: [wrapperPath],
    };
  }

  // Curated: WhatsApp
  if (mcp.curated.whatsapp.enabled) {
    if (mcp.curated.whatsapp.mcpServerPath) {
      allow.push('mcp__whatsapp__*');
      mcpServers.whatsapp = {
        type: 'stdio',
        command: 'uv',
        args: ['run', 'server.py'],
        cwd: mcp.curated.whatsapp.mcpServerPath,
      };
    } else {
      allow.push('Bash(wacli:*)');
    }
  }

  // Marketplace MCPs
  const mcpEnvDir = envDir || join(config.agentConfig?.configDir || '', '..', 'mcp');
  for (const [name, mcpDef] of Object.entries(mcp.marketplace)) {
    const serverDef: McpServerDef = {
      type: 'stdio',
      command: mcpDef.command,
      args: mcpDef.args,
    };
    if (mcpDef.envFile) {
      const env = readEnvFile(join(mcpEnvDir, mcpDef.envFile));
      if (Object.keys(env).length > 0) {
        serverDef.env = env;
      }
    }
    mcpServers[name] = serverDef;
    for (const perm of mcpDef.permissions) {
      allow.push(perm);
    }
  }

  return {
    permissions: { allow, deny: [] },
    mcpServers,
    _regeneratedAt: new Date().toISOString(),
  };
}

export function syncSkills(
  skills: SkillsConfig,
  configDir: string,
  curatedSkillsDir: string,
): void {
  const targetDir = join(configDir, 'skills');
  mkdirSync(targetDir, { recursive: true });

  // Curated skills
  for (const [name, state] of Object.entries(skills.curated)) {
    const targetPath = join(targetDir, name);
    if (state.enabled) {
      const sourcePath = join(curatedSkillsDir, name);
      if (existsSync(sourcePath)) {
        rmSync(targetPath, { recursive: true, force: true });
        cpSync(sourcePath, targetPath, { recursive: true });
      }
    } else {
      rmSync(targetPath, { recursive: true, force: true });
    }
  }

  // User skills
  for (const skill of skills.user) {
    const targetPath = join(targetDir, skill.name);
    if (skill.enabled) {
      const sourcePath = skill.source.startsWith('~/')
        ? join(process.env.HOME || '', skill.source.slice(2))
        : skill.source;
      if (existsSync(sourcePath)) {
        rmSync(targetPath, { recursive: true, force: true });
        try {
          symlinkSync(sourcePath, targetPath);
        } catch {
          console.warn(`[agent-config] Failed to symlink skill "${skill.name}" from ${sourcePath}`);
        }
      } else {
        console.warn(`[agent-config] Skill "${skill.name}" disabled: source path not found at ${sourcePath}`);
        // Disable in config and persist — startup validation
        skill.enabled = false;
      }
    } else {
      rmSync(targetPath, { recursive: true, force: true });
    }
  }
}

export function regenerateAgentConfig(config: OpenTidyConfig, envDir?: string): void {
  const configDir = config.agentConfig?.configDir || config.claudeConfig?.dir || '';
  if (!configDir) {
    console.warn('[agent-config] No agent config dir set, skipping regeneration');
    return;
  }

  mkdirSync(configDir, { recursive: true });

  // Generate settings.json
  const settings = generateClaudeSettings(config, envDir);
  writeFileSync(join(configDir, 'settings.json'), JSON.stringify(settings, null, 2) + '\n');
  console.log(`[agent-config] Regenerated settings.json (${Object.keys(settings.mcpServers).length} MCP servers)`);

  // Sync skills
  const curatedSkillsDir = resolve(import.meta.dirname, '../../../config/claude/skills');
  if (config.skills) {
    syncSkills(config.skills, configDir, curatedSkillsDir);
    console.log('[agent-config] Skills synced');
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @opentidy/backend test -- --run agent-config.test`
Expected: PASS

- [ ] **Step 5: Update `cli/setup/claude.ts` to import from `shared/agent-config.ts`**

In `apps/backend/src/cli/setup/claude.ts`:
- Remove `BASE_PERMISSIONS`, `McpServerDef`, `ClaudeSettings`, `generateClaudeSettings` (lines 12-75)
- Add import: `import { generateClaudeSettings } from '../../shared/agent-config.js';`
- Keep `generateClaudeMd` and `setupClaude` in this file (they're CLI-specific)
- Update `setupClaude` to use `config.mcp.curated.*` instead of `config.mcp.*`

- [ ] **Step 6: Run all tests to verify nothing broke**

Run: `pnpm --filter @opentidy/backend test -- --run`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/shared/agent-config.ts apps/backend/src/shared/agent-config.test.ts
git add apps/backend/src/cli/setup/claude.ts
git commit -m "feat(backend): extract agent config generation to shared/agent-config.ts"
```

---

## Task 4: Update Setup Modules

**Files:**
- Modify: `apps/backend/src/cli/setup/gmail.ts:64-66`
- Modify: `apps/backend/src/cli/setup/camoufox.ts:52-54`
- Modify: `apps/backend/src/cli/setup/whatsapp.ts`

- [ ] **Step 1: Update `gmail.ts` to write to nested config path**

Change lines 64-66 from:
```typescript
config.mcp.gmail.enabled = true;
config.mcp.gmail.configured = true;
```
to:
```typescript
config.mcp.curated.gmail.enabled = true;
config.mcp.curated.gmail.configured = true;
```

- [ ] **Step 2: Update `camoufox.ts`**

Change lines 52-54 from:
```typescript
config.mcp.camoufox.enabled = true;
config.mcp.camoufox.configured = true;
```
to:
```typescript
config.mcp.curated.camoufox.enabled = true;
config.mcp.curated.camoufox.configured = true;
```

Also update the `claudeConfig?.dir` reference (line 38) to use `agentConfig.configDir`:
```typescript
const claudeConfigDir = config.agentConfig?.configDir || config.claudeConfig?.dir;
```

- [ ] **Step 3: Update `whatsapp.ts`** similarly — all `config.mcp.whatsapp.*` → `config.mcp.curated.whatsapp.*`

- [ ] **Step 4: Run all setup tests**

Run: `pnpm --filter @opentidy/backend test -- --run setup`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/cli/setup/gmail.ts apps/backend/src/cli/setup/camoufox.ts apps/backend/src/cli/setup/whatsapp.ts
git commit -m "refactor(cli): update setup modules to write to config.mcp.curated"
```

---

## Task 5: MCP Feature Slice (Backend API)

**Files:**
- Create: `apps/backend/src/features/mcp/list.ts`
- Create: `apps/backend/src/features/mcp/toggle.ts`
- Create: `apps/backend/src/features/mcp/add.ts`
- Create: `apps/backend/src/features/mcp/remove.ts`
- Create: `apps/backend/src/features/mcp/mcp.test.ts`

- [ ] **Step 1: Write failing test for MCP list route**

```typescript
// apps/backend/src/features/mcp/mcp.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { listMcpRoute } from './list.js';
import { toggleMcpRoute } from './toggle.js';
import { addMcpRoute } from './add.js';
import { removeMcpRoute } from './remove.js';
import type { McpDeps } from './list.js';

function createTestDeps(configDir: string): McpDeps {
  const configPath = join(configDir, 'config.json');
  return {
    configPath,
    agentConfigDir: join(configDir, 'agent'),
    mcpEnvDir: join(configDir, 'mcp'),
  };
}

describe('MCP routes', () => {
  let configDir: string;

  beforeEach(() => {
    configDir = mkdtempSync(join(tmpdir(), 'opentidy-mcp-'));
    mkdirSync(join(configDir, 'agent'), { recursive: true });
    mkdirSync(join(configDir, 'mcp'), { recursive: true });
    writeFileSync(join(configDir, 'config.json'), JSON.stringify({
      version: 2,
      mcp: {
        curated: {
          gmail: { enabled: true, configured: true },
          camoufox: { enabled: false, configured: false },
          whatsapp: { enabled: false, configured: false, wacliPath: '', mcpServerPath: '' },
        },
        marketplace: {},
      },
      skills: { curated: { browser: { enabled: true } }, user: [] },
    }));
  });

  afterEach(() => {
    rmSync(configDir, { recursive: true, force: true });
  });

  it('GET /mcp lists all servers', async () => {
    const deps = createTestDeps(configDir);
    const app = new Hono();
    app.route('/api', listMcpRoute(deps));
    const res = await app.request('/api/mcp');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.curated.gmail.enabled).toBe(true);
    expect(body.marketplace).toEqual({});
  });

  it('POST /mcp/curated/gmail/toggle disables gmail', async () => {
    const deps = createTestDeps(configDir);
    const app = new Hono();
    app.route('/api', toggleMcpRoute(deps));
    app.route('/api', listMcpRoute(deps));

    const res = await app.request('/api/mcp/curated/gmail/toggle', { method: 'POST' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.curated.gmail.enabled).toBe(false);
  });

  it('POST /mcp/marketplace adds a new MCP', async () => {
    const deps = createTestDeps(configDir);
    const app = new Hono();
    app.route('/api', addMcpRoute(deps));

    const res = await app.request('/api/mcp/marketplace', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'notion',
        label: 'Notion',
        command: 'npx',
        args: ['@notionhq/notion-mcp'],
        permissions: ['mcp__notion__*'],
        source: 'custom',
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.marketplace.notion).toBeDefined();
  });

  it('DELETE /mcp/marketplace/notion removes it', async () => {
    // First add it
    writeFileSync(join(configDir, 'config.json'), JSON.stringify({
      version: 2,
      mcp: {
        curated: {
          gmail: { enabled: false, configured: false },
          camoufox: { enabled: false, configured: false },
          whatsapp: { enabled: false, configured: false, wacliPath: '', mcpServerPath: '' },
        },
        marketplace: {
          notion: { label: 'Notion', command: 'npx', args: [], permissions: ['mcp__notion__*'], source: 'custom' },
        },
      },
      skills: { curated: {}, user: [] },
    }));
    const deps = createTestDeps(configDir);
    const app = new Hono();
    app.route('/api', removeMcpRoute(deps));

    const res = await app.request('/api/mcp/marketplace/notion', { method: 'DELETE' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.marketplace.notion).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @opentidy/backend test -- --run mcp.test`
Expected: FAIL — modules not found

- [ ] **Step 3: Implement MCP routes**

Create each route file following the existing pattern (factory function returning a Hono app). Each mutation:
1. Reads config via `loadConfig(deps.configPath)`
2. Mutates `config.mcp`
3. Calls `saveConfig(deps.configPath, config)`
4. Calls `regenerateAgentConfig(config, deps.mcpEnvDir)`
5. Returns the updated `config.mcp`

`list.ts`: `GET /mcp` → return `config.mcp`
`toggle.ts`: `POST /mcp/curated/:name/toggle` → flip `enabled`, save, regenerate
`add.ts`: `POST /mcp/marketplace` → validate with `MarketplaceMcpSchema`, add to marketplace, save env to `mcpEnvDir/<name>.env`, regenerate
`remove.ts`: `DELETE /mcp/marketplace/:name` → delete from marketplace, delete env file, regenerate

Export `McpDeps` interface:
```typescript
export interface McpDeps {
  configPath: string;
  agentConfigDir: string;
  mcpEnvDir: string;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @opentidy/backend test -- --run mcp.test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/features/mcp/
git commit -m "feat(backend): add MCP management API routes (list, toggle, add, remove)"
```

---

## Task 6: Skills Feature Slice (Backend API)

**Files:**
- Create: `apps/backend/src/features/skills/list.ts`
- Create: `apps/backend/src/features/skills/toggle.ts`
- Create: `apps/backend/src/features/skills/add.ts`
- Create: `apps/backend/src/features/skills/remove.ts`
- Create: `apps/backend/src/features/skills/skills.test.ts`

- [ ] **Step 1: Write failing test for skills routes**

Same pattern as Task 5 but for skills. Test:
- `GET /skills` returns curated + user skills
- `POST /skills/curated/browser/toggle` flips enabled
- `POST /skills/user` adds a user skill (validate with `UserSkillSchema`)
- `DELETE /skills/user/comptable` removes a user skill

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @opentidy/backend test -- --run skills.test`
Expected: FAIL

- [ ] **Step 3: Implement skills routes**

Same pattern as MCP routes. Each mutation calls `regenerateAgentConfig()` which calls `syncSkills()`.

Export `SkillsDeps` interface:
```typescript
export interface SkillsDeps {
  configPath: string;
  agentConfigDir: string;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @opentidy/backend test -- --run skills.test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/features/skills/
git commit -m "feat(backend): add skills management API routes (list, toggle, add, remove)"
```

---

## Task 7: MCP Registry Proxy

**Files:**
- Create: `apps/backend/src/features/mcp/registry.ts`
- Add tests in: `apps/backend/src/features/mcp/mcp.test.ts`

- [ ] **Step 1: Write failing test for registry search**

```typescript
// Add to mcp.test.ts
describe('MCP registry proxy', () => {
  it('GET /mcp/registry/search returns results', async () => {
    // This test uses the real registry API — skip in CI if needed
    const deps = createTestDeps(configDir);
    const app = new Hono();
    app.route('/api', registrySearchRoute(deps));

    const res = await app.request('/api/mcp/registry/search?q=gmail');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.servers).toBeDefined();
    expect(Array.isArray(body.servers)).toBe(true);
  });
});
```

- [ ] **Step 2: Implement registry proxy**

Create `apps/backend/src/features/mcp/registry.ts`:
- In-memory cache with 1h TTL
- Proxy to `https://registry.modelcontextprotocol.io/v0.1/servers?search=<q>`
- Serve stale on network error if cache exists
- Route: `GET /mcp/registry/search?q=<query>`

- [ ] **Step 3: Run tests**

Run: `pnpm --filter @opentidy/backend test -- --run mcp.test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/features/mcp/registry.ts apps/backend/src/features/mcp/mcp.test.ts
git commit -m "feat(backend): add MCP registry search proxy with in-memory cache"
```

---

## Task 8: Server Integration

**Files:**
- Modify: `apps/backend/src/server.ts`
- Modify: `apps/backend/src/index.ts`

- [ ] **Step 1: Add `McpDeps` and `SkillsDeps` to `AppDeps`**

In `apps/backend/src/server.ts`, extend `AppDeps`:

```typescript
mcpConfig?: {
  configPath: string;
  agentConfigDir: string;
  mcpEnvDir: string;
};
skillsConfig?: {
  configPath: string;
  agentConfigDir: string;
};
```

- [ ] **Step 2: Mount MCP and skills routes in `createApp`**

After the existing route mounts (line 179), add:

```typescript
// MCP routes
if (deps.mcpConfig) {
  app.route('/api', listMcpRoute(deps.mcpConfig));
  app.route('/api', toggleMcpRoute(deps.mcpConfig));
  app.route('/api', addMcpRoute(deps.mcpConfig));
  app.route('/api', removeMcpRoute(deps.mcpConfig));
  app.route('/api', registrySearchRoute(deps.mcpConfig));
}
// Skills routes
if (deps.skillsConfig) {
  app.route('/api', listSkillsRoute(deps.skillsConfig));
  app.route('/api', toggleSkillsRoute(deps.skillsConfig));
  app.route('/api', addSkillRoute(deps.skillsConfig));
  app.route('/api', removeSkillRoute(deps.skillsConfig));
}
```

- [ ] **Step 3: Wire deps in `index.ts`**

In `apps/backend/src/index.ts`, add to the `createApp` call:

```typescript
mcpConfig: {
  configPath: getConfigPath(),
  agentConfigDir: AGENT_CONFIG_DIR,
  mcpEnvDir: path.join(path.dirname(getConfigPath()), 'mcp'),
},
skillsConfig: {
  configPath: getConfigPath(),
  agentConfigDir: AGENT_CONFIG_DIR,
},
```

- [ ] **Step 4: Call `regenerateAgentConfig` at boot**

In `index.ts`, after config loading and agent resolution (around line 115), add:

```typescript
import { regenerateAgentConfig } from './shared/agent-config.js';
// Ensure agent settings.json is up-to-date on startup
regenerateAgentConfig(config, path.join(path.dirname(getConfigPath()), 'mcp'));
```

- [ ] **Step 5: Run all tests**

Run: `pnpm --filter @opentidy/backend test -- --run`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/server.ts apps/backend/src/index.ts
git commit -m "feat(backend): mount MCP and skills API routes, regenerate config at boot"
```

---

## Task 9: Curated Skill Files

**Files:**
- Create: `apps/backend/config/claude/skills/browser/SKILL.md`
- Create: `apps/backend/config/claude/skills/bitwarden/SKILL.md`

- [ ] **Step 1: Create browser skill**

```markdown
---
name: browser
description: Use Camoufox anti-detection browser for all web navigation. Never use /navigate (Chrome, reserved for user).
---

For ALL web navigation, use this skill which launches Camoufox — an anti-detection browser.

## Usage

Use the `mcp__camofox__*` tools for browsing. Each session gets an isolated browser context.

## Rules

- NEVER use `/navigate` (Chrome) — that's reserved for the user
- If Camoufox fails, fall back to Playwright MCP and document the failure in state.md
- Anti-detection is enabled by default — sites won't flag you as a bot
```

- [ ] **Step 2: Create bitwarden skill**

```markdown
---
name: bitwarden
description: Retrieve passwords and credentials from Bitwarden/Vaultwarden via the bw CLI
---

Use the `bw` CLI to retrieve credentials from Bitwarden/Vaultwarden.

## Usage

```bash
bw get password "site-name"
bw get item "item-name" | jq '.login'
```

## Rules

- Never store retrieved passwords in state.md or any persistent file
- Use credentials only for the immediate task, then discard
```

- [ ] **Step 3: Commit**

```bash
git add apps/backend/config/claude/skills/
git commit -m "feat(backend): add curated skills (browser, bitwarden) for agent sessions"
```

---

## Task 10: Frontend Settings Page

**Files:**
- Create: `apps/web/src/features/settings/Settings.tsx`
- Create: `apps/web/src/features/settings/McpSection.tsx`
- Create: `apps/web/src/features/settings/SkillsSection.tsx`
- Create: `apps/web/src/features/settings/AddMcpDialog.tsx`
- Modify: `apps/web/src/App.tsx` (add route)
- Modify: `apps/web/src/shared/DesktopNav.tsx` (add nav link)
- Modify: `apps/web/src/shared/MobileNav.tsx` (add nav link)

- [ ] **Step 1: Read existing App.tsx to understand routing**

Check `apps/web/src/App.tsx` for the router setup and page imports pattern.

- [ ] **Step 2: Create `McpSection.tsx`**

Component that:
- Fetches `GET /api/mcp` on mount
- Renders curated MCPs with toggle buttons (calls `POST /api/mcp/curated/:name/toggle`)
- Renders marketplace MCPs with remove buttons
- Has a search input that calls `GET /api/mcp/registry/search?q=...` with debounce
- Search results show "Add" buttons that open `AddMcpDialog`
- Shows security warnings for marketplace/custom MCPs
- "Configure" buttons for curated MCPs that need auth → link to terminal page or show message

- [ ] **Step 3: Create `SkillsSection.tsx`**

Component that:
- Fetches `GET /api/skills` on mount
- Renders curated skills with toggle buttons
- Renders user skills with remove buttons
- Has "Add skill" button → path input → `POST /api/skills/user`

- [ ] **Step 4: Create `AddMcpDialog.tsx`**

Dialog/modal for adding marketplace or custom MCPs:
- For marketplace: pre-filled name/command/args from registry, form for env vars
- For custom: free-form fields (name, command, args, env key-value pairs)
- Validates with `MarketplaceMcpSchema` before submitting
- Shows security warning

- [ ] **Step 5: Create `Settings.tsx`**

Page that composes `McpSection` and `SkillsSection`:
```tsx
export default function Settings() {
  return (
    <div className="space-y-8 p-6">
      <h1 className="text-2xl font-bold">Settings</h1>
      <McpSection />
      <SkillsSection />
    </div>
  );
}
```

- [ ] **Step 6: Add route and nav link**

In `App.tsx`: add `<Route path="/settings" element={<Settings />} />`
In `DesktopNav.tsx` and `MobileNav.tsx`: add Settings link

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/features/settings/ apps/web/src/App.tsx
git add apps/web/src/shared/DesktopNav.tsx apps/web/src/shared/MobileNav.tsx
git commit -m "feat(web): add Settings page with MCP and skills management"
```

---

## Task 11: Fix Guardrails Port, Marketplace Audit Hooks & Setup Wizard Route

**Files:**
- Modify: `plugins/opentidy-hooks/guardrails.json`
- Modify: `apps/backend/src/shared/agents/claude.ts:19-22`
- Modify: `apps/backend/src/shared/agent-config.ts`
- Create: `apps/backend/src/features/mcp/setup-wizard.ts`

- [ ] **Step 1: Fix port in guardrails.json**

Change `http://localhost:5174/api/hooks` to `http://localhost:5175/api/hooks` (lines 19 and 31)

- [ ] **Step 2: Add comment in claude.ts about why one-shots exclude MCPs**

At line 19, expand the comment:

```typescript
// One-shot calls (triage, sweep, memory) use strict MCP config with no servers.
// Reasons: speed (no MCP startup), isolation (no side effects), reduced attack surface.
// Autonomous/interactive sessions load MCPs from CLAUDE_CONFIG_DIR/settings.json.
```

- [ ] **Step 3: Add `buildMarketplaceGuardrails()` to `agent-config.ts`**

Auto-generate PostToolUse `type: "http"` audit hooks for marketplace MCPs:

```typescript
import type { GuardrailRule } from '@opentidy/shared';

export function buildMarketplaceGuardrails(config: OpenTidyConfig): GuardrailRule[] {
  const port = config.server?.port || 5175;
  const rules: GuardrailRule[] = [];
  for (const name of Object.keys(config.mcp.marketplace)) {
    rules.push({
      event: 'post-tool',
      type: 'http',
      match: `mcp__${name}__`,
      url: `http://localhost:${port}/api/hooks`,
    });
  }
  return rules;
}
```

Call this in `regenerateAgentConfig()` — merge static guardrails from `guardrails.json` with dynamic marketplace guardrails, then call `adapter.writeConfig()` to regenerate `hooks.json`.

- [ ] **Step 4: Write test for marketplace guardrail generation**

Add to `agent-config.test.ts`:

```typescript
describe('buildMarketplaceGuardrails', () => {
  it('generates PostToolUse http hooks for marketplace MCPs', () => {
    const config = buildTestConfig({
      server: { port: 5175 },
      mcp: {
        curated: { gmail: { enabled: false, configured: false }, camoufox: { enabled: false, configured: false }, whatsapp: { enabled: false, configured: false, wacliPath: '', mcpServerPath: '' } },
        marketplace: {
          notion: { label: 'Notion', command: 'npx', args: [], permissions: ['mcp__notion__*'], source: 'custom' },
        },
      },
    });
    const rules = buildMarketplaceGuardrails(config);
    expect(rules).toHaveLength(1);
    expect(rules[0].event).toBe('post-tool');
    expect(rules[0].type).toBe('http');
    expect(rules[0].match).toBe('mcp__notion__');
  });

  it('returns empty for no marketplace MCPs', () => {
    const config = buildTestConfig({
      mcp: { curated: { gmail: { enabled: false, configured: false }, camoufox: { enabled: false, configured: false }, whatsapp: { enabled: false, configured: false, wacliPath: '', mcpServerPath: '' } }, marketplace: {} },
    });
    expect(buildMarketplaceGuardrails(config)).toEqual([]);
  });
});
```

- [ ] **Step 5: Add setup wizard route**

Create `apps/backend/src/features/mcp/setup-wizard.ts`:

```typescript
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { Hono } from 'hono';
import { execFileSync } from 'child_process';
import type { McpDeps } from './list.js';

const VALID_SETUP_MODULES = ['gmail', 'camoufox', 'whatsapp', 'claude'];

export function setupWizardRoute(deps: McpDeps) {
  const app = new Hono();

  app.post('/setup/:name/start', async (c) => {
    const name = c.req.param('name');
    if (!VALID_SETUP_MODULES.includes(name)) {
      return c.json({ error: `Unknown setup module: ${name}` }, 400);
    }

    const sessionName = `opentidy-setup-${name}`;
    try {
      execFileSync('tmux', ['kill-session', '-t', sessionName], { stdio: 'ignore' });
    } catch { /* session may not exist */ }

    execFileSync('tmux', ['new-session', '-d', '-s', sessionName, `opentidy setup ${name}`]);
    return c.json({ session: sessionName });
  });

  return app;
}
```

Mount in `server.ts` alongside other MCP routes.

- [ ] **Step 6: Run tests**

Run: `pnpm --filter @opentidy/backend test -- --run`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add plugins/opentidy-hooks/guardrails.json apps/backend/src/shared/agents/claude.ts
git add apps/backend/src/shared/agent-config.ts apps/backend/src/shared/agent-config.test.ts
git add apps/backend/src/features/mcp/setup-wizard.ts apps/backend/src/server.ts
git commit -m "feat(backend): fix guardrails port, add marketplace audit hooks and setup wizard route"
```

---

## Verification Checklist

After all tasks:

- [ ] `pnpm test` — all backend tests pass
- [ ] `pnpm build` — shared + backend + web build without errors
- [ ] `pnpm dev` — start dev server, navigate to Settings page
- [ ] Manual: verify `~/.config/opentidy/claude-config/settings.json` now contains `mcpServers` after boot
- [ ] Manual: toggle a curated MCP in the UI → verify settings.json updates
- [ ] Manual: run a one-shot (trigger triage) → verify it still uses `--strict-mcp-config {}`
