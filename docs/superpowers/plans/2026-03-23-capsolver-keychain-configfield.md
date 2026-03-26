# CapSolver Keychain ConfigField Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add CapSolver API key as an optional, keychain-stored config field on the browser module so users can configure CAPTCHA solving from the UI or CLI.

**Architecture:** Extend `ConfigField` with `storage?: 'keychain'` property. Backend `lifecycle.configure()` routes keychain fields to OS keychain via `@napi-rs/keyring` instead of `config.json`. Browser module's `start-mcp.js` wrapper reads the key directly from keychain at runtime (like `password-manager/start-mcp.js`) — the key is NEVER written to `config.json`, `settings.json`, or `mcp-config.json`.

**Tech Stack:** TypeScript, Zod, `@napi-rs/keyring`, Vitest

**Security note:** Keychain values must NEVER flow through `envFromConfig` — that would write them to `mcp-config.json` in plaintext. The MCP wrapper reads from keychain directly at process startup, passing the value only as an in-memory env var to the child process.

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `packages/shared/src/schemas.ts:148-155` | Add `storage` to `ConfigFieldSchema` |
| Modify | `packages/shared/src/types.ts:342-349` | Add `storage` to `ConfigField` interface |
| Modify | `packages/shared/tests/schemas.test.ts:285-303` | Test configField with storage property |
| Modify | `apps/backend/src/features/modules/lifecycle.ts:264-282` | Route keychain fields to OS keychain |
| Modify | `apps/backend/src/features/modules/lifecycle.test.ts:118-165` | Test keychain routing in configure() |
| Modify | `apps/backend/src/features/modules/checks.ts:28-37` | isModuleConfigured checks keychain for keychain fields |
| Modify | `apps/backend/src/features/modules/checks.test.ts` | Test keychain-aware isModuleConfigured |
| Modify | `apps/backend/src/features/modules/types.ts` | Add keychain to ModuleRouteDeps |
| Modify | `apps/backend/src/features/modules/list.ts:16` | Pass keychain to isModuleConfigured |
| Create | `apps/backend/src/shared/keychain.ts` | KeychainAdapter factory wrapping @napi-rs/keyring |
| Modify | `apps/backend/modules/browser/module.json` | Add configFields + start-mcp.js wrapper |
| Create | `apps/backend/modules/browser/start-mcp.js` | Wrapper: reads keychain → addon setup → launch camofox-mcp |

---

### Task 1: Add `storage` to ConfigField schema and type

**Files:**
- Modify: `packages/shared/src/schemas.ts:148-155`
- Modify: `packages/shared/src/types.ts:342-349`
- Modify: `packages/shared/tests/schemas.test.ts:285-303`

- [ ] **Step 1: Write the failing test**

Add to `packages/shared/tests/schemas.test.ts` inside the existing `ModuleManifestSchema` describe block:

```typescript
it('accepts configField with storage: keychain', () => {
  const result = ModuleManifestSchema.safeParse({
    name: 'browser',
    label: 'Browser',
    description: 'Web browsing',
    version: '1.0.0',
    setup: {
      configFields: [
        { key: 'capsolverApiKey', label: 'CapSolver API Key', type: 'password', storage: 'keychain' },
      ],
    },
  });
  expect(result.success).toBe(true);
});

it('accepts configField without storage (defaults to config)', () => {
  const result = ModuleManifestSchema.safeParse({
    name: 'telegram',
    label: 'Telegram',
    description: 'Messaging',
    version: '1.0.0',
    setup: {
      configFields: [
        { key: 'botToken', label: 'Bot Token', type: 'password' },
      ],
    },
  });
  expect(result.success).toBe(true);
});

it('rejects configField with invalid storage value', () => {
  const result = ModuleManifestSchema.safeParse({
    name: 'test',
    label: 'Test',
    description: 'Test',
    version: '1.0.0',
    setup: {
      configFields: [
        { key: 'k', label: 'L', type: 'text', storage: 'invalid' },
      ],
    },
  });
  expect(result.success).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/lolo/Documents/opentidy && pnpm --filter @opentidy/shared test -- --run`
Expected: FAIL — `storage: 'keychain'` not recognized by schema

- [ ] **Step 3: Update ConfigFieldSchema in schemas.ts**

In `packages/shared/src/schemas.ts`, replace the `ConfigFieldSchema`:

```typescript
export const ConfigFieldSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(['text', 'password', 'select']),
  required: z.boolean().optional(),
  placeholder: z.string().optional(),
  options: z.array(z.string()).optional(),
  storage: z.enum(['config', 'keychain']).optional(),
});
```

- [ ] **Step 4: Update ConfigField interface in types.ts**

In `packages/shared/src/types.ts`, replace the `ConfigField` interface:

```typescript
export interface ConfigField {
  key: string;
  label: string;
  type: 'text' | 'password' | 'select';
  required?: boolean;
  placeholder?: string;
  options?: string[];
  storage?: 'config' | 'keychain';
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd /Users/lolo/Documents/opentidy && pnpm --filter @opentidy/shared test -- --run`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/schemas.ts packages/shared/src/types.ts packages/shared/tests/schemas.test.ts
git commit -m "feat(shared): add storage property to ConfigField for keychain support"
```

---

### Task 2: Create KeychainAdapter

**Files:**
- Create: `apps/backend/src/shared/keychain.ts`

- [ ] **Step 1: Create the keychain adapter**

Create `apps/backend/src/shared/keychain.ts`:

```typescript
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { Entry } from '@napi-rs/keyring';

const SERVICE = 'opentidy';

export interface KeychainAdapter {
  setPassword(moduleName: string, key: string, value: string): void;
  getPassword(moduleName: string, key: string): string | null;
  deletePassword(moduleName: string, key: string): void;
}

export function createKeychainAdapter(): KeychainAdapter {
  function account(moduleName: string, key: string): string {
    return `${moduleName}-${key}`;
  }

  return {
    setPassword(moduleName, key, value) {
      const entry = new Entry(SERVICE, account(moduleName, key));
      entry.setPassword(value);
      console.log(`[keychain] Stored ${moduleName}/${key}`);
    },

    getPassword(moduleName, key) {
      try {
        const entry = new Entry(SERVICE, account(moduleName, key));
        return entry.getPassword();
      } catch {
        return null;
      }
    },

    deletePassword(moduleName, key) {
      try {
        const entry = new Entry(SERVICE, account(moduleName, key));
        entry.deletePassword();
        console.log(`[keychain] Deleted ${moduleName}/${key}`);
      } catch {
        // Key not found — that's fine
      }
    },
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/backend/src/shared/keychain.ts
git commit -m "feat(backend): create KeychainAdapter wrapping @napi-rs/keyring"
```

---

### Task 3: Keychain-aware `lifecycle.configure()`

**Files:**
- Modify: `apps/backend/src/features/modules/lifecycle.ts:17-32` (deps interface) and `:264-282` (configure function)
- Modify: `apps/backend/src/features/modules/lifecycle.test.ts:118-165`

- [ ] **Step 1: Write the failing tests**

Add to `apps/backend/src/features/modules/lifecycle.test.ts` inside the `configure()` describe block:

```typescript
it('routes keychain fields to keychain and excludes them from config.json', async () => {
  const { loadConfig, saveConfig, regenerateAgentConfig, sse, manifests } = makeDeps({
    modules: { browser: { enabled: false, source: 'curated' } },
  });
  manifests.set('browser', makeManifest('browser', {
    setup: {
      configFields: [
        { key: 'capsolverApiKey', label: 'CapSolver API Key', type: 'password', storage: 'keychain' },
      ],
    },
  }));

  const mockSetPassword = vi.fn();
  const lifecycle = createModuleLifecycle({
    loadConfig, saveConfig, manifests, regenerateAgentConfig, sse,
    keychain: {
      setPassword: mockSetPassword,
      getPassword: vi.fn(),
      deletePassword: vi.fn(),
    },
  });

  await lifecycle.configure('browser', { capsolverApiKey: 'CAP-abc123' });

  // Keychain field stored in keychain, not in config.json
  expect(mockSetPassword).toHaveBeenCalledWith('browser', 'capsolverApiKey', 'CAP-abc123');
  const savedConfig = saveConfig.mock.calls[0][0] as OpenTidyConfig;
  expect(savedConfig.modules['browser'].config).toEqual({});
});

it('stores non-keychain fields normally alongside keychain routing', async () => {
  const { loadConfig, saveConfig, regenerateAgentConfig, sse, manifests } = makeDeps({
    modules: { browser: { enabled: false, source: 'curated' } },
  });
  manifests.set('browser', makeManifest('browser', {
    setup: {
      configFields: [
        { key: 'capsolverApiKey', label: 'Key', type: 'password', storage: 'keychain' },
        { key: 'someOption', label: 'Option', type: 'text' },
      ],
    },
  }));

  const mockSetPassword = vi.fn();
  const lifecycle = createModuleLifecycle({
    loadConfig, saveConfig, manifests, regenerateAgentConfig, sse,
    keychain: {
      setPassword: mockSetPassword,
      getPassword: vi.fn(),
      deletePassword: vi.fn(),
    },
  });

  await lifecycle.configure('browser', { capsolverApiKey: 'CAP-abc', someOption: 'value' });

  expect(mockSetPassword).toHaveBeenCalledWith('browser', 'capsolverApiKey', 'CAP-abc');
  const savedConfig = saveConfig.mock.calls[0][0] as OpenTidyConfig;
  expect(savedConfig.modules['browser'].config).toEqual({ someOption: 'value' });
});

it('deletes keychain entry when value is empty string', async () => {
  const { loadConfig, saveConfig, regenerateAgentConfig, sse, manifests } = makeDeps({
    modules: { browser: { enabled: false, source: 'curated' } },
  });
  manifests.set('browser', makeManifest('browser', {
    setup: {
      configFields: [
        { key: 'capsolverApiKey', label: 'Key', type: 'password', storage: 'keychain' },
      ],
    },
  }));

  const mockDeletePassword = vi.fn();
  const lifecycle = createModuleLifecycle({
    loadConfig, saveConfig, manifests, regenerateAgentConfig, sse,
    keychain: {
      setPassword: vi.fn(),
      getPassword: vi.fn(),
      deletePassword: mockDeletePassword,
    },
  });

  await lifecycle.configure('browser', { capsolverApiKey: '' });

  expect(mockDeletePassword).toHaveBeenCalledWith('browser', 'capsolverApiKey');
});

it('works without keychain dep (modules without keychain fields)', async () => {
  const { loadConfig, saveConfig, regenerateAgentConfig, sse, manifests } = makeDeps({
    modules: { email: { enabled: false, source: 'curated' } },
  });
  manifests.set('email', makeManifest('email'));

  // No keychain injected
  const lifecycle = createModuleLifecycle({
    loadConfig, saveConfig, manifests, regenerateAgentConfig, sse,
  });

  await lifecycle.configure('email', { apiKey: 'plain-value' });

  const savedConfig = saveConfig.mock.calls[0][0] as OpenTidyConfig;
  expect(savedConfig.modules['email'].config).toEqual({ apiKey: 'plain-value' });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/lolo/Documents/opentidy && pnpm --filter @opentidy/backend test -- --run src/features/modules/lifecycle.test.ts`
Expected: FAIL — `keychain` not a recognized property of deps

- [ ] **Step 3: Add keychain to ModuleLifecycleDeps and implement configure()**

In `apps/backend/src/features/modules/lifecycle.ts`:

Add to `ModuleLifecycleDeps` interface (after `modulesDataBaseDir`):

```typescript
keychain?: {
  setPassword(moduleName: string, key: string, value: string): void;
  getPassword(moduleName: string, key: string): string | null;
  deletePassword(moduleName: string, key: string): void;
};
```

Replace the `configure()` function body:

```typescript
async function configure(name: string, configValues: Record<string, unknown>): Promise<void> {
  console.log(`[modules] Configuring module: ${name}`);

  // Separate keychain fields from config fields
  const manifest = manifests.get(name);
  const keychainFields = new Set(
    (manifest?.setup?.configFields ?? [])
      .filter((f) => f.storage === 'keychain')
      .map((f) => f.key),
  );

  const configOnly: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(configValues)) {
    if (keychainFields.has(key)) {
      const strValue = String(value ?? '');
      if (strValue && deps.keychain) {
        deps.keychain.setPassword(name, key, strValue);
      } else if (!strValue && deps.keychain) {
        deps.keychain.deletePassword(name, key);
      }
    } else {
      configOnly[key] = value;
    }
  }

  const config = loadConfig();
  if (!config.modules[name]) {
    config.modules[name] = { enabled: false, source: 'curated' };
  }
  config.modules[name].config = {
    ...(config.modules[name].config ?? {}),
    ...configOnly,
  };
  saveConfig(config);

  if (config.modules[name].enabled) {
    regenerateAgentConfig(config.modules, manifests);
  }

  emitSSE({ type: 'module:configured', data: { name }, timestamp: new Date().toISOString() });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/lolo/Documents/opentidy && pnpm --filter @opentidy/backend test -- --run src/features/modules/lifecycle.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/features/modules/lifecycle.ts apps/backend/src/features/modules/lifecycle.test.ts
git commit -m "feat(backend): route keychain configFields to OS keychain in lifecycle.configure()"
```

---

### Task 4: Keychain-aware `isModuleConfigured()` and route deps

**Files:**
- Modify: `apps/backend/src/features/modules/checks.ts:28-37`
- Modify: `apps/backend/src/features/modules/checks.test.ts`
- Modify: `apps/backend/src/features/modules/types.ts`
- Modify: `apps/backend/src/features/modules/list.ts:16`

- [ ] **Step 1: Write the failing tests**

Add to `apps/backend/src/features/modules/checks.test.ts`. Update imports to include `vi`:

```typescript
import { describe, it, expect, vi } from 'vitest';
```

Then add a new describe block:

```typescript
describe('isModuleConfigured with keychain fields', () => {
  it('returns true when required keychain field has a value in keychain', () => {
    const manifest: ModuleManifest = {
      name: 'test', label: 'Test', description: 'Test', version: '1.0.0',
      setup: {
        configFields: [
          { key: 'apiKey', label: 'API Key', type: 'password', required: true, storage: 'keychain' },
        ],
      },
    };
    const getPassword = vi.fn().mockReturnValue('stored-key');
    expect(isModuleConfigured(manifest, {}, { getPassword })).toBe(true);
    expect(getPassword).toHaveBeenCalledWith('test', 'apiKey');
  });

  it('returns false when required keychain field is missing from keychain', () => {
    const manifest: ModuleManifest = {
      name: 'test', label: 'Test', description: 'Test', version: '1.0.0',
      setup: {
        configFields: [
          { key: 'apiKey', label: 'API Key', type: 'password', required: true, storage: 'keychain' },
        ],
      },
    };
    const getPassword = vi.fn().mockReturnValue(null);
    expect(isModuleConfigured(manifest, {}, { getPassword })).toBe(false);
  });

  it('returns true for optional keychain fields regardless of keychain state', () => {
    const manifest: ModuleManifest = {
      name: 'test', label: 'Test', description: 'Test', version: '1.0.0',
      setup: {
        configFields: [
          { key: 'apiKey', label: 'API Key', type: 'password', storage: 'keychain' },
        ],
      },
    };
    // No keychain adapter — optional field, should still be configured
    expect(isModuleConfigured(manifest, {})).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/lolo/Documents/opentidy && pnpm --filter @opentidy/backend test -- --run src/features/modules/checks.test.ts`
Expected: FAIL — `isModuleConfigured` doesn't accept keychain param

- [ ] **Step 3: Update isModuleConfigured**

In `apps/backend/src/features/modules/checks.ts`:

```typescript
export function isModuleConfigured(
  manifest: ModuleManifest,
  moduleConfig: Record<string, unknown>,
  keychain?: { getPassword(moduleName: string, key: string): string | null },
): boolean {
  const requiredFields = (manifest.setup?.configFields ?? []).filter((f) => f.required);
  return (
    requiredFields.length === 0 ||
    requiredFields.every((f) => {
      if (f.storage === 'keychain') {
        // Keychain fields are checked via keychain adapter if available
        return keychain ? !!keychain.getPassword(manifest.name, f.key) : false;
      }
      return moduleConfig[f.key] != null && moduleConfig[f.key] !== '';
    })
  );
}
```

- [ ] **Step 4: Add keychain to ModuleRouteDeps and update callers**

In `apps/backend/src/features/modules/types.ts`, add to `ModuleRouteDeps`:

```typescript
keychain?: {
  getPassword(moduleName: string, key: string): string | null;
};
```

In `apps/backend/src/features/modules/list.ts` line 16, update:

```typescript
const configured = isModuleConfigured(manifest, moduleConfig, deps.keychain);
```

Search for other callers of `isModuleConfigured` (grep for `isModuleConfigured`) and update them similarly.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd /Users/lolo/Documents/opentidy && pnpm --filter @opentidy/backend test -- --run src/features/modules/checks.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/features/modules/checks.ts apps/backend/src/features/modules/checks.test.ts apps/backend/src/features/modules/types.ts apps/backend/src/features/modules/list.ts
git commit -m "feat(backend): keychain-aware isModuleConfigured()"
```

---

### Task 5: Update browser module.json

**Files:**
- Modify: `apps/backend/modules/browser/module.json`

- [ ] **Step 1: Update module.json**

Replace `apps/backend/modules/browser/module.json`. Key changes:
- MCP command → `node ./start-mcp.js` (wrapper, like password-manager)
- NO `envFromConfig` for CapSolver key (security: never write keychain secrets to config files)
- Added `configFields` with optional CapSolver API key
- Updated skill content with CapSolver hint

```json
{
  "name": "browser",
  "label": "Browser",
  "description": "Web browsing via anti-detection browser (Camoufox)",
  "icon": "🌐",
  "version": "1.0.0",
  "cli": ["camoufox"],
  "mcpServers": [{
    "name": "camoufox",
    "command": "node",
    "args": ["./start-mcp.js"]
  }],
  "skills": [{
    "name": "browser-skill",
    "content": "When browsing the web, use the Camoufox MCP tools. Each session has its own isolated browser profile with persistent cookies and logins. If a CAPTCHA appears, wait 15-30 seconds — the CapSolver extension (if configured) solves them automatically. Do NOT interact with CAPTCHA elements yourself."
  }],
  "setup": {
    "authCommand": "command -v pipx >/dev/null || brew install pipx && pipx install camoufox && camoufox fetch",
    "checkCommand": "pipx list --short 2>/dev/null | grep -q camoufox",
    "configFields": [
      {
        "key": "capsolverApiKey",
        "label": "CapSolver API Key",
        "type": "password",
        "required": false,
        "storage": "keychain",
        "placeholder": "CAP-xxx (optional — enables automatic CAPTCHA solving)"
      }
    ]
  },
  "toolPermissions": {
    "scope": "per-task",
    "safe": [
      { "tool": "mcp__camofox__navigate", "label": "Visit websites" },
      { "tool": "mcp__camofox__navigate_and_snapshot", "label": "Navigate and snapshot" },
      { "tool": "mcp__camofox__snapshot", "label": "Take snapshots" },
      { "tool": "mcp__camofox__scroll", "label": "Scroll pages" },
      { "tool": "mcp__camofox__scroll_and_snapshot", "label": "Scroll and snapshot" },
      { "tool": "mcp__camofox__get_links", "label": "Extract links" },
      { "tool": "mcp__camofox__list_tabs", "label": "List tabs" },
      { "tool": "mcp__camofox__screenshot", "label": "Take screenshots" },
      { "tool": "mcp__camofox__extract_resources", "label": "Extract page data" },
      { "tool": "mcp__camofox__click", "label": "Click elements" },
      { "tool": "mcp__camofox__type_text", "label": "Type text" },
      { "tool": "mcp__camofox__batch_click", "label": "Click multiple elements" }
    ],
    "critical": [
      { "tool": "mcp__camofox__fill_form", "label": "Fill forms" },
      { "tool": "mcp__camofox__camofox_evaluate_js", "label": "Run JavaScript" },
      { "tool": "mcp__camofox__type_and_submit", "label": "Type and submit" }
    ]
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/backend/modules/browser/module.json
git commit -m "feat(backend): add CapSolver configField to browser module"
```

---

### Task 6: Create browser `start-mcp.js` wrapper

**Files:**
- Create: `apps/backend/modules/browser/start-mcp.js`

- [ ] **Step 1: Create the wrapper script**

Create `apps/backend/modules/browser/start-mcp.js`. This follows the `password-manager/start-mcp.js` pattern — reads the API key from keychain directly, NEVER from env/config files.

```javascript
#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

// Wrapper for Camoufox MCP server.
// Reads CapSolver API key from OS keychain (if configured).
// If present: downloads + extracts the CapSolver Firefox addon, injects the API key.
// Then launches camofox-mcp.
// IMPORTANT: Only use console.error for logging — stdout is the MCP protocol channel.

import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { execFileSync, spawn } from 'child_process';
import { Entry } from '@napi-rs/keyring';

const SERVICE = 'opentidy';
const KEYCHAIN_ACCOUNT = 'browser-capsolverApiKey';

const ADDONS_DIR = join(process.env.HOME || '', '.camofox', 'addons');
const CAPSOLVER_DIR = join(ADDONS_DIR, 'capsolver');
const CAPSOLVER_XPI_URL = 'https://addons.mozilla.org/firefox/downloads/latest/capsolver-captcha-solver/latest.xpi';
const CONFIG_JS_PATH = join(CAPSOLVER_DIR, 'assets', 'config.js');

function readKeychainKey() {
  try {
    const entry = new Entry(SERVICE, KEYCHAIN_ACCOUNT);
    return entry.getPassword();
  } catch {
    return null;
  }
}

function setupCapsolverAddon(apiKey) {
  // Download and extract addon if not present
  if (!existsSync(join(CAPSOLVER_DIR, 'manifest.json'))) {
    console.error('[browser] Downloading CapSolver extension...');
    mkdirSync(CAPSOLVER_DIR, { recursive: true });
    const tmpXpi = join(ADDONS_DIR, 'capsolver-tmp.xpi');
    try {
      execFileSync('curl', ['-fsSL', '-o', tmpXpi, CAPSOLVER_XPI_URL], { timeout: 60_000 });
      execFileSync('unzip', ['-qo', tmpXpi, '-d', CAPSOLVER_DIR], { timeout: 30_000 });
      try { execFileSync('rm', ['-f', tmpXpi]); } catch { /* ignore */ }
      console.error('[browser] CapSolver extension extracted');
    } catch (err) {
      console.error('[browser] Failed to download CapSolver extension:', err.message);
      return; // Non-fatal — continue without addon
    }
  }

  // Inject API key into config.js (skip if already correct)
  if (existsSync(CONFIG_JS_PATH)) {
    const currentConfig = readFileSync(CONFIG_JS_PATH, 'utf-8');
    if (currentConfig.includes(`apiKey: '${apiKey}'`)) {
      return; // Already configured
    }
  }

  console.error('[browser] Injecting CapSolver API key...');
  mkdirSync(join(CAPSOLVER_DIR, 'assets'), { recursive: true });
  writeFileSync(CONFIG_JS_PATH, `export const defaultConfig = {
  apiKey: '${apiKey}',
  appId: '',
  useCapsolver: true,
  manualSolving: false,
  solvedCallback: 'captchaSolvedCallback',
  useProxy: false,
  proxyType: 'http',
  hostOrIp: '',
  port: '',
  proxyLogin: '',
  proxyPassword: '',
  enabledForBlacklistControl: false,
  blackUrlList: [],
  isInBlackList: false,
  enabledForRecaptcha: true,
  enabledForRecaptchaV3: true,
  enabledForHCaptcha: true,
  enabledForFunCaptcha: false,
  reCaptchaMode: 'click',
  hCaptchaMode: 'click',
  reCaptchaDelayTime: 0,
  hCaptchaDelayTime: 0,
  reCaptchaRepeatTimes: 10,
  reCaptcha3RepeatTimes: 10,
  hCaptchaRepeatTimes: 10,
  funCaptchaRepeatTimes: 10,
  textCaptchaRepeatTimes: 10,
  awsRepeatTimes: 10,
  reCaptcha3TaskType: 'ReCaptchaV3TaskProxyLess',
  textCaptchaSourceAttribute: 'capsolver-image-to-text-source',
  textCaptchaResultAttribute: 'capsolver-image-to-text-result',
};
`);
  console.error('[browser] CapSolver configured');
}

try {
  // Read CapSolver API key from OS keychain (NOT from env or config files)
  const capsolverKey = readKeychainKey();
  if (capsolverKey) {
    setupCapsolverAddon(capsolverKey);
  }

  // Launch camofox-mcp via npx (standard module pattern for npm-distributed MCPs)
  const mcp = spawn('npx', ['-y', 'camofox-mcp@latest'], {
    stdio: ['inherit', 'inherit', 'inherit'],
    env: process.env,
  });

  mcp.on('exit', (code) => process.exit(code ?? 1));
  process.on('SIGTERM', () => mcp.kill('SIGTERM'));
  process.on('SIGINT', () => mcp.kill('SIGINT'));

} catch (err) {
  console.error('[browser] Failed to start:', err.message);
  process.exit(1);
}
```

- [ ] **Step 2: Verify module loader accepts the updated manifest**

Run: `cd /Users/lolo/Documents/opentidy && pnpm --filter @opentidy/backend test -- --run src/features/modules/loader.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/backend/modules/browser/start-mcp.js
git commit -m "feat(backend): browser start-mcp.js wrapper with CapSolver addon setup from keychain"
```

---

### Task 7: Wire keychain into boot sequence

**Files:**
- Modify: boot/wiring code (find by grepping for `createModuleLifecycle(`)

- [ ] **Step 1: Find and update wiring points**

Search for all call sites:
```bash
grep -rn 'createModuleLifecycle\|createKeychainAdapter' apps/backend/src/
```

In the file where `createModuleLifecycle` is called (likely `apps/backend/src/index.ts`):

```typescript
import { createKeychainAdapter } from './shared/keychain.js';

// ... where lifecycle deps are assembled:
const keychain = createKeychainAdapter();

// Pass to createModuleLifecycle:
const lifecycle = createModuleLifecycle({
  // ... existing deps ...
  keychain,
});
```

Also pass `keychain` to any `ModuleRouteDeps` assembly (for the `list` route):

```typescript
const moduleDeps: ModuleRouteDeps = {
  // ... existing deps ...
  keychain,
};
```

- [ ] **Step 2: Run full backend test suite**

Run: `cd /Users/lolo/Documents/opentidy && pnpm --filter @opentidy/backend test -- --run`
Expected: PASS (keychain is optional in all deps, existing tests unaffected)

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/index.ts
git commit -m "feat(backend): wire KeychainAdapter into module lifecycle and route deps"
```

---

### Task 8: Full test suite verification

- [ ] **Step 1: Build shared package**

Run: `cd /Users/lolo/Documents/opentidy && pnpm --filter @opentidy/shared build`
Expected: PASS

- [ ] **Step 2: Run all backend tests**

Run: `cd /Users/lolo/Documents/opentidy && pnpm --filter @opentidy/backend test -- --run`
Expected: PASS

- [ ] **Step 3: Run shared tests**

Run: `cd /Users/lolo/Documents/opentidy && pnpm --filter @opentidy/shared test -- --run`
Expected: PASS

- [ ] **Step 4: Run E2E tests**

Run: `cd /Users/lolo/Documents/opentidy && pnpm test:e2e`
Expected: PASS (ModuleConfigDialog renders the new field automatically from configFields)
