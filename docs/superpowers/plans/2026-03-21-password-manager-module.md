# Password Manager Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `password-manager` module that integrates Bitwarden/Vaultwarden via the official MCP server, with OS keychain storage for the master password.

**Architecture:** A self-contained module in `apps/backend/modules/password-manager/` with a manifest, a wrapper script that reads the master password from OS keychain → runs `bw unlock` → spawns the Bitwarden MCP server, and a setup script. One small enhancement to `agent-config.ts` to resolve `./` relative paths in MCP args.

**Tech Stack:** `@napi-rs/keyring` (OS keychain), `@bitwarden/mcp-server` (MCP, via npx), `bw` CLI (user dependency)

**Spec:** `docs/superpowers/specs/2026-03-21-password-manager-module-design.md`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `apps/backend/modules/password-manager/module.json` | Create | Module manifest (MCP server, skills, setup, toolPermissions) |
| `apps/backend/modules/password-manager/start-mcp.js` | Create | Wrapper: keychain → bw unlock → spawn MCP server, pipe stdio |
| `apps/backend/modules/password-manager/setup.ts` | Create | Setup: bw login (interactive) + store master password in keychain |
| `apps/backend/src/shared/agent-config.ts` | Modify | Add `modulesBaseDir` param, resolve `./` args to absolute paths |
| `apps/backend/src/shared/agent-config.test.ts` | Modify | Add test for `./` path resolution |
| `apps/backend/src/index.ts` | Modify | Capture `modulesDir` in `regenerateAgentConfig` closure |
| `apps/backend/package.json` | Modify | Add `@napi-rs/keyring` dependency |
| `apps/backend/src/features/modules/loader.test.ts` | Check | Verify loader test still passes (no loader changes) |

---

### Task 1: Add `@napi-rs/keyring` dependency

**Files:**
- Modify: `apps/backend/package.json`

- [ ] **Step 1: Install the dependency**

```bash
cd /Users/lolo/Documents/opentidy && pnpm --filter @opentidy/backend add @napi-rs/keyring
```

- [ ] **Step 2: Verify install**

```bash
cd /Users/lolo/Documents/opentidy && pnpm --filter @opentidy/backend exec node -e "const { Entry } = require('@napi-rs/keyring'); console.log('keyring OK')"
```

Expected: `keyring OK` (confirms prebuilt binary loaded)

- [ ] **Step 3: Commit**

```bash
git add apps/backend/package.json pnpm-lock.yaml
git commit -m "chore(backend): add @napi-rs/keyring for OS keychain access"
```

---

### Task 2: Add `./` path resolution to `generateSettingsFromModules`

**Files:**
- Modify: `apps/backend/src/shared/agent-config.ts:116-178`
- Test: `apps/backend/src/shared/agent-config.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `apps/backend/src/shared/agent-config.test.ts` inside the `generateSettingsFromModules` describe block:

```typescript
it('resolves ./ prefixed args relative to modulesBaseDir', () => {
  const modules: Record<string, ModuleState> = {
    'password-manager': makeModuleState(true),
  };
  const manifests = new Map<string, ModuleManifest>([
    ['password-manager', makeManifest('password-manager', {
      mcpServers: [{
        name: 'bitwarden',
        command: 'node',
        args: ['./start-mcp.js'],
      }],
    })],
  ]);
  const result = generateSettingsFromModules(modules, manifests, '/opt/opentidy/modules');
  const entry = result.mcpServers['bitwarden'] as { args: string[] };
  expect(entry.args).toEqual(['/opt/opentidy/modules/password-manager/start-mcp.js']);
});

it('does not resolve non-./ args', () => {
  const modules: Record<string, ModuleState> = {
    gmail: makeModuleState(true),
  };
  const manifests = new Map<string, ModuleManifest>([
    ['gmail', makeManifest('gmail', {
      mcpServers: [{
        name: 'gmail',
        command: 'npx',
        args: ['-y', '@gmail/mcp'],
      }],
    })],
  ]);
  const result = generateSettingsFromModules(modules, manifests, '/opt/opentidy/modules');
  const entry = result.mcpServers['gmail'] as { args: string[] };
  expect(entry.args).toEqual(['-y', '@gmail/mcp']);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/lolo/Documents/opentidy && pnpm --filter @opentidy/backend test -- src/shared/agent-config.test.ts
```

Expected: FAIL because `generateSettingsFromModules` doesn't accept 3rd parameter yet.

- [ ] **Step 3: Implement path resolution**

In `apps/backend/src/shared/agent-config.ts`, modify `generateSettingsFromModules` (line 116):

```typescript
export function generateSettingsFromModules(
  modules: Record<string, ModuleState>,
  manifests: Map<string, ModuleManifest>,
  modulesBaseDir?: string,
): ModuleSettingsResult {
```

Then inside the `for (const mcpDef of manifest.mcpServers ?? [])` loop, after the `envFromConfig` resolution block (after line 151), replace the args usage at line 164:

```typescript
      // Resolve ./relative args to absolute paths from module directory
      const resolvedArgs = (mcpDef.args ?? []).map(arg =>
        arg.startsWith('./') && modulesBaseDir
          ? join(modulesBaseDir, moduleName, arg)
          : arg
      );
```

And use `resolvedArgs` instead of `mcpDef.args ?? []` when building the entry (line 164):

```typescript
        entry = {
          type: 'stdio',
          command: mcpDef.command!,
          args: resolvedArgs,
          ...(Object.keys(resolvedEnv).length > 0 ? { env: resolvedEnv } : {}),
        };
```

Also use `resolvedArgs` in the dedup key (line 133):

```typescript
      // Resolve ./relative args to absolute paths from module directory
      const resolvedArgs = (mcpDef.args ?? []).map(arg =>
        arg.startsWith('./') && modulesBaseDir
          ? join(modulesBaseDir, moduleName, arg)
          : arg
      );
      const dedupKey = `${mcpDef.command}::${JSON.stringify(resolvedArgs)}`;
```

Note: Move the `resolvedArgs` computation BEFORE the dedup check so the dedup key uses resolved paths.

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/lolo/Documents/opentidy && pnpm --filter @opentidy/backend test -- src/shared/agent-config.test.ts
```

Expected: ALL PASS (existing tests still pass because `modulesBaseDir` is undefined → no resolution)

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/shared/agent-config.ts apps/backend/src/shared/agent-config.test.ts
git commit -m "feat(backend): resolve ./ relative args in MCP server definitions"
```

---

### Task 3: Wire `modulesBaseDir` through boot

**Files:**
- Modify: `apps/backend/src/shared/agent-config.ts` (function `regenerateAgentConfig`)
- Modify: `apps/backend/src/index.ts`

No changes to `lifecycle.ts`. The closure in `index.ts` captures `modulesDir` from its lexical scope and passes it to `regenerateAgentConfig`. The lifecycle interface stays unchanged.

- [ ] **Step 1: Update `regenerateAgentConfig` signature**

In `apps/backend/src/shared/agent-config.ts`, add `modulesBaseDir` param to `regenerateAgentConfig`:

```typescript
export function regenerateAgentConfig(
  config: OpenTidyConfig,
  envDir?: string,
  modules?: Record<string, ModuleState>,
  manifests?: Map<string, ModuleManifest>,
  modulesBaseDir?: string,
): void {
```

And pass it to `generateSettingsFromModules`:
```typescript
const moduleResult = generateSettingsFromModules(modules, manifests, modulesBaseDir);
```

- [ ] **Step 2: Update `index.ts` to pass `modulesDir`**

In `apps/backend/src/index.ts`:

The direct call at startup (find `regenerateAgentConfig(config, undefined, config.modules, manifests)`):
```typescript
regenerateAgentConfig(config, undefined, config.modules, manifests, modulesDir);
```

The closure passed to `createModuleLifecycle` (find `regenerateAgentConfig: (modules, mans) =>`):
```typescript
regenerateAgentConfig: (modules, mans) => {
  regenerateAgentConfig(config, undefined, modules, mans, modulesDir);
},
```

Note: `modulesDir` is already in scope (defined as `path.resolve(import.meta.dirname, '../modules')`). The lifecycle calls `regenerateAgentConfig(config.modules, manifests)`, and the closure captures `modulesDir` and forwards it. No lifecycle interface change needed.

- [ ] **Step 3: Run affected tests**

```bash
cd /Users/lolo/Documents/opentidy && pnpm --filter @opentidy/backend test -- src/shared/agent-config.test.ts src/features/modules/lifecycle.test.ts
```

Expected: ALL PASS (lifecycle tests unchanged, agent-config tests pass because `modulesBaseDir` is optional)

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/shared/agent-config.ts apps/backend/src/index.ts
git commit -m "feat(backend): wire modulesBaseDir through boot for MCP path resolution"
```

---

### Task 4: Create module manifest

**Files:**
- Create: `apps/backend/modules/password-manager/module.json`
- Test: `apps/backend/src/features/modules/loader.test.ts`

- [ ] **Step 1: Verify the actual Bitwarden MCP tool names**

```bash
cd /Users/lolo/Documents/opentidy && npx -y @bitwarden/mcp-server --help 2>&1 | head -50
```

Or check the npm page / source for the exact tool names exposed. The manifest's `toolPermissions` must match the actual tool names. Adjust the tool names in step 2 if they differ from the spec.

- [ ] **Step 2: Create module.json**

Create `apps/backend/modules/password-manager/module.json`:

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
    "authCommand": "npx tsx ./setup.ts",
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

**Important:** Update tool names based on the verification in step 1.

- [ ] **Step 3: Verify manifest loads**

```bash
cd /Users/lolo/Documents/opentidy && pnpm --filter @opentidy/backend test -- src/features/modules/loader.test.ts
```

Expected: ALL PASS (loader reads all modules from `modules/` dir)

- [ ] **Step 4: Commit**

```bash
git add apps/backend/modules/password-manager/module.json
git commit -m "feat(modules): add password-manager module manifest"
```

---

### Task 5: Create MCP wrapper script (`start-mcp.js`)

**Files:**
- Create: `apps/backend/modules/password-manager/start-mcp.js`

- [ ] **Step 1: Create the wrapper script**

Create `apps/backend/modules/password-manager/start-mcp.js`:

```javascript
#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

// Wrapper script for Bitwarden MCP server.
// Reads master password from OS keychain → bw unlock → spawns MCP server with fresh BW_SESSION.
// IMPORTANT: Only use console.error for logging. stdout is the MCP protocol channel.

import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { execFileSync, spawn } from 'child_process';

// Resolve @napi-rs/keyring from the backend's node_modules.
// This script is spawned by Claude Code outside the backend's module context,
// so we resolve relative to this file's location (modules/password-manager/ → ../../node_modules).
const __dirname = dirname(fileURLToPath(import.meta.url));
const backendRoot = join(__dirname, '..', '..');
const { Entry } = await import(join(backendRoot, 'node_modules', '@napi-rs', 'keyring', 'index.js'));

const SERVICE = 'opentidy';
const ACCOUNT = 'bitwarden-master-password';

try {
  // 1. Read master password from OS keychain
  const entry = new Entry(SERVICE, ACCOUNT);
  const masterPassword = entry.getPassword();
  if (!masterPassword) {
    console.error('[password-manager] No master password in keychain. Run: opentidy setup');
    process.exit(1);
  }

  // 2. Unlock vault and get fresh session token
  const sessionToken = execFileSync('bw', ['unlock', '--passwordenv', 'OPENTIDY_BW_MASTER', '--raw'], {
    env: { ...process.env, OPENTIDY_BW_MASTER: masterPassword },
    encoding: 'utf-8',
    timeout: 30_000,
  }).trim();

  if (!sessionToken) {
    console.error('[password-manager] bw unlock returned empty session token');
    process.exit(1);
  }

  // 3. Spawn the Bitwarden MCP server with BW_SESSION
  // stdio: inherit passes stdin/stdout/stderr through (MCP uses stdin/stdout for JSON-RPC)
  const mcp = spawn('npx', ['-y', '@bitwarden/mcp-server'], {
    env: { ...process.env, BW_SESSION: sessionToken },
    stdio: ['inherit', 'inherit', 'inherit'],
  });

  mcp.on('exit', (code) => process.exit(code ?? 1));
  process.on('SIGTERM', () => mcp.kill('SIGTERM'));
  process.on('SIGINT', () => mcp.kill('SIGINT'));

} catch (err) {
  console.error('[password-manager] Failed to start:', /** @type {Error} */ (err).message);
  process.exit(1);
}
```

**Module resolution note:** This file is plain JavaScript (ES modules). It runs via `node` from Claude Code's process, which is outside the backend's `node_modules` context. To resolve `@napi-rs/keyring`, the script uses a dynamic `import()` with an absolute path relative to its own location: `modules/password-manager/` → `../../node_modules/@napi-rs/keyring/`. This avoids needing `NODE_PATH` or any env var injection. The `"type": "module"` from the backend's `package.json` (2 levels up) applies via Node's package.json traversal.

**Verification step:** Task 6 includes a manual test to verify the wrapper can actually resolve and import `@napi-rs/keyring` when run directly via `node`.

- [ ] **Step 2: Commit**

```bash
git add apps/backend/modules/password-manager/start-mcp.js
git commit -m "feat(modules): add password-manager MCP wrapper script"
```

---

### Task 6: Integration test, verify wrapper resolves correctly

**Files:**
- Test: `apps/backend/src/shared/agent-config.test.ts`

- [ ] **Step 1: Write integration test**

Add to `apps/backend/src/shared/agent-config.test.ts` in the `regenerateAgentConfig (module path)` describe block:

```typescript
it('resolves password-manager wrapper script path in settings.json', () => {
  const modulesBaseDir = '/opt/test/modules';
  const config = buildTestConfig({
    agentConfig: { name: 'claude', configDir: testDir },
    server: { port: 5175, appBaseUrl: 'http://localhost:5175' },
    modules: { 'password-manager': { enabled: true, source: 'curated' } },
  });
  const modules: Record<string, ModuleState> = {
    'password-manager': makeModuleState(true, { apiUrl: 'https://vault.example.com/api' }),
  };
  const manifests = new Map<string, ModuleManifest>([
    ['password-manager', makeManifest('password-manager', {
      mcpServers: [{
        name: 'bitwarden',
        command: 'node',
        args: ['./start-mcp.js'],
        envFromConfig: { BW_API_BASE_URL: 'apiUrl' },
      }],
    })],
  ]);

  regenerateAgentConfig(config, undefined, modules, manifests, modulesBaseDir);

  const settingsPath = join(testDir, 'settings.json');
  const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
  expect(settings.mcpServers.bitwarden).toBeDefined();
  expect(settings.mcpServers.bitwarden.command).toBe('node');
  expect(settings.mcpServers.bitwarden.args).toEqual(['/opt/test/modules/password-manager/start-mcp.js']);
  expect(settings.mcpServers.bitwarden.env).toEqual({ BW_API_BASE_URL: 'https://vault.example.com/api' });
});
```

- [ ] **Step 2: Run test**

```bash
cd /Users/lolo/Documents/opentidy && pnpm --filter @opentidy/backend test -- src/shared/agent-config.test.ts
```

Expected: ALL PASS

- [ ] **Step 3: Verify `start-mcp.js` can resolve `@napi-rs/keyring`**

Run the wrapper script's import path resolution manually:

```bash
cd /Users/lolo/Documents/opentidy && node -e "
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
const scriptDir = 'apps/backend/modules/password-manager';
const backendRoot = join(scriptDir, '..', '..');
const mod = await import(join(process.cwd(), backendRoot, 'node_modules', '@napi-rs', 'keyring', 'index.js'));
console.log('Entry class:', typeof mod.Entry);
" --input-type=module
```

Expected: `Entry class: function` (confirms the relative import path works).

If this fails, the `start-mcp.js` import path needs adjustment. The script must resolve `@napi-rs/keyring` from `apps/backend/node_modules/` (or the hoisted root `node_modules/`). Check where pnpm actually installed it and adjust the path.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/shared/agent-config.test.ts
git commit -m "test(backend): add integration test for password-manager path resolution"
```

---

### Task 7: Create setup script

**Files:**
- Create: `apps/backend/modules/password-manager/setup.ts`

- [ ] **Step 1: Create the setup script**

Create `apps/backend/modules/password-manager/setup.ts`:

```typescript
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

// Setup script for the password-manager module.
// Runs interactively: bw login → prompt master password → store in OS keychain → verify.
// Invoked via: npx tsx ./setup.ts (from authCommand in module.json)

import { Entry } from '@napi-rs/keyring';
import { execFileSync, spawnSync } from 'child_process';
import { createInterface } from 'readline';

const SERVICE = 'opentidy';
const ACCOUNT = 'bitwarden-master-password';
const MAX_RETRIES = 3;

function promptPassword(question: string): Promise<string> {
  return new Promise((resolve) => {
    process.stderr.write(question);
    const rl = createInterface({ input: process.stdin, terminal: false });
    if (process.stdin.isTTY) {
      process.stdin.setRawMode?.(true);
    }
    let password = '';
    process.stdin.on('data', (chunk) => {
      const char = chunk.toString();
      if (char === '\n' || char === '\r' || char === '\r\n') {
        if (process.stdin.isTTY) process.stdin.setRawMode?.(false);
        process.stderr.write('\n');
        rl.close();
        resolve(password);
        return;
      }
      password += char;
    });
  });
}

function verifyPassword(masterPassword: string): boolean {
  try {
    const sessionToken = execFileSync('bw', ['unlock', '--passwordenv', 'OPENTIDY_BW_MASTER', '--raw'], {
      env: { ...process.env, OPENTIDY_BW_MASTER: masterPassword },
      encoding: 'utf-8',
      timeout: 30_000,
    }).trim();
    return sessionToken.length > 0;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  console.log('\n🔐 Password Manager Setup\n');

  // Step 1: Check bw CLI
  try {
    execFileSync('bw', ['--version'], { encoding: 'utf-8' });
  } catch {
    console.error('❌ Bitwarden CLI (bw) not found. Install it: brew install bitwarden-cli');
    process.exit(1);
  }

  // Step 2: Check login status
  const statusRaw = execFileSync('bw', ['status'], { encoding: 'utf-8' });
  const status = JSON.parse(statusRaw);

  if (status.status === 'unauthenticated') {
    console.log('You need to log in to Bitwarden first.\n');
    const loginResult = spawnSync('bw', ['login'], { stdio: 'inherit' });
    if (loginResult.status !== 0) {
      console.error('❌ Login failed');
      process.exit(1);
    }
    console.log('');
  } else {
    console.log(`✓ Already logged in as ${status.userEmail}\n`);
  }

  // Step 3: Prompt for master password + verify (with retry)
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const masterPassword = await promptPassword(
      `Enter your Bitwarden master password (will be stored in OS keychain)${attempt > 1 ? ` [attempt ${attempt}/${MAX_RETRIES}]` : ''}: `
    );

    if (!masterPassword) {
      console.error('❌ No password entered');
      if (attempt === MAX_RETRIES) process.exit(1);
      continue;
    }

    // Verify by unlocking
    if (!verifyPassword(masterPassword)) {
      console.error('❌ Failed to unlock vault, wrong master password?');
      if (attempt === MAX_RETRIES) process.exit(1);
      continue;
    }

    console.log('✓ Password verified, vault unlocked successfully\n');

    // Store in keychain
    try {
      const entry = new Entry(SERVICE, ACCOUNT);
      entry.setPassword(masterPassword);
      console.log('✓ Master password stored in OS keychain\n');
    } catch (err) {
      // Clean up on failure
      try { new Entry(SERVICE, ACCOUNT).deletePassword(); } catch { /* ignore */ }
      console.error('❌ Failed to store in keychain:', (err as Error).message);
      console.error('  On Linux, ensure gnome-keyring or kwallet is installed and running.');
      process.exit(1);
    }

    console.log('✅ Password Manager setup complete!\n');
    return;
  }
}

main().catch((err) => {
  console.error('❌ Setup failed:', (err as Error).message);
  process.exit(1);
});
```

- [ ] **Step 2: Commit**

```bash
git add apps/backend/modules/password-manager/setup.ts
git commit -m "feat(modules): add password-manager setup script"
```

---

### Task 8: Full test suite run and verify

**Files:** (no changes, verification only)

- [ ] **Step 1: Run full backend test suite**

```bash
cd /Users/lolo/Documents/opentidy && pnpm --filter @opentidy/backend test
```

Expected: ALL PASS. No regressions from the `modulesBaseDir` parameter additions.

- [ ] **Step 2: Run typecheck**

```bash
cd /Users/lolo/Documents/opentidy && pnpm --filter @opentidy/backend typecheck
```

Expected: No type errors.

- [ ] **Step 3: Run build**

```bash
cd /Users/lolo/Documents/opentidy && pnpm build
```

Expected: Build succeeds. Note: `modules/password-manager/start-mcp.js` is plain JS (not compiled by tsc). `setup.ts` is run via `npx tsx` (not compiled).

- [ ] **Step 4: Verify module loads at startup**

```bash
cd /Users/lolo/Documents/opentidy && pnpm --filter @opentidy/backend dev 2>&1 | head -20
```

Expected: Log line `[modules] Loaded: password-manager` appears among loaded modules.

---

## Summary

| Task | What | Files |
|---|---|---|
| 1 | Add `@napi-rs/keyring` dep | `package.json` |
| 2 | `./` path resolution in agent-config | `agent-config.ts`, `agent-config.test.ts` |
| 3 | Wire `modulesBaseDir` through boot | `agent-config.ts`, `index.ts` |
| 4 | Module manifest | `modules/password-manager/module.json` |
| 5 | MCP wrapper script | `modules/password-manager/start-mcp.js` |
| 6 | Integration test + module resolution verify | `agent-config.test.ts` |
| 7 | Setup script (with retry) | `modules/password-manager/setup.ts` |
| 8 | Full verification | (no files, test/build/run) |
