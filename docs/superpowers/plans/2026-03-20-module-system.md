# Module System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fragmented MCP/Skills/Receivers systems with a unified Module system where everything (Gmail, Telegram, Browser, Cloudflare...) is a module with a manifest declaring its MCPs, skills, and receivers.

**Architecture:** Three phases — (A) Core module system: types, loader, config migration, agent config generation. (B) Backend: API routes, curated module manifests, webhook endpoint, boot sequence. (C) Frontend: Settings page with ModuleCard, wizard Step 4, navigation.

**Tech Stack:** TypeScript, Hono, React 19, Zod, Vitest, Playwright

**Spec:** `docs/superpowers/specs/2026-03-20-module-system-design.md`

---

## Phase A: Core Module System

### Task 1: Types, Schemas, and Config Migration

**Files:**
- Modify: `packages/shared/src/types.ts`
- Modify: `packages/shared/src/schemas.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/shared/tests/schemas.test.ts`
- Modify: `apps/backend/src/shared/config.ts`

- [ ] **Step 1: Write tests for ModuleManifestSchema and ModuleStateSchema**

Add to `packages/shared/tests/schemas.test.ts`:
- `ModuleManifestSchema` accepts a valid manifest with name, label, description, version, mcpServers array
- `ModuleManifestSchema` rejects missing required fields (name, label, version)
- `ModuleStateSchema` accepts `{ enabled: true, source: 'curated' }`
- `ModuleStateSchema` accepts with optional config, health fields
- `ReceiverDefSchema` accepts webhook/polling/long-running modes

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @opentidy/shared test -- --run`

- [ ] **Step 3: Add types to `types.ts`**

Add these interfaces (from the spec, lines 31-79):
- `ModuleManifest` with `name`, `label`, `description`, `icon?`, `version`, `platform?`, `mcpServers?`, `skills?`, `receivers?`, `setup?`
- `McpServerDef` with `name`, `command`, `args`, `env?`, `envFromConfig?`, `permissions?`
- `SkillDef` with `name`, `content`
- `ReceiverDef` with `name`, `mode`, `source`, `pollInterval?`, `entry?`, `transform?`
- `ConfigField` with `key`, `label`, `type`, `required?`, `placeholder?`, `options?`
- `ModuleState` with `enabled`, `source`, `config?`, `health?`, `healthError?`, `healthCheckedAt?`
- `ReceiverEvent` with `source`, `content`, `metadata`
- `ModuleInfo` (API response shape, spec lines 288-308)

Add `modules: Record<string, ModuleState>` to `OpenTidyConfig`.

Remove `mcp: McpConfigV2`, `skills: SkillsConfig`, `receivers: ReceiverConfigEntry[]` from `OpenTidyConfig`.

Remove `telegram: { botToken, chatId }` top-level — Telegram config moves to `modules.telegram.config`.

Add new SSE event types: `'module:enabled'`, `'module:disabled'`, `'module:error'`, `'module:configured'`.

- [ ] **Step 4: Add Zod schemas to `schemas.ts`**

Create schemas for `ModuleManifestSchema`, `ModuleStateSchema`, `McpServerDefSchema`, `SkillDefSchema`, `ReceiverDefSchema`, `ConfigFieldSchema`, `ReceiverEventSchema`.

- [ ] **Step 5: Update config.ts — DEFAULT_CONFIG and migration**

In `apps/backend/src/shared/config.ts`:
- Update `DEFAULT_CONFIG`: remove `mcp`, `skills`, `receivers`, `telegram`. Add `modules: {}`. Set `version: 3`.
- Add `migrateV2ToV3()` function: sets `modules: {}`, removes old fields, bumps version.
- Update `loadConfig()` to call `migrateV2ToV3()` after `migrateV1ToV2()`.
- Remove the `telegram` field from `DEFAULT_CONFIG`.

- [ ] **Step 6: Fix all TypeScript compilation errors from removed types**

The removal of `McpConfigV2`, `SkillsConfig`, `ReceiverConfigEntry`, and `telegram` top-level will break many files. Fix imports and references across the codebase. This is expected — the spec says "big bang".

Key files that will break:
- `apps/backend/src/server.ts` — `AppDeps` references to mcpConfig, skillsConfig
- `apps/backend/src/index.ts` — telegram config, mcp config, skills config, receivers
- `apps/backend/src/shared/agent-config.ts` — reads mcp/skills
- `apps/backend/src/features/mcp/` — all files (will be deleted in Task 8)
- `apps/backend/src/features/skills/` — all files (will be deleted in Task 8)
- Test files referencing old types

For now, **stub the broken references** with `// TODO: module system` comments where the old code was. Don't try to fully implement the module system in this task — just make the types compile.

- [ ] **Step 7: Run tests**

Run: `pnpm --filter @opentidy/shared test -- --run`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add packages/shared/ apps/backend/src/shared/config.ts
git commit -m "feat(shared): add module system types, remove legacy MCP/skills/receivers types"
```

---

### Task 2: Module Loader

**Files:**
- Create: `apps/backend/src/features/modules/loader.ts`
- Create: `apps/backend/src/features/modules/loader.test.ts`

- [ ] **Step 1: Write tests for module loader**

Test cases:
- `loadModuleManifest(path)` loads and validates a `module.json` from a directory
- `loadCuratedModules(modulesDir)` discovers all subdirectories with `module.json` and returns a `Map<string, ModuleManifest>`
- Returns error for invalid manifest (missing required fields)
- Filters by platform (skip `darwin`-only modules on non-darwin)

- [ ] **Step 2: Run tests, verify fail**

- [ ] **Step 3: Implement loader.ts**

```typescript
export function loadModuleManifest(moduleDir: string): ModuleManifest
export function loadCuratedModules(modulesBaseDir: string): Map<string, ModuleManifest>
```

Uses `readFileSync` + `JSON.parse` + `ModuleManifestSchema.parse()` for validation. Scans subdirectories of `modulesBaseDir` looking for `module.json`.

- [ ] **Step 4: Run tests, verify pass**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(backend): add module manifest loader"
```

---

### Task 3: Agent Config Generation from Modules

**Files:**
- Modify: `apps/backend/src/shared/agent-config.ts`
- Modify: `apps/backend/src/shared/agent-config.test.ts` (if exists, or create)

- [ ] **Step 1: Write tests**

Test that `regenerateAgentConfig()` (or a new `generateSettingsFromModules()` function):
- Given 2 active modules with MCPs, generates a settings.json with both MCP entries
- Deduplicates MCPs with same command+args (only one entry)
- Resolves `envFromConfig` from module config values
- Ignores disabled modules
- Always includes the `opentidy` system MCP

- [ ] **Step 2: Run tests, verify fail**

- [ ] **Step 3: Implement**

Modify `regenerateAgentConfig()` to:
1. Accept `modules: Record<string, ModuleState>` + `manifests: Map<string, ModuleManifest>` instead of old mcp/skills config
2. Iterate active modules, collect all `mcpServers` and `skills`
3. Deduplicate MCPs by `command + JSON.stringify(args)`
4. Resolve `envFromConfig` by reading `moduleState.config[key]`
5. Always inject the `opentidy` system MCP
6. Write `settings.json`

- [ ] **Step 4: Run tests, verify pass**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(backend): regenerate agent config from modules instead of legacy MCP/skills"
```

---

### Task 4: Module Lifecycle Manager

**Files:**
- Create: `apps/backend/src/features/modules/lifecycle.ts`
- Create: `apps/backend/src/features/modules/lifecycle.test.ts`

- [ ] **Step 1: Write tests**

Test cases:
- `enableModule(name)` — sets `config.modules[name].enabled = true`, calls `regenerateAgentConfig()`, starts receivers
- `disableModule(name)` — sets enabled to false, stops receivers, regenerates config
- `configureModule(name, configValues)` — saves config values, regenerates if module is enabled
- Starting a receiver calls `receiver.start(emit)`
- Stopping a receiver calls `receiver.stop()`

- [ ] **Step 2: Run tests, verify fail**

- [ ] **Step 3: Implement lifecycle.ts**

Factory function `createModuleLifecycle(deps)` returning:
```typescript
{
  enable(name: string): Promise<void>
  disable(name: string): Promise<void>
  configure(name: string, config: Record<string, unknown>): Promise<void>
  startReceivers(name: string): Promise<void>
  stopReceivers(name: string): Promise<void>
  stopAll(): Promise<void>
}
```

Deps: `loadConfig`, `saveConfig`, `manifests` (Map), `regenerateAgentConfig`, `triageHandler` (to pipe receiver events into triage), `dedup`, `sse`.

Receiver instantiation: for `polling` and `long-running` modes, dynamically import the `entry` file which should export `createReceiver(config)`. For `webhook` mode, no process to start — the webhook endpoint handles it.

- [ ] **Step 4: Run tests, verify pass**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(backend): add module lifecycle manager (enable/disable/configure)"
```

---

## Phase B: Backend API + Curated Modules

### Task 5: Curated Module Manifests

**Files:**
- Create: `apps/backend/modules/gmail/module.json`
- Create: `apps/backend/modules/gmail/transform.ts`
- Create: `apps/backend/modules/whatsapp/module.json`
- Create: `apps/backend/modules/browser/module.json`
- Create: `apps/backend/modules/imessage/module.json`
- Create: `apps/backend/modules/imessage/receiver.ts`
- Create: `apps/backend/modules/apple-mail/module.json`
- Create: `apps/backend/modules/apple-mail/receiver.ts`
- Create: `apps/backend/modules/telegram/module.json`
- Create: `apps/backend/modules/cloudflare/module.json`

- [ ] **Step 1: Create gmail module**

`module.json` as per spec example. `transform.ts` converts Gmail webhook payload to `ReceiverEvent`. Port logic from existing `apps/backend/src/features/triage/webhook-route.ts`.

- [ ] **Step 2: Create whatsapp module**

`module.json` with MCP + long-running receiver. Receiver entry delegates to existing wacli integration.

- [ ] **Step 3: Create browser module**

`module.json` with camoufox MCP + browser skill. No receiver. Setup: `authCommand: "pipx install camoufox"`.

- [ ] **Step 4: Create imessage module**

`module.json` with polling receiver. `receiver.ts` exports `createReceiver()` that uses osascript to poll Messages.app. Port from existing `sms-reader.ts`.

- [ ] **Step 5: Create apple-mail module**

`module.json` with polling receiver. `receiver.ts` ports from existing `mail-reader.ts`.

- [ ] **Step 6: Create telegram module**

`module.json` with MCP + configFields (botToken, chatId). No receiver.

- [ ] **Step 7: Create cloudflare module**

`module.json` — infrastructure module, no MCPs/skills/receivers. Just `authCommand` + `configFields` (tunnelName, hostname).

- [ ] **Step 8: Commit**

```bash
git commit -m "feat(backend): add 7 curated module manifests and receiver code"
```

---

### Task 6: Module API Routes

**Files:**
- Create: `apps/backend/src/features/modules/list.ts` + test
- Create: `apps/backend/src/features/modules/enable.ts` + test
- Create: `apps/backend/src/features/modules/disable.ts` + test
- Create: `apps/backend/src/features/modules/configure.ts` + test
- Create: `apps/backend/src/features/modules/add.ts` + test
- Create: `apps/backend/src/features/modules/remove.ts` + test
- Create: `apps/backend/src/features/modules/health.ts` + test

Follow TDD for each. All routes follow the existing Hono factory function pattern with dependency injection.

- [ ] **Step 1: Implement + test list.ts**

`GET /modules` — loads all curated manifests + custom modules from config. Returns `ModulesResponse` with `ModuleInfo[]`. Merges manifest data with `config.modules` state.

- [ ] **Step 2: Implement + test enable.ts**

`POST /modules/:name/enable` — calls `lifecycle.enable(name)`. Returns `{ success: true }`. Emits SSE `module:enabled`.

- [ ] **Step 3: Implement + test disable.ts**

`POST /modules/:name/disable` — calls `lifecycle.disable(name)`. Returns `{ success: true }`. Emits SSE `module:disabled`.

- [ ] **Step 4: Implement + test configure.ts**

`POST /modules/:name/configure` — validates config against manifest's `configFields` (check required). Calls `lifecycle.configure(name, config)`. Emits SSE `module:configured`.

- [ ] **Step 5: Implement + test add.ts**

`POST /modules/add` — accepts `{ name, manifest }` or `{ npmPackage }`. For npm, resolves package and loads manifest. Saves to `config.modules`. Returns the new module info.

- [ ] **Step 6: Implement + test remove.ts**

`DELETE /modules/:name` — only custom modules (returns 400 for curated). Calls `lifecycle.disable()` first, then removes from config.

- [ ] **Step 7: Implement + test health.ts**

`GET /modules/:name/health` — for each receiver in the module, calls `receiver.health()` if implemented. Returns aggregated health.

- [ ] **Step 8: Run all module tests**

Run: `pnpm --filter @opentidy/backend test -- --run apps/backend/src/features/modules/`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git commit -m "feat(backend): add generic module API routes (list/enable/disable/configure/add/remove/health)"
```

---

### Task 7: Unified Webhook Endpoint

**Files:**
- Create: `apps/backend/src/features/modules/webhook.ts`
- Create: `apps/backend/src/features/modules/webhook.test.ts`

- [ ] **Step 1: Write tests**

- Accepts POST with valid module/receiver, calls transform, returns 200
- Returns 404 for unknown module or disabled module
- Returns 404 for unknown receiver
- Deduplicates events (same content hash → 200 but no triage)
- Passes transformed ReceiverEvent to triage handler

- [ ] **Step 2: Implement webhook.ts**

`POST /webhooks/:moduleName/:receiverName`

1. Check module exists and is enabled
2. Find receiver def in manifest, verify mode is 'webhook'
3. Load transform function from manifest's `transform` path
4. Call `transform(body)` → `ReceiverEvent`
5. Dedup check (SHA-256 of content)
6. Wrap into `AppEvent` (add id, timestamp, contentHash)
7. Pass to triage handler
8. Return 200

Deps: `manifests`, `config`, `dedup`, `triageHandler`.

- [ ] **Step 3: Run tests, verify pass**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(backend): add unified webhook endpoint for module receivers"
```

---

### Task 8: Server Wiring + Boot Sequence + Cleanup

**Files:**
- Modify: `apps/backend/src/server.ts`
- Modify: `apps/backend/src/index.ts`
- Delete: `apps/backend/src/features/mcp/` (entire directory)
- Delete: `apps/backend/src/features/skills/` (entire directory)

- [ ] **Step 1: Delete old MCP and skills feature directories**

Remove `apps/backend/src/features/mcp/` and `apps/backend/src/features/skills/`. Remove all imports from `server.ts`.

- [ ] **Step 2: Update server.ts**

Remove all MCP/skills route imports and mounts. Remove `mcpConfig` and `skillsConfig` from `AppDeps`.

Add module route imports and mounts:
```typescript
import { listModulesRoute } from './features/modules/list.js';
import { enableModuleRoute } from './features/modules/enable.js';
// ... etc
import { webhookRoute } from './features/modules/webhook.js';
```

Add `moduleDeps` to `AppDeps` interface. Mount all module routes under `/api` and webhook route.

- [ ] **Step 3: Update index.ts boot sequence**

1. Load curated manifests via `loadCuratedModules()`
2. Create module lifecycle manager
3. For each enabled module in config: start receivers
4. Pass module deps to `createApp()`
5. Remove old mcp/skills/receivers initialization code
6. Remove `config.telegram` references — notification system reads from `config.modules.telegram.config.botToken`

- [ ] **Step 4: Build and fix remaining compilation errors**

Run: `pnpm build`
Fix any remaining TypeScript errors from the migration.

- [ ] **Step 5: Run all backend tests**

Run: `pnpm --filter @opentidy/backend test -- --run`
Some old tests will fail (deleted features). Remove those test files.

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(backend): wire module system, remove legacy MCP/skills routes"
```

---

## Phase C: Frontend

### Task 9: ModuleCard + ModuleConfigDialog Components

**Files:**
- Create: `apps/web/src/features/settings/ModuleCard.tsx`
- Create: `apps/web/src/features/settings/ModuleConfigDialog.tsx`

- [ ] **Step 1: Create ModuleCard.tsx**

A card component that displays a single module:
- Props: `module: ModuleInfo`, `onEnable`, `onDisable`, `onConfigure`, `onRemove?`
- Shows: icon, label, description, enabled toggle, component badges (MCP/Skill/Receiver), health indicator
- Enable/disable toggle calls the appropriate handler
- "Configure" button shown when module has `setup.configFields` or `setup.authCommand`
- "Remove" button shown only for custom modules
- Reusable in both Settings page and setup wizard

- [ ] **Step 2: Create ModuleConfigDialog.tsx**

A dialog/modal for configuring a module:
- Props: `module: ModuleInfo`, `onSave`, `onClose`, `manifest: ModuleManifest`
- Renders form fields dynamically from `manifest.setup.configFields`
- If `manifest.setup.authCommand` exists: shows a "Connect" button that opens `<TerminalDrawer>`
- Save button calls `POST /api/modules/:name/configure`
- Uses the existing TerminalDrawer component from `shared/TerminalDrawer.tsx`

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(web): add ModuleCard and ModuleConfigDialog components"
```

---

### Task 10: Settings Page Restructure

**Files:**
- Modify: `apps/web/src/features/settings/Settings.tsx`
- Create: `apps/web/src/features/settings/ModulesPanel.tsx`
- Create: `apps/web/src/features/settings/SecurityPanel.tsx`
- Create: `apps/web/src/features/settings/ServiceControlPanel.tsx`
- Delete: `apps/web/src/features/settings/McpServersPanel.tsx`
- Delete: `apps/web/src/features/settings/SkillsPanel.tsx`
- Delete: `apps/web/src/features/settings/MarketplacePanel.tsx`
- Delete: `apps/web/src/features/settings/AddMcpDialog.tsx`
- Modify: `apps/web/src/shared/i18n/locales/en.json`
- Modify: `apps/web/src/shared/i18n/locales/fr.json`

- [ ] **Step 1: Add i18n strings for modules**

Add `modules.*` section: `title`, `addModule`, `enable`, `disable`, `configure`, `remove`, `noModules`, `components.mcp`, `components.skill`, `components.receiver`, `health.ok`, `health.error`, `addCustom`, `addFromRegistry`.

Add `security.*` and `serviceControl.*` sections.

- [ ] **Step 2: Create ModulesPanel.tsx**

Fetches `GET /api/modules` on mount. Renders a grid of `ModuleCard` components. Has an "Add module" button that opens `AddModuleDialog`. Handles enable/disable/configure via API calls + refetch.

- [ ] **Step 3: Create SecurityPanel.tsx**

Shows the bearer token with a "click to reveal" pattern + copy button. Reads from a new `GET /api/setup/status` (bearer token field) or a dedicated endpoint.

- [ ] **Step 4: Create ServiceControlPanel.tsx**

Start/stop/restart buttons for the OpenTidy daemon. Calls `POST /api/service/stop`, `/start`, `/restart`. Shows current service status.

- [ ] **Step 5: Update Settings.tsx**

Replace the sections array with new structure:
```typescript
type Section = 'modules' | 'agents' | 'security' | 'control' | 'danger';
```

Remove old panel imports (McpServersPanel, SkillsPanel, MarketplacePanel). Add new panels. Delete old panel files.

- [ ] **Step 6: Build and verify**

Run: `pnpm build`

- [ ] **Step 7: Commit**

```bash
git commit -m "feat(web): restructure Settings page with Modules panel, remove legacy MCP/skills panels"
```

---

### Task 11: Add Module Dialog

**Files:**
- Create: `apps/web/src/features/settings/AddModuleDialog.tsx`

- [ ] **Step 1: Create AddModuleDialog.tsx**

Two tabs/modes:
- **Registry** — search input that queries the existing MCP registry search endpoint. Results shown as cards. Clicking "Add" creates a module wrapper and calls `POST /api/modules/add`.
- **Custom** — form with npm package name or local path. Calls `POST /api/modules/add`.

Reuse the registry search pattern from the deleted `MarketplacePanel.tsx`.

- [ ] **Step 2: Commit**

```bash
git commit -m "feat(web): add AddModuleDialog for custom and registry modules"
```

---

### Task 12: Setup Wizard Step 4 — Modules

**Files:**
- Create: `apps/web/src/features/setup/ModulesStep.tsx`
- Modify: `apps/web/src/features/setup/SetupWizard.tsx`

- [ ] **Step 1: Create ModulesStep.tsx**

Shows curated modules in a guided layout:
- Fetches `GET /api/modules` on mount
- Renders `ModuleCard` for each curated module
- "Configure" opens `ModuleConfigDialog`
- All modules are skippable
- "You can configure more modules later in Settings" message
- Back/Continue buttons (Continue always enabled)

- [ ] **Step 2: Update SetupWizard.tsx**

Add 'modules' step between 'permissions' and 'done'. Update STEPS array to 5 items. Update progress bar calculation.

```typescript
const STEPS = ['user-info', 'agent', 'permissions', 'modules', 'done'] as const;
```

- [ ] **Step 3: Build and verify**

Run: `pnpm build`

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(web): add modules step to setup wizard"
```

---

### Task 13: Navigation + Route Updates

**Files:**
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/shared/DesktopNav.tsx`
- Modify: `apps/web/src/shared/MobileNav.tsx`

- [ ] **Step 1: Update App.tsx**

Change route from `/toolbox` to `/settings`:
```tsx
<Route path="/settings" element={<Settings />} />
```

- [ ] **Step 2: Update DesktopNav.tsx and MobileNav.tsx**

Rename "Toolbox" to "Settings" in nav items. Update the route path to `/settings`.

- [ ] **Step 3: Update i18n**

Rename `toolbox.*` keys to `settings.*` or add aliases.

- [ ] **Step 4: Commit**

```bash
git commit -m "refactor(web): rename /toolbox to /settings in routes and navigation"
```

---

### Task 14: E2E Tests

**Files:**
- Create: `apps/web/tests/e2e/modules.spec.ts`
- Modify: `apps/web/tests/e2e/setup-wizard.spec.ts`

- [ ] **Step 1: Write module E2E tests**

Test cases (mock all APIs):
- Settings page shows Modules section with curated module cards
- Enabling a module calls POST /api/modules/:name/enable
- Configure button opens dialog with form fields
- Add module dialog opens with two tabs

- [ ] **Step 2: Update setup wizard E2E**

Add test for Step 4 (Modules):
- After permissions step, shows modules step
- Module cards are visible
- Continue advances to done step

- [ ] **Step 3: Commit**

```bash
git commit -m "test(web): add E2E tests for modules and updated setup wizard"
```

---

## Dependency Graph

```
Phase A (sequential):
  Task 1 (types) → Task 2 (loader) → Task 3 (agent config) → Task 4 (lifecycle)

Phase B (after Phase A):
  Task 5 (curated manifests) ── independent
  Task 6 (API routes) ── depends on Task 4
  Task 7 (webhook) ── depends on Task 4
  Task 8 (server wiring) ── depends on 5, 6, 7

Phase C (after Phase B):
  Task 9 (ModuleCard) ── independent
  Task 10 (Settings page) ── depends on Task 9
  Task 11 (AddModuleDialog) ── depends on Task 9
  Task 12 (Wizard Step 4) ── depends on Task 9
  Task 13 (Navigation) ── independent
  Task 14 (E2E tests) ── depends on 10, 12
```

**Parallelizable within phases:**
- Phase B: Tasks 5, 6, 7 can run in parallel (after Task 4)
- Phase C: Tasks 9, 13 can start immediately. Tasks 10, 11, 12 wait for Task 9.
