# Module Creation System

> Design spec for creating OpenTidy modules via an agent session.

## Context

OpenTidy has a mature module system (v3) with declarative manifests (`module.json`), 8 curated modules as reference, and a full lifecycle (loader, enable/disable, configure, health, receivers, agent config regeneration). This spec adds the ability to **create new modules** via an agent; guided by a skill, validated by MCP tools, and initiated from the web app.

## Goals

- Let users create complete, functional modules via an agent session
- Support the full module manifest spectrum: `mcpServers`, `skills`, `receivers`, `toolPermissions`, `setup`, `permissions`, `platform`, `core`
- Validate modules server-side before registration (schema + file integrity)
- Provide MCP package discovery via an extensible search provider
- Keep it simple and robust, with a solid base for future evolution (publication, runtime validation, marketplace)

## Non-Goals (for now)

- Module publication (registry, marketplace, sharing)
- Runtime validation (MCP introspection, dry-run, health checks at creation time)
- Module versioning or update system

## Known Limitations

- **Concurrent creation:** Two agent sessions creating modules with the same name simultaneously could race on directory creation and registration. Low risk since module creation is rare and user-initiated. Can be addressed later with a name lock if needed.
- **`permissions` field in Zod schema:** The `ModuleManifestSchema` does not currently validate the `permissions` (macOS) field; it's silently stripped on parse. This needs to be fixed (add `MacPermission[]` to the schema) before or alongside this feature, otherwise modules with macOS permissions will lose that data at load time.

## Architecture

### Overview

Three layers work together:

1. **MCP tools** (backend), `search_mcp_packages`, `validate_module`, `register_module` exposed via the OpenTidy MCP server (`localhost:5175/mcp`). These guarantee data integrity.
2. **Skill** (agent prompt), `create-module` skill in the opentidy module manifest. Teaches the agent the module structure, patterns, and workflow. The agent creates files itself.
3. **Web app** (frontend), "Create Module" button on the Modules page. Launches an agent session in the module directory.

### MCP Tools

#### `search_mcp_packages`

Search for MCP server packages via an external registry.

```typescript
// Input
{
  query: string        // search query (e.g., "notion", "slack", "calendar")
  provider?: string    // search provider name (default: "smithery")
  page?: number        // pagination (default: 1)
}

// Output
{
  packages: Array<{
    name: string         // qualified name (e.g., "@gongrzhe/server-gmail-autoauth-mcp")
    description: string  // human-readable description
    command: string      // execution command ("npx", "node", etc.)
    args: string[]       // command arguments
    verified: boolean    // verified by the registry
    useCount?: number    // popularity metric
  }>
  pagination: {
    page: number
    totalPages: number
  }
}
```

#### `validate_module`

Validate a module manifest and its referenced files.

```typescript
// Input
{
  name: string  // module name, resolves to ~/.config/opentidy/modules/<name>/
}

// Output
{
  valid: boolean
  errors: string[]  // clear, actionable error messages
}
```

**Validations performed:**
- `module.json` exists and is valid JSON
- Manifest passes `ModuleManifestSchema` (Zod)
- All referenced files exist: receiver `entry`/`transform` paths, setup scripts. Relative paths resolved from the module directory (`~/.config/opentidy/modules/<name>/` for custom, `apps/backend/modules/<name>/` for curated).
- `mcpServers[].command` is resolvable (which check). For `npx` commands, only validate that `npx` is in PATH; the target package cannot be validated without running it. Skip check for HTTP-based servers (url-only, no command).
- No name collision with existing curated modules. Re-registering an existing custom module is allowed (update flow).
- Module name must match `/^[a-z0-9-]+$/` (no path traversal, no special characters).

**Extensibility:** The validation pipeline is structured as a list of check functions. Adding runtime checks later (MCP introspection, dry-run) means adding a check function; no architectural change needed.

#### `register_module`

Register a validated module in the backend.

```typescript
// Input
{
  name: string  // module name
}

// Output
{
  success: boolean
  error?: string
}
```

**What it does:**
1. Calls `validate_module` implicitly, fails if invalid
2. Loads the manifest from `~/.config/opentidy/modules/<name>/module.json`
3. Registers in `config.modules[name]` with `source: 'custom'`, `enabled: false`
4. Adds the manifest to the in-memory registry
5. Emits SSE `module:added` (new event type, must be added to `SSEEventType` and `SSEEventData` in shared types). Use `data: { name }` as the data key (consistent with existing lifecycle emissions in `lifecycle.ts`, not `moduleName` from the type definition, fix the type definition to match).
6. Does NOT call `regenerateAgentConfig`; that only happens at enable time
7. The module appears in the web app, ready to be enabled by the user

**Relationship with `POST /modules/add`:** The existing `add.ts` route accepts a manifest as JSON payload. `register_module` reads from disk instead. Both should share the same core registration logic (extracted into a shared function in `lifecycle.ts`) to avoid duplication; including SSE emission, which `add.ts` currently lacks. The `add.ts` route can be kept as an alternative API for programmatic registration.

### Search Provider

#### Interface

```typescript
interface SearchProvider {
  name: string
  search(query: string, page?: number): Promise<SearchResult>
}

interface SearchResult {
  packages: McpPackage[]
  pagination: { page: number; totalPages: number }
}

interface McpPackage {
  name: string
  description: string
  command: string
  args: string[]
  verified: boolean
  useCount?: number
}
```

#### Smithery Provider (default)

- Calls `registry.smithery.ai` API
- Cache with 1h TTL, fallback to stale cache if registry is unreachable. Cache key: `search:${query}:${page}` (same pattern as old `registry.ts`).
- Maps Smithery fields (`qualifiedName`, `displayName`, `isDeployed`, `useCount`) to `McpPackage`
- Reuses logic from the old `registry.ts` (removed in commit `b26c029`)

#### Provider Resolution

```typescript
// Simple registry: Map<string, SearchProvider>
const providers = new Map<string, SearchProvider>()
providers.set('smithery', smitheryProvider)

function resolveProvider(name?: string): SearchProvider {
  return providers.get(name ?? 'smithery') ?? providers.get('smithery')!
}
```

Adding a new provider later (npm, mcp.run, custom marketplace): implement `SearchProvider`, register in the map. The `search_mcp_packages` tool exposes it via the `provider` parameter.

### Skill: `create-module`

Lives in `apps/backend/modules/opentidy/module.json` under `skills[]`. Since the opentidy module is `core: true`, this skill is always available to agents.

#### Content Structure

1. **Context**: "You are creating an OpenTidy module. A module is a directory with a `module.json` manifest and associated files."

2. **Manifest reference**: Complete `module.json` format with all fields documented:
   - `name`, `label`, `description`, `icon`, `version`, metadata
   - `mcpServers[]`: process-based (command/args) or HTTP (url), env/envFromConfig mappings
   - `skills[]`: name + content (prompt injected into agent config)
   - `receivers[]`: webhook (with transform function), polling, long-running (with entry module)
   - `toolPermissions`: scope (per-call/per-task), safe[] and critical[] tool lists with labels
   - `setup`: authCommand, checkCommand, configFields (text/password/select)
   - `permissions[]`: macOS permissions (accessibility, etc.)
   - `platform`: "darwin" or "all"
   - `core`: boolean (reserved for curated modules)

3. **Workflow**: recommended steps:
   - Understand what the user wants the module to do
   - If an MCP server is needed → use `search_mcp_packages` to find the right package
   - Create the directory and files (module.json + any scripts)
   - Use `validate_module` to verify everything is correct
   - Fix any errors reported by validation
   - Use `register_module` to register the module in the backend
   - Tell the user to enable and test the module via the web app

4. **Examples**: 2-3 concrete examples extracted from existing curated modules:
   - Simple: skill-only module
   - Medium: MCP-based module (like telegram, mcpServers + toolPermissions + setup)
   - Full: MCP + receiver + toolPermissions (like gmail; mcpServers + receiver + toolPermissions + setup)

Note: the opentidy module manifest currently has no `skills` field; it must be added as part of this feature.

### Web App

#### UI Changes

**Modules page**; add a "Create Module" button (top of the module list, next to the page title).

#### Endpoint

`POST /api/modules/create-session`

```typescript
// Request
{ name: string }  // kebab-case, validated against /^[a-z0-9-]+$/

// Response
{ sessionId: string, taskId: string }
```

**What it does:**
1. Validates name format and checks no directory conflict
2. Creates `~/.config/opentidy/modules/<name>/` (recursive mkdir)
3. Creates a task in `workspace/` (like any other task); the task instruction references the module directory
4. Spawns an interactive agent session with the `create-module` skill and init prompt: "The user wants to create a module named `<name>`. The module directory is at `<absolute-path>`. Ask them what they want this module to do."
5. Returns session/task IDs for frontend redirect

The agent works in the workspace task directory (normal session model) but writes module files to the `~/.config/opentidy/modules/<name>/` path (absolute). This keeps the session model intact.

#### Flow

1. User clicks "Create Module"
2. A dialog asks for the **module name** (kebab-case, validated client-side against `/^[a-z0-9-]+$/`)
3. Frontend calls `POST /api/modules/create-session`
4. User is redirected to the session view (interactive terminal via ttyd/tmux, existing infrastructure)
5. The agent collaborates with the user, creates files, validates, registers
6. When done, the module appears in the Modules list, ready to be enabled

#### No New Pages

Everything reuses existing infrastructure:
- Session launch → `spawn-agent.ts`
- Interactive terminal → ttyd/tmux
- Module card → appears automatically after `register_module`
- Enable/disable/health/configure → existing module lifecycle UI

### Module Storage

**Location:** `~/.config/opentidy/modules/<name>/`

**Structure:** identical to curated modules in `apps/backend/modules/<name>/`:
```
~/.config/opentidy/modules/
  notion/
    module.json          # manifest
    transform.ts         # (optional) webhook receiver transform
    receiver.ts          # (optional) long-running receiver entry
    setup.ts             # (optional) setup script
    start-mcp.js         # (optional) MCP wrapper script
```

**Registration:** `config.modules[name]` with `source: 'custom'`.

**Loader changes:** The module loader currently scans `apps/backend/modules/` (curated). It needs to also scan `~/.config/opentidy/modules/` for custom modules, merging both sets:
- Add a `loadCustomModules(customModulesDir: string)` function (same logic as `loadCuratedModules`)
- Add a `customModules` field to `OpenTidyPaths` (pointing to `~/.config/opentidy/modules/`), resolved from `getOpenTidyPaths()`
- In boot (`index.ts`), load both and merge into a single `manifests` Map, curated first, then custom
- Custom modules with the same name as a curated module are rejected (logged as error, skipped)
- Custom modules discovered at boot are auto-registered in config if not already present

### Implementation Details

**MCP tool file locations** (following existing pattern in `apps/backend/src/features/mcp-server/tools/`):
- `search-packages.ts`: `search_mcp_packages` tool
- `validate-module.ts`: `validate_module` tool
- `register-module.ts`: `register_module` tool

**McpServerDeps extension:** `createMcpServer()` in `features/mcp-server/server.ts` needs additional deps:
- `manifests: Map<string, ModuleManifest>`: read/write access to the in-memory module registry
- `loadConfig: () => AppConfig`: read current config
- `saveConfig: (config: AppConfig) => void`: persist config changes
- `paths: OpenTidyPaths`: for resolving `paths.customModules`

**Module removal cleanup:** When a custom module is removed via `POST /modules/:name/remove`, the handler should also delete the module directory from `~/.config/opentidy/modules/<name>/` (since it was created by the system). Curated module directories are never deleted.

### Cleanup

- Remove `MarketplaceMcpSchema` from `packages/shared/src/schemas.ts` (vestige)
- Remove `McpConfigV2Schema` entirely; it is not referenced by `migrateV2ToV3` (migration works on raw parsed objects, not the schema). Only the test file references it.
- Remove unused marketplace i18n strings from `en.json` and `fr.json`
- Clean up `config.mcp.marketplace` field from config schema

## Testing Strategy

- **MCP tools:** unit tests for each tool (validate, register, search) with fixture modules
- **Search provider:** unit test with mocked HTTP responses for Smithery
- **Validation pipeline:** test each check function independently with valid/invalid manifests
- **Loader:** test that custom modules from `~/.config/opentidy/modules/` are loaded alongside curated
- **Integration:** test the full flow; scaffold → validate → register → appears in module list
- **Skill:** manual testing via agent session (the skill is a prompt, not code)

## Future Extensions

These are explicitly out of scope but the architecture supports them:

- **Publication:** custom modules have the same structure as curated; copying to the repo or a registry is straightforward
- **Runtime validation:** add check functions to the validation pipeline (MCP introspection, dry-run)
- **More search providers:** implement `SearchProvider`, register in the map
- **Module templates:** could be added as a tool later, but the agent + skill approach works without them
- **Module marketplace:** the search provider abstraction is the foundation for a future discovery UI
