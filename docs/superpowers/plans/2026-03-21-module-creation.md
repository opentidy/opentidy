# Module Creation System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users create complete OpenTidy modules via an agent session; with MCP tools for validation/registration, a search provider for MCP package discovery, and a web app button to launch creation sessions.

**Architecture:** Three layers. MCP tools (`search_mcp_packages`, `validate_module`, `register_module`) in the existing OpenTidy MCP server, a `create-module` skill in the opentidy module manifest, and a "Create Module" button in the web app that spawns an interactive agent session. Custom modules are stored in `~/.config/opentidy/modules/` with the same structure as curated modules.

**Tech Stack:** Hono (backend), MCP SDK (`@modelcontextprotocol/sdk`), Zod (validation), React 19 (frontend), Vitest (testing)

**Spec:** `docs/superpowers/specs/2026-03-21-module-creation-design.md`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `packages/shared/src/types.ts` | Modify | Add `module:added` SSE event type, fix `moduleName` → `name` in module event data |
| `packages/shared/src/schemas.ts` | Modify | Remove `MarketplaceMcpSchema`, `McpConfigV2Schema`. Add `permissions` to `ModuleManifestSchema`. Add `MODULE_NAME_REGEX` constant. |
| `apps/backend/src/shared/paths.ts` | Modify | Add `customModules` field to `OpenTidyPaths` |
| `apps/backend/src/features/modules/loader.ts` | Modify | Add `loadCustomModules()`, export it alongside `loadCuratedModules` |
| `apps/backend/src/features/modules/loader.test.ts` | Modify | Add tests for custom module loading |
| `apps/backend/src/index.ts` | Modify | Load custom modules at boot, merge with curated |
| `apps/backend/src/features/mcp-server/server.ts` | Modify | Extend `McpServerDeps`, register new tools |
| `apps/backend/src/features/mcp-server/tools/search-packages.ts` | Create | `search_mcp_packages` MCP tool |
| `apps/backend/src/features/mcp-server/tools/search-packages.test.ts` | Create | Tests for search tool |
| `apps/backend/src/features/mcp-server/tools/validate-module.ts` | Create | `validate_module` MCP tool |
| `apps/backend/src/features/mcp-server/tools/validate-module.test.ts` | Create | Tests for validate tool |
| `apps/backend/src/features/mcp-server/tools/register-module.ts` | Create | `register_module` MCP tool |
| `apps/backend/src/features/mcp-server/tools/register-module.test.ts` | Create | Tests for register tool |
| `apps/backend/src/features/modules/search-provider.ts` | Create | `SearchProvider` interface + Smithery provider |
| `apps/backend/src/features/modules/search-provider.test.ts` | Create | Tests for search provider |
| `apps/backend/src/features/modules/create-session.ts` | Create | `POST /api/modules/create-session` route |
| `apps/backend/src/features/modules/create-session.test.ts` | Create | Tests for create-session route |
| `apps/backend/src/features/modules/add.ts` | Modify | Extract shared registration logic, add SSE emission |
| `apps/backend/src/features/modules/remove.ts` | Modify | Delete custom module directory on removal |
| `apps/backend/src/server.ts` | Modify | Mount create-session route |
| `apps/backend/modules/opentidy/module.json` | Modify | Add `create-module` skill |
| `apps/web/src/features/settings/ModulesPanel.tsx` | Modify | Add "Create Module" button + name dialog |
| `apps/backend/src/features/modules/types.ts` | Modify | Add `paths` to `ModuleRouteDeps` |
| `apps/web/src/shared/i18n/locales/en.json` | Modify | Add create-module i18n strings, remove marketplace vestiges |
| `apps/web/src/shared/i18n/locales/fr.json` | Modify | Same |

---

### Task 1: Add `module:added` SSE event type and fix module event data key

**Files:**
- Modify: `packages/shared/src/types.ts`

- [ ] **Step 1: Read the current SSE types**

Read `packages/shared/src/types.ts` and locate the `SSEEventType` and `SSEEventData` type definitions.

- [ ] **Step 2: Add `module:added` to `SSEEventType`**

Add `'module:added'` to the union alongside `'module:enabled' | 'module:disabled' | 'module:configured' | 'module:error'`.

- [ ] **Step 3: Fix module event data key**

In `SSEEventData`, the module events currently use `moduleName` as the data key, but `lifecycle.ts` emits `{ name }`. Fix the type to use `name: string` to match the runtime behavior.

- [ ] **Step 4: Verify frontend SSE handlers**

Search the frontend code for `moduleName` in SSE event handling. If the frontend reads `moduleName`, update those references to `name` as well. Check `apps/web/src/shared/` for SSE/store code.

- [ ] **Step 5: Build shared package to verify**

Run: `pnpm --filter @opentidy/shared build`
Expected: Build succeeds with no type errors.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/types.ts
git commit -m "fix(shared): add module:added SSE event, fix module event data key"
```

If frontend files were also modified, include them in the commit.

---

### Task 2: Clean up marketplace vestiges from schemas

**Files:**
- Modify: `packages/shared/src/schemas.ts`
- Modify: `packages/shared/tests/schemas.test.ts`

- [ ] **Step 1: Read schemas.ts**

Read `packages/shared/src/schemas.ts` and locate `MarketplaceMcpSchema`, `McpConfigV2Schema`, and their exports.

- [ ] **Step 2: Remove `MarketplaceMcpSchema` and `McpConfigV2Schema`**

Remove the schema definitions, their type exports (`MarketplaceMcpInput`), and their imports. These are vestiges of the old marketplace system, not used by config migration.

- [ ] **Step 3: Add `permissions` field to `ModuleManifestSchema`**

The `ModuleManifestSchema` currently lacks a `permissions` field for macOS permissions; it's silently stripped on parse. Add:

```typescript
permissions: z.array(z.string()).optional(),
```

This matches the `ModuleManifest` TypeScript interface which already has `permissions?: string[]`.

- [ ] **Step 4: Add `MODULE_NAME_REGEX` shared constant**

Export a shared constant for module name validation:

```typescript
export const MODULE_NAME_REGEX = /^[a-z0-9-]+$/;
```

This will be used by both `validate_module` and `create-session` to avoid duplication.

- [ ] **Step 5: Update tests**

Read `packages/shared/tests/schemas.test.ts`. Remove the entire `describe('MarketplaceMcpSchema')` block, its imports, and any other references to the deleted schemas.

- [ ] **Step 6: Also check `apps/backend/src/shared/agent-config.ts`**

Search for `marketplace` references in `agent-config.ts` and remove any iteration over `config.mcp.marketplace`. This is a runtime reference that needs cleanup.

- [ ] **Step 7: Run tests**

Run: `pnpm --filter @opentidy/shared test`
Expected: All tests pass.

- [ ] **Step 8: Commit**

```bash
git add packages/shared/src/schemas.ts packages/shared/tests/schemas.test.ts apps/backend/src/shared/agent-config.ts
git commit -m "chore(shared): remove marketplace vestiges, add permissions to ModuleManifestSchema, add MODULE_NAME_REGEX"
```

---

### Task 3: Add `customModules` to `OpenTidyPaths`

**Files:**
- Modify: `apps/backend/src/shared/paths.ts`

- [ ] **Step 1: Read paths.ts**

Read `apps/backend/src/shared/paths.ts` to see the `OpenTidyPaths` interface and `getOpenTidyPaths()`.

- [ ] **Step 2: Add `customModules` field**

Add `customModules: string` to `OpenTidyPaths`. In `getOpenTidyPaths()`, set it to `join(config, 'modules')`.

- [ ] **Step 3: Build to verify**

Run: `pnpm --filter @opentidy/backend build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/shared/paths.ts
git commit -m "feat(backend): add customModules path to OpenTidyPaths"
```

---

### Task 4: Add `loadCustomModules()` to module loader

**Files:**
- Modify: `apps/backend/src/features/modules/loader.ts`
- Modify: `apps/backend/src/features/modules/loader.test.ts`

- [ ] **Step 1: Write the failing test for `loadCustomModules`**

Read `apps/backend/src/features/modules/loader.test.ts` to understand the existing test pattern. Add a test for `loadCustomModules`:
- Creates a temp directory with a valid `module.json`
- Calls `loadCustomModules(tempDir)`
- Asserts the module is returned in the Map
- Test that modules with names colliding with a provided curated set are skipped

```typescript
describe('loadCustomModules', () => {
  it('loads custom modules from directory', () => {
    // Create temp dir with module.json
    const result = loadCustomModules(tempDir);
    expect(result.size).toBe(1);
    expect(result.get('test-module')).toBeDefined();
  });

  it('skips modules that collide with curated names', () => {
    // Create temp dir with module named 'gmail'
    const curatedNames = new Set(['gmail']);
    const result = loadCustomModules(tempDir, curatedNames);
    expect(result.size).toBe(0);
  });

  it('returns empty map if directory does not exist', () => {
    const result = loadCustomModules('/nonexistent');
    expect(result.size).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @opentidy/backend test -- loader.test`
Expected: FAIL (`loadCustomModules` is not defined.)

- [ ] **Step 3: Implement `loadCustomModules`**

Read `apps/backend/src/features/modules/loader.ts`. Add `loadCustomModules(customModulesDir: string, curatedNames?: Set<string>): Map<string, ModuleManifest>`:
- If directory doesn't exist, return empty Map (no error, first-time user has no custom modules)
- Same scan logic as `loadCuratedModules` (read subdirs, load `module.json`, validate with Zod)
- Skip modules whose name is in `curatedNames` (log warning)
- Return `Map<string, ModuleManifest>`

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @opentidy/backend test -- loader.test`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/features/modules/loader.ts apps/backend/src/features/modules/loader.test.ts
git commit -m "feat(backend): add loadCustomModules to module loader"
```

---

### Task 5: Load custom modules at boot

**Files:**
- Modify: `apps/backend/src/index.ts`

- [ ] **Step 1: Read index.ts**

Read `apps/backend/src/index.ts` and locate where `loadCuratedModules` is called and how `manifests` is used downstream.

- [ ] **Step 2: Load and merge custom modules after curated**

After `const manifests = loadCuratedModules(modulesDir)`, add:

```typescript
const customModules = loadCustomModules(paths.customModules, new Set(manifests.keys()));
for (const [name, manifest] of customModules) {
  manifests.set(name, manifest);
}
```

Ensure `mkdirSync(paths.customModules, { recursive: true })` is called early in boot so the directory always exists.

- [ ] **Step 3: Auto-register discovered custom modules in config**

After merging custom modules into `manifests`, auto-register any that are missing from `config.modules`:

```typescript
let configDirty = false;
for (const [name] of customModules) {
  if (!config.modules[name]) {
    config.modules[name] = { enabled: false, source: 'custom' };
    configDirty = true;
  }
}
if (configDirty) saveConfig(config);
```

This handles the case where a custom module directory exists on disk (manually created, restored from backup) but has no config entry; without this, the module wouldn't appear in the web app.

- [ ] **Step 4: Build to verify**

Run: `pnpm --filter @opentidy/backend build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/index.ts
git commit -m "feat(backend): load custom modules at boot alongside curated"
```

---

### Task 6: Create `SearchProvider` interface and Smithery provider

**Files:**
- Create: `apps/backend/src/features/modules/search-provider.ts`
- Create: `apps/backend/src/features/modules/search-provider.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { createSmitheryProvider, resolveProvider, type McpPackage } from './search-provider.js';

describe('SmitheryProvider', () => {
  it('maps smithery response to McpPackage format', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        servers: [{
          qualifiedName: '@test/mcp-server',
          displayName: 'Test Server',
          description: 'A test MCP server',
          verified: true,
          useCount: 42,
        }],
        pagination: { currentPage: 1, totalPages: 1, totalCount: 1, pageSize: 20 },
      }),
    });

    const provider = createSmitheryProvider(mockFetch);
    const result = await provider.search('test');

    expect(result.packages).toHaveLength(1);
    expect(result.packages[0].name).toBe('@test/mcp-server');
    expect(result.packages[0].verified).toBe(true);
    expect(result.pagination).toEqual({ page: 1, totalPages: 1 });
  });

  it('returns cached results on second call within TTL', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ servers: [], pagination: { currentPage: 1, totalPages: 0, totalCount: 0, pageSize: 20 } }),
    });

    const provider = createSmitheryProvider(mockFetch);
    await provider.search('test');
    await provider.search('test');

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('falls back to stale cache on fetch error', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ servers: [{ qualifiedName: 'cached', displayName: 'Cached', description: '', verified: false, useCount: 0 }], pagination: { currentPage: 1, totalPages: 1, totalCount: 1, pageSize: 20 } }),
      })
      .mockRejectedValueOnce(new Error('network error'));

    const provider = createSmitheryProvider(mockFetch, { ttlMs: 0 }); // expire immediately
    const first = await provider.search('test');
    const second = await provider.search('test');

    expect(second.packages[0].name).toBe('cached');
  });
});

describe('resolveProvider', () => {
  it('returns smithery by default', () => {
    const provider = resolveProvider();
    expect(provider.name).toBe('smithery');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @opentidy/backend test -- search-provider.test`
Expected: FAIL (module not found.)

- [ ] **Step 3: Implement SearchProvider**

Create `apps/backend/src/features/modules/search-provider.ts`:

```typescript
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

export interface McpPackage {
  name: string;
  description: string;
  command: string;
  args: string[];
  verified: boolean;
  useCount?: number;
}

export interface SearchResult {
  packages: McpPackage[];
  pagination: { page: number; totalPages: number };
}

export interface SearchProvider {
  name: string;
  search(query: string, page?: number): Promise<SearchResult>;
}

interface SmitheryServer {
  qualifiedName: string;
  displayName: string;
  description: string;
  verified: boolean;
  useCount: number;
}

interface SmitheryResponse {
  servers: SmitheryServer[];
  pagination: { currentPage: number; totalPages: number; totalCount: number; pageSize: number };
}

const SMITHERY_BASE = 'https://registry.smithery.ai';
const DEFAULT_TTL_MS = 3_600_000; // 1 hour

export function createSmitheryProvider(
  fetchFn: typeof fetch = fetch,
  options?: { ttlMs?: number },
): SearchProvider {
  const ttlMs = options?.ttlMs ?? DEFAULT_TTL_MS;
  const cache = new Map<string, { data: SearchResult; fetchedAt: number }>();

  return {
    name: 'smithery',
    async search(query: string, page = 1): Promise<SearchResult> {
      const cacheKey = `search:${query}:${page}`;
      const cached = cache.get(cacheKey);

      if (cached && Date.now() - cached.fetchedAt < ttlMs) {
        return cached.data;
      }

      try {
        const url = `${SMITHERY_BASE}/api/v1/servers?q=${encodeURIComponent(query)}&page=${page}&pageSize=20`;
        const res = await fetchFn(url);
        if (!res.ok) throw new Error(`Smithery returned ${res.status}`);

        const body = (await res.json()) as SmitheryResponse;
        const result: SearchResult = {
          packages: body.servers.map((s) => ({
            name: s.qualifiedName,
            description: s.description,
            command: 'npx',
            args: ['-y', s.qualifiedName],
            verified: s.verified,
            useCount: s.useCount,
          })),
          pagination: { page: body.pagination.currentPage, totalPages: body.pagination.totalPages },
        };

        cache.set(cacheKey, { data: result, fetchedAt: Date.now() });
        return result;
      } catch (error) {
        console.warn('[modules] Smithery search failed, using stale cache', error);
        if (cached) return cached.data;
        return { packages: [], pagination: { page: 1, totalPages: 0 } };
      }
    },
  };
}

const providers = new Map<string, SearchProvider>();
providers.set('smithery', createSmitheryProvider());

export function resolveProvider(name?: string): SearchProvider {
  return providers.get(name ?? 'smithery') ?? providers.get('smithery')!;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @opentidy/backend test -- search-provider.test`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/features/modules/search-provider.ts apps/backend/src/features/modules/search-provider.test.ts
git commit -m "feat(backend): add SearchProvider interface and Smithery provider"
```

---

### Task 7: Create `search_mcp_packages` MCP tool

**Files:**
- Create: `apps/backend/src/features/mcp-server/tools/search-packages.ts`
- Create: `apps/backend/src/features/mcp-server/tools/search-packages.test.ts`

- [ ] **Step 1: Write the failing test**

Follow the pattern from existing tool tests. Test that the tool calls the search provider and returns formatted results.

```typescript
import { describe, it, expect, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerSearchPackagesTools } from './search-packages.js';

describe('search_mcp_packages tool', () => {
  it('returns search results from provider', async () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    const mockProvider = {
      name: 'test',
      search: vi.fn().mockResolvedValue({
        packages: [{ name: '@test/mcp', description: 'Test', command: 'npx', args: ['-y', '@test/mcp'], verified: true, useCount: 10 }],
        pagination: { page: 1, totalPages: 1 },
      }),
    };

    registerSearchPackagesTools(server, { resolveProvider: () => mockProvider });

    // Call the tool handler directly via server internals or via transport test
    // Verify the output contains the package info as JSON text
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @opentidy/backend test -- search-packages.test`
Expected: FAIL (module not found.)

- [ ] **Step 3: Implement the tool**

Create `apps/backend/src/features/mcp-server/tools/search-packages.ts`:

```typescript
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { SearchProvider } from '../../modules/search-provider.js';

export interface SearchPackagesDeps {
  resolveProvider: (name?: string) => SearchProvider;
}

export function registerSearchPackagesTools(server: McpServer, deps: SearchPackagesDeps): void {
  server.registerTool(
    'search_mcp_packages',
    {
      title: 'Search MCP Packages',
      description: 'Search for MCP server packages in external registries (Smithery by default). Returns package names, descriptions, install commands, and popularity.',
      inputSchema: {
        query: z.string().describe('Search query (e.g., "notion", "slack", "calendar")'),
        provider: z.string().optional().describe('Search provider name (default: "smithery")'),
        page: z.number().optional().describe('Page number for pagination (default: 1)'),
      },
    },
    async ({ query, provider: providerName, page }) => {
      try {
        const provider = deps.resolveProvider(providerName);
        const result = await provider.search(query, page ?? 1);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        return { content: [{ type: 'text' as const, text: `Search failed: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
      }
    },
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @opentidy/backend test -- search-packages.test`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/features/mcp-server/tools/search-packages.ts apps/backend/src/features/mcp-server/tools/search-packages.test.ts
git commit -m "feat(backend): add search_mcp_packages MCP tool"
```

---

### Task 8: Create `validate_module` MCP tool

**Files:**
- Create: `apps/backend/src/features/mcp-server/tools/validate-module.ts`
- Create: `apps/backend/src/features/mcp-server/tools/validate-module.test.ts`

- [ ] **Step 1: Write the failing tests**

Test each validation check independently:

```typescript
import { describe, it, expect } from 'vitest';
import { validateModule } from './validate-module.js';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

function createTempModule(manifest: Record<string, unknown>): string {
  const dir = mkdtempSync(join(tmpdir(), 'opentidy-test-'));
  const moduleDir = join(dir, 'test-module');
  mkdirSync(moduleDir);
  writeFileSync(join(moduleDir, 'module.json'), JSON.stringify(manifest));
  return dir;
}

describe('validateModule', () => {
  it('passes for a valid minimal manifest', () => {
    const dir = createTempModule({ name: 'test-module', label: 'Test', description: 'A test', version: '1.0.0' });
    const result = validateModule('test-module', dir, new Set());
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('fails if module.json does not exist', () => {
    const dir = mkdtempSync(join(tmpdir(), 'opentidy-test-'));
    mkdirSync(join(dir, 'missing'));
    const result = validateModule('missing', dir, new Set());
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('module.json');
  });

  it('fails if manifest does not pass Zod schema', () => {
    const dir = createTempModule({ name: '' }); // invalid: empty name
    const result = validateModule('test-module', dir, new Set());
    expect(result.valid).toBe(false);
  });

  it('fails if receiver transform file does not exist', () => {
    const dir = createTempModule({
      name: 'test-module', label: 'Test', description: 'A test', version: '1.0.0',
      receivers: [{ name: 'webhook', mode: 'webhook', source: 'test', transform: './transform.ts' }],
    });
    const result = validateModule('test-module', dir, new Set());
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('transform.ts');
  });

  it('fails if name collides with curated module', () => {
    const dir = createTempModule({ name: 'gmail', label: 'Gmail', description: 'Collision', version: '1.0.0' });
    const result = validateModule('gmail', dir, new Set(['gmail']));
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('curated');
  });

  it('fails if module name contains invalid characters', () => {
    const dir = createTempModule({ name: '../evil', label: 'Evil', description: 'Bad', version: '1.0.0' });
    const result = validateModule('../evil', dir, new Set());
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('name');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @opentidy/backend test -- validate-module.test`
Expected: FAIL (module not found.)

- [ ] **Step 3: Implement `validateModule` function and MCP tool**

Create `apps/backend/src/features/mcp-server/tools/validate-module.ts`:

The file exports:
1. `validateModule(name: string, customModulesDir: string, curatedNames: Set<string>): { valid: boolean; errors: string[] }`, pure validation function (testable without MCP)
2. `registerValidateModuleTools(server, deps)`; registers the MCP tool that calls `validateModule`

Validation checks (as a pipeline of check functions):
1. Name matches `MODULE_NAME_REGEX` (imported from `@opentidy/shared`)
2. `module.json` exists in `<customModulesDir>/<name>/`
3. JSON parses successfully
4. Passes `ModuleManifestSchema.safeParse()`
5. Name doesn't collide with curated modules
6. All referenced files exist (receiver `entry`/`transform` paths resolved relative to module dir)
7. For process-based MCP servers (with `command`), check command is in PATH (skip for `url`-only servers, skip package validation for `npx`)

```typescript
export interface ValidateModuleDeps {
  paths: { customModules: string };
  manifests: Map<string, unknown>; // for curated name collision check
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @opentidy/backend test -- validate-module.test`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/features/mcp-server/tools/validate-module.ts apps/backend/src/features/mcp-server/tools/validate-module.test.ts
git commit -m "feat(backend): add validate_module MCP tool"
```

---

### Task 9: Extract shared registration logic from `add.ts`

**Files:**
- Modify: `apps/backend/src/features/modules/add.ts`
- Modify: `apps/backend/src/features/modules/lifecycle.ts`

- [ ] **Step 1: Read `add.ts` and `lifecycle.ts`**

Read both files to understand the current registration logic in `add.ts`.

- [ ] **Step 2: Extract registration into `lifecycle.ts`**

Add a `registerCustomModule(name: string, manifest: ModuleManifest)` function to the lifecycle object returned by `createModuleLifecycle()`:
- Sets `config.modules[name] = { enabled: false, source: 'custom' }`
- Saves config
- Adds manifest to in-memory `manifests` Map
- Emits SSE `module:added` with `data: { name }`
- Returns the `ModuleInfo` object

- [ ] **Step 3: Update `add.ts` to use shared logic**

Modify `add.ts` to call `deps.lifecycle.registerCustomModule(name, manifest)` instead of duplicating the registration logic.

- [ ] **Step 4: Run existing tests**

Run: `pnpm --filter @opentidy/backend test -- add.test`
Expected: All tests pass (behavior unchanged).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/features/modules/add.ts apps/backend/src/features/modules/lifecycle.ts
git commit -m "refactor(backend): extract shared module registration logic into lifecycle"
```

---

### Task 10: Create `register_module` MCP tool

**Files:**
- Create: `apps/backend/src/features/mcp-server/tools/register-module.ts`
- Create: `apps/backend/src/features/mcp-server/tools/register-module.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
describe('register_module tool', () => {
  it('validates then registers a valid module', async () => {
    // Create temp dir with valid module.json
    // Call registerModule
    // Assert config was updated with source: 'custom', enabled: false
    // Assert manifest was added to in-memory map
  });

  it('fails if validation fails', async () => {
    // Create temp dir with invalid module.json
    // Call registerModule
    // Assert error returned with validation messages
  });

  it('allows re-registering an existing custom module', async () => {
    // Register once, then register again
    // Should succeed (update flow)
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @opentidy/backend test -- register-module.test`
Expected: FAIL (module not found.)

- [ ] **Step 3: Implement the tool**

Create `apps/backend/src/features/mcp-server/tools/register-module.ts`:

```typescript
export interface RegisterModuleDeps {
  paths: { customModules: string };
  manifests: Map<string, ModuleManifest>;
  lifecycle: { registerCustomModule(name: string, manifest: ModuleManifest): Promise<ModuleInfo> };
}

export function registerRegisterModuleTools(server: McpServer, deps: RegisterModuleDeps): void {
  server.registerTool('register_module', {
    title: 'Register Module',
    description: 'Validate and register a custom module from ~/.config/opentidy/modules/<name>/. The module must have a valid module.json. After registration, the module appears in the web app ready to be enabled.',
    inputSchema: { name: z.string().regex(/^[a-z0-9-]+$/) },
  }, async ({ name }) => {
    // 1. Call validateModule, return errors if invalid
    // 2. Load manifest from disk
    // 3. Call lifecycle.registerCustomModule(name, manifest)
    // 4. Return success message
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @opentidy/backend test -- register-module.test`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/features/mcp-server/tools/register-module.ts apps/backend/src/features/mcp-server/tools/register-module.test.ts
git commit -m "feat(backend): add register_module MCP tool"
```

---

### Task 11: Wire new tools into MCP server

**Files:**
- Modify: `apps/backend/src/features/mcp-server/server.ts`
- Modify: `apps/backend/src/index.ts`

- [ ] **Step 1: Read `server.ts`**

Read `apps/backend/src/features/mcp-server/server.ts` to see the current `McpServerDeps` and `createMcpServer`.

- [ ] **Step 2: Extend `McpServerDeps`**

Add the new deps fields:

```typescript
export interface McpServerDeps {
  scheduler: Scheduler;
  suggestionsManager: { writeSuggestion(...): string };
  gapsManager: { appendGap(...): void };
  sse: { emit(event: SSEEvent): void };
  // New:
  manifests: Map<string, ModuleManifest>;
  paths: OpenTidyPaths;
  lifecycle: { registerCustomModule(name: string, manifest: ModuleManifest): Promise<ModuleInfo> };
  resolveSearchProvider: (name?: string) => SearchProvider;
}
```

- [ ] **Step 3: Register the new tools in `createMcpServer`**

Add calls to `registerSearchPackagesTools`, `registerValidateModuleTools`, `registerRegisterModuleTools` in `createMcpServer`, passing the appropriate deps subsets.

- [ ] **Step 4: Update `index.ts`**

Read `apps/backend/src/index.ts` and update the `createMcpServer()` call to pass the new deps (`manifests`, `paths`, `lifecycle`, `resolveSearchProvider`).

- [ ] **Step 5: Build to verify**

Run: `pnpm --filter @opentidy/backend build`
Expected: Build succeeds.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/features/mcp-server/server.ts apps/backend/src/index.ts
git commit -m "feat(backend): wire search, validate, register tools into MCP server"
```

---

### Task 12: Add `create-module` skill to opentidy module manifest

**Files:**
- Modify: `apps/backend/modules/opentidy/module.json`

- [ ] **Step 1: Read opentidy module.json**

Read `apps/backend/modules/opentidy/module.json`.

- [ ] **Step 2: Add `skills` array with `create-module` skill**

Add a `skills` field to the manifest:

```json
{
  "skills": [
    {
      "name": "create-module",
      "content": "You are creating an OpenTidy module. A module is a directory containing a `module.json` manifest and optional associated files.\n\n## Module Directory\n\nYou are working in the module directory provided in your instructions. All files you create go there.\n\n## module.json Format\n\n```json\n{\n  \"name\": \"my-module\",        // kebab-case, unique\n  \"label\": \"My Module\",       // display name\n  \"description\": \"What it does\",\n  \"icon\": \"🔧\",               // emoji\n  \"version\": \"1.0.0\",\n  // Optional components; include only what's needed:\n  \"mcpServers\": [{ \"name\": \"server-name\", \"command\": \"npx\", \"args\": [\"-y\", \"package-name\"] }],\n  \"skills\": [{ \"name\": \"skill-name\", \"content\": \"Skill prompt text\" }],\n  \"receivers\": [{ \"name\": \"receiver-name\", \"mode\": \"webhook\", \"source\": \"service\", \"transform\": \"./transform.ts\" }],\n  \"toolPermissions\": {\n    \"scope\": \"per-call\",\n    \"safe\": [{ \"tool\": \"mcp__server__tool\", \"label\": \"Description\" }],\n    \"critical\": [{ \"tool\": \"mcp__server__send\", \"label\": \"Description\" }]\n  },\n  \"setup\": {\n    \"authCommand\": \"command to run for auth\",\n    \"checkCommand\": \"command to verify setup\",\n    \"configFields\": [{ \"key\": \"apiKey\", \"label\": \"API Key\", \"type\": \"password\", \"required\": true }]\n  },\n  \"platform\": \"all\"\n}\n```\n\n## Component Guide\n\n- **mcpServers**: Process-based (`command`/`args`) or HTTP (`url`). Use `envFromConfig` to inject config values as env vars.\n- **skills**: Agent prompts. `name` + `content` (the prompt text injected into agent config).\n- **receivers**: Event sources. `webhook` (needs `transform` function), `polling` (needs `entry` + `pollInterval`), `long-running` (needs `entry`).\n- **toolPermissions**: `safe` = read-only/no side effects. `critical` = actions requiring approval. `scope`: `per-call` (ask every time) or `per-task` (ask once per task).\n- **setup**: `authCommand` run interactively for first-time auth. `checkCommand` verifies setup is complete. `configFields` shown in UI.\n\n## Workflow\n\n1. Ask what the user wants the module to do\n2. If an MCP server is needed, use `search_mcp_packages` to find the right package\n3. Create the `module.json` and any associated files (transform.ts, receiver.ts, setup scripts)\n4. Use `validate_module` to check everything is correct\n5. Fix any errors\n6. Use `register_module` to register the module\n7. Tell the user to enable and test the module in the web app\n\n## Examples\n\n### Skill-only module\n```json\n{ \"name\": \"code-review\", \"label\": \"Code Review\", \"description\": \"Code review guidelines\", \"icon\": \"🔍\", \"version\": \"1.0.0\", \"skills\": [{ \"name\": \"review\", \"content\": \"When reviewing code, check for...\" }] }\n```\n\n### MCP module (like Telegram)\n```json\n{ \"name\": \"telegram\", \"label\": \"Telegram\", \"description\": \"Send and receive Telegram messages\", \"icon\": \"📱\", \"version\": \"1.0.0\", \"mcpServers\": [{ \"name\": \"telegram\", \"command\": \"npx\", \"args\": [\"-y\", \"telegram-mcp\"], \"envFromConfig\": { \"TELEGRAM_BOT_TOKEN\": \"botToken\" } }], \"setup\": { \"configFields\": [{ \"key\": \"botToken\", \"label\": \"Bot Token\", \"type\": \"password\", \"required\": true }, { \"key\": \"chatId\", \"label\": \"Chat ID\", \"type\": \"text\", \"required\": true }] }, \"toolPermissions\": { \"scope\": \"per-call\", \"safe\": [{ \"tool\": \"mcp__telegram__get_updates\", \"label\": \"Get updates\" }], \"critical\": [{ \"tool\": \"mcp__telegram__send_message\", \"label\": \"Send message\" }] } }\n```\n\n### Full module (MCP + receiver + toolPermissions)\n```json\n{ \"name\": \"gmail\", \"label\": \"Gmail\", \"description\": \"Read, search, and draft emails\", \"icon\": \"📧\", \"version\": \"1.0.0\", \"mcpServers\": [{ \"name\": \"gmail\", \"command\": \"npx\", \"args\": [\"-y\", \"@gongrzhe/server-gmail-autoauth-mcp\"] }], \"receivers\": [{ \"name\": \"gmail-webhook\", \"mode\": \"webhook\", \"source\": \"gmail\", \"transform\": \"./transform.ts\" }], \"setup\": { \"authCommand\": \"npx -y @gongrzhe/server-gmail-autoauth-mcp auth\", \"checkCommand\": \"test -f ~/.gmail-mcp/credentials.json\" }, \"toolPermissions\": { \"scope\": \"per-call\", \"safe\": [{ \"tool\": \"mcp__gmail__search\", \"label\": \"Search inbox\" }], \"critical\": [{ \"tool\": \"mcp__gmail__send\", \"label\": \"Send emails\" }] } }\n```"
    }
  ]
}
```

- [ ] **Step 3: Validate the manifest still loads**

Run: `pnpm --filter @opentidy/backend test -- loader.test`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/modules/opentidy/module.json
git commit -m "feat(backend): add create-module skill to opentidy module manifest"
```

---

### Task 13: Add `POST /api/modules/create-session` route

**Files:**
- Create: `apps/backend/src/features/modules/create-session.ts`
- Create: `apps/backend/src/features/modules/create-session.test.ts`
- Modify: `apps/backend/src/server.ts`

- [ ] **Step 1: Write the failing test**

```typescript
describe('POST /modules/create-session', () => {
  it('creates directory and returns session info', async () => {
    // Mock deps (launcher, paths)
    // POST with { name: 'test-module' }
    // Assert 201 with { sessionId, taskId }
    // Assert directory was created
  });

  it('rejects invalid module names', async () => {
    // POST with { name: '../evil' }
    // Assert 400 with error about name format
  });

  it('rejects if directory already has a module.json', async () => {
    // Create dir with module.json first
    // POST with same name
    // Assert 409 conflict
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @opentidy/backend test -- create-session.test`
Expected: FAIL.

- [ ] **Step 3: Implement the route**

Create `apps/backend/src/features/modules/create-session.ts`:

```typescript
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { Hono } from 'hono';
import { mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { MODULE_NAME_REGEX } from '@opentidy/shared';

interface CreateSessionDeps {
  paths: { customModules: string };
  taskManager: { createTask(instruction: string): { id: string } };
  launcher: { launchSession(taskId: string): Promise<{ sessionId: string }> };
}

export function createModuleSessionRoute(deps: CreateSessionDeps) {
  const app = new Hono();

  app.post('/modules/create-session', async (c) => {
    const { name } = await c.req.json<{ name: string }>();

    if (!name || !MODULE_NAME_REGEX.test(name)) {
      return c.json({ error: 'Module name must match /^[a-z0-9-]+$/' }, 400);
    }

    const moduleDir = join(deps.paths.customModules, name);

    // Check for existing module BEFORE creating directory
    if (existsSync(join(moduleDir, 'module.json'))) {
      return c.json({ error: `Module "${name}" already exists. Remove it first or choose a different name.` }, 409);
    }

    mkdirSync(moduleDir, { recursive: true });

    const instruction = `The user wants to create a module named "${name}". The module directory is at "${moduleDir}". Ask them what they want this module to do.`;

    // Create a task first (matching existing session model), then launch
    const task = deps.taskManager.createTask(instruction);
    const { sessionId } = await deps.launcher.launchSession(task.id);

    return c.json({ sessionId, taskId: task.id }, 201);
  });

  return app;
}
```

**Note:** Read `apps/backend/src/features/sessions/launch.ts` to understand the exact `launcher.launchSession()` signature and adapt the deps interface accordingly. The `taskManager.createTask` interface should match what's used in `apps/backend/src/features/tasks/`. The instruction is passed as part of task creation, not directly to the launcher.

- [ ] **Step 4: Mount the route in server.ts**

Read `apps/backend/src/server.ts` and add:
```typescript
app.route('/api', createModuleSessionRoute(deps.createSessionDeps));
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @opentidy/backend test -- create-session.test`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/features/modules/create-session.ts apps/backend/src/features/modules/create-session.test.ts apps/backend/src/server.ts
git commit -m "feat(backend): add POST /api/modules/create-session route"
```

---

### Task 14: Clean up custom module directory on removal

**Files:**
- Modify: `apps/backend/src/features/modules/remove.ts`

- [ ] **Step 1: Read `remove.ts`**

Read `apps/backend/src/features/modules/remove.ts` to understand the current removal logic.

- [ ] **Step 2: Add `paths` to `ModuleRouteDeps`**

Read `apps/backend/src/features/modules/types.ts`. Add `paths: { customModules: string }` to `ModuleRouteDeps`. This gives `remove.ts` access to the custom modules directory.

- [ ] **Step 3: Add directory cleanup for custom modules**

After removing from config and manifests, if the module's `source` is `'custom'`, delete the directory at `join(deps.paths.customModules, name)` using `rmSync` with `{ recursive: true }`.

- [ ] **Step 4: Add a test for directory cleanup**

Add a test in `remove.test.ts` that verifies the directory is actually deleted when removing a custom module. Create a temp dir, register it, then remove; assert the directory no longer exists.

- [ ] **Step 5: Run tests**

Run: `pnpm --filter @opentidy/backend test -- remove.test`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/features/modules/remove.ts apps/backend/src/features/modules/types.ts apps/backend/src/features/modules/remove.test.ts
git commit -m "feat(backend): delete custom module directory on removal"
```

---

### Task 15: Add "Create Module" button to web app

**Files:**
- Modify: `apps/web/src/features/settings/ModulesPanel.tsx`
- Modify: `apps/web/src/shared/i18n/locales/en.json`
- Modify: `apps/web/src/shared/i18n/locales/fr.json`

- [ ] **Step 1: Read the modules panel component**

Read `apps/web/src/features/settings/ModulesPanel.tsx` to understand the current layout and patterns. Also check for existing dialog patterns in the frontend (e.g., `AddModuleDialog.tsx`).

- [ ] **Step 2: Add i18n strings**

Add to `en.json`:
```json
"modules.createModule": "Create Module",
"modules.createModuleDescription": "Launch an agent session to create a new module",
"modules.moduleName": "Module name",
"modules.moduleNamePlaceholder": "my-module",
"modules.moduleNameError": "Name must be lowercase letters, numbers, and hyphens only",
"modules.creating": "Creating..."
```

Add equivalent French translations to `fr.json`.

Also remove unused marketplace i18n strings (`toolbox.marketplace*`).

- [ ] **Step 3: Add the "Create Module" button and dialog**

Add a button at the top of the modules panel. On click, show a simple dialog asking for the module name (validate against `/^[a-z0-9-]+$/` client-side). On submit, call `POST /api/modules/create-session`. On success, navigate to the session/task view using React Router's `useNavigate()`, the target route depends on the existing routing setup (check `apps/web/src/` for route definitions, likely something like `/tasks/:taskId`).

- [ ] **Step 4: Run frontend dev to verify**

Run: `pnpm --filter @opentidy/web dev`
Verify the button appears and the dialog works visually.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/settings/ModulesPanel.tsx apps/web/src/shared/i18n/locales/en.json apps/web/src/shared/i18n/locales/fr.json
git commit -m "feat(web): add Create Module button and name dialog"
```

---

### Task 16: Integration test: full flow

**Files:**
- Create: `apps/backend/src/features/modules/integration.test.ts`

- [ ] **Step 1: Write the integration test**

Test the full flow:
1. Create a temp directory simulating `~/.config/opentidy/modules/`
2. Write a valid `module.json` for a test module
3. Call `validateModule`, assert valid
4. Call the shared registration logic; assert module appears in config and manifests
5. Verify the module would appear in `listModules` response

```typescript
describe('module creation integration', () => {
  it('validates, registers, and lists a custom module', () => {
    // Create temp custom modules dir
    // Write a minimal valid module.json
    // validateModule → valid
    // registerCustomModule → success
    // Check config.modules[name].source === 'custom'
    // Check manifests.has(name)
  });
});
```

- [ ] **Step 2: Run the integration test**

Run: `pnpm --filter @opentidy/backend test -- integration.test`
Expected: All tests pass.

- [ ] **Step 3: Run full test suite**

Run: `pnpm test`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/features/modules/integration.test.ts
git commit -m "test(backend): add integration test for module creation flow"
```
