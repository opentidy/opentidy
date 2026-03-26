# Setup MCP Services & Cloud Config Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `opentidy setup` configure all MCP servers (Gmail, Camoufox, WhatsApp), user identity, and generate the agent's Claude config dynamically; so agents have full capabilities out of the box.

**Architecture:** Each MCP service gets its own setup module (install check, auth flow, config storage). The existing `setupClaude` module is refactored to **generate** `settings.json` dynamically from config rather than copying a static template. User info (name, email, company, language) is collected early and injected into the CLAUDE.md template at generation time.

**Tech Stack:** TypeScript, Node.js child_process (execFileSync only, no exec), readline, Vitest

---

## Context

### Current state
- `apps/backend/config/claude/settings.json`: static template with permissions only, NO `mcpServers`
- Agents inherit MCP servers from user's personal `~/.claude/settings.json` (works on dev machine, breaks for anyone else)
- `setupClaude` copies template files verbatim to `~/.config/opentidy/claude-config/`
- CLAUDE.md template has placeholder comments like `(configured during setup)` for user info

### Target state
- `opentidy setup` has modules for: user-info, telegram, auth, gmail, whatsapp, camoufox, claude, cloudflare, permissions
- Config (`~/.config/opentidy/config.json`) stores MCP service states and user identity
- `setupClaude` generates `settings.json` with permissions + `mcpServers` based on what's configured
- CLAUDE.md is generated with real user info (name, email, language)
- Each MCP module handles its own install check + auth flow

### How Claude sessions use config
- `CLAUDE_CONFIG_DIR` env var set at spawn time in `spawn-claude.ts`
- `--strict-mcp-config --mcp-config '{}'` blocks cloud MCP from claude.ai account. `settings.json` in `CLAUDE_CONFIG_DIR` provides the actual MCP servers (additive: `--mcp-config` overrides, `settings.json` is the base).
- `--plugin-dir plugins/opentidy-hooks` hooks loaded via plugin flag

### MCP servers needed

| MCP | Command | Auth | Priority |
|-----|---------|------|----------|
| Gmail | `npx @gongrzhe/server-gmail-autoauth-mcp` | OAuth (browser) | P1 |
| Camoufox | `npx camofox-mcp@latest` (via wrapper) | None | P1 |
| WhatsApp | `wacli` CLI or `uv run server.py` (mcp-wacli) | QR code | P2 (optional) |

### Test conventions
- Mock `ask()` with `vi.mocked(ask).mockResolvedValueOnce(...)`, one call per expected prompt, in order
- Mock `run()` with `vi.mocked(run).mockReturnValue(...)` for shell commands
- Mock `execFileSync` for subprocess calls (never use `exec`, command injection risk)
- Always clean up `process.env.OPENTIDY_CONFIG_PATH` in `afterEach`
- Use `os.homedir()` instead of `process.env.HOME || '~'` (tilde not expanded by Node.js)

---

## File Structure

### New files
- `apps/backend/src/cli/setup/user-info.ts`: collect name, email, company, language
- `apps/backend/src/cli/setup/gmail.ts`: Gmail MCP setup (npx + OAuth)
- `apps/backend/src/cli/setup/whatsapp.ts`: WhatsApp setup (wacli check + auth)
- `apps/backend/src/cli/setup/camoufox.ts`: Camoufox MCP setup (npx check + wrapper)
- `apps/backend/tests/cli/setup/user-info.test.ts`
- `apps/backend/tests/cli/setup/gmail.test.ts`
- `apps/backend/tests/cli/setup/whatsapp.test.ts`
- `apps/backend/tests/cli/setup/camoufox.test.ts`
- `apps/backend/tests/cli/setup/claude.test.ts`: tests for generateClaudeSettings + generateClaudeMd

### Modified files
- `packages/shared/src/types.ts`: add `userInfo` and `mcp` to `OpenTidyConfig`
- `apps/backend/src/config.ts`: update `DEFAULT_CONFIG` with new sections
- `apps/backend/src/cli/setup/claude.ts`: refactor to generate settings.json dynamically
- `apps/backend/src/cli/setup/index.ts`: export new modules, remove `copyClaudeConfigTemplate` re-export
- `apps/backend/src/cli/setup.ts`: add modules to menu + order, remove `copyClaudeConfigTemplate` re-export
- `apps/backend/src/cli/setup/status.ts`: add status checks for new modules, reorder to match MODULE_ORDER

### Unchanged
- `apps/backend/config/claude/settings.json`: kept as fallback/reference, no longer primary source
- `apps/backend/config/claude/CLAUDE.md`: kept as template, personalized at generation time

---

## Task 1: Extend OpenTidyConfig with userInfo and mcp sections

**Files:**
- Modify: `packages/shared/src/types.ts:177-207`
- Modify: `apps/backend/src/config.ts:11-35`
- Create: `apps/backend/tests/cli/setup/config-shape.test.ts`

- [ ] **Step 1: Write failing test for new config shape**

Create `apps/backend/tests/cli/setup/config-shape.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { loadConfig } from '../../../src/config.js';

describe('OpenTidyConfig shape', () => {
  it('has userInfo section with defaults', () => {
    const config = loadConfig('/nonexistent/path/config.json');
    expect(config.userInfo).toEqual({ name: '', email: '', company: '' });
  });

  it('has mcp section with defaults', () => {
    const config = loadConfig('/nonexistent/path/config.json');
    expect(config.mcp).toEqual({
      gmail: { enabled: false, configured: false },
      camoufox: { enabled: false, configured: false },
      whatsapp: { enabled: false, configured: false, wacliPath: '', mcpServerPath: '' },
    });
  });

  it('deep-merges existing config missing new sections', () => {
    const config = loadConfig('/nonexistent/path/config.json');
    expect(config.version).toBe(1);
    expect(config.userInfo.name).toBe('');
    expect(config.mcp.gmail.enabled).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @opentidy/backend exec vitest run tests/cli/setup/config-shape.test.ts`
Expected: FAIL (`userInfo` and `mcp` don't exist on config type)

- [ ] **Step 3: Add types to shared package**

In `packages/shared/src/types.ts`, add before `OpenTidyConfig`:

```typescript
// === MCP Service Config ===
export interface McpServiceState {
  enabled: boolean;
  configured: boolean;
}

export interface WhatsAppMcpState extends McpServiceState {
  wacliPath: string;
  mcpServerPath: string;
}

export interface McpConfig {
  gmail: McpServiceState;
  camoufox: McpServiceState;
  whatsapp: WhatsAppMcpState;
}

export interface UserInfo {
  name: string;
  email: string;
  company: string;
}
```

Then add to `OpenTidyConfig`:

```typescript
export interface OpenTidyConfig {
  // ... existing fields ...
  userInfo: UserInfo;
  mcp: McpConfig;
}
```

- [ ] **Step 4: Update DEFAULT_CONFIG in config.ts**

In `apps/backend/src/config.ts`, add to `DEFAULT_CONFIG`:

```typescript
userInfo: { name: '', email: '', company: '' },
mcp: {
  gmail: { enabled: false, configured: false },
  camoufox: { enabled: false, configured: false },
  whatsapp: { enabled: false, configured: false, wacliPath: '', mcpServerPath: '' },
},
```

- [ ] **Step 5: Build shared + run test**

Run: `pnpm --filter @opentidy/shared build && pnpm --filter @opentidy/backend exec vitest run tests/cli/setup/config-shape.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/types.ts apps/backend/src/config.ts apps/backend/tests/cli/setup/config-shape.test.ts
git commit -m "feat(config): add userInfo and mcp sections to OpenTidyConfig"
```

---

## Task 2: Create setupUserInfo module

Collects name, email, company, and **language** (used to personalize CLAUDE.md).

**Files:**
- Create: `apps/backend/src/cli/setup/user-info.ts`
- Create: `apps/backend/tests/cli/setup/user-info.test.ts`

- [ ] **Step 1: Write failing test**

Create `apps/backend/tests/cli/setup/user-info.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { loadConfig } from '../../../src/config.js';

vi.mock('../../../src/cli/setup/utils.js', () => ({
  ask: vi.fn(),
  closeRl: vi.fn(),
  info: vi.fn(),
  success: vi.fn(),
  warn: vi.fn(),
}));

import { ask } from '../../../src/cli/setup/utils.js';

describe('setupUserInfo', () => {
  let configDir: string;
  let configPath: string;

  beforeEach(() => {
    vi.clearAllMocks();
    configDir = join(tmpdir(), `opentidy-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(configDir, { recursive: true });
    configPath = join(configDir, 'config.json');
    writeFileSync(configPath, JSON.stringify({ version: 1 }));
    process.env.OPENTIDY_CONFIG_PATH = configPath;
  });

  afterEach(() => {
    delete process.env.OPENTIDY_CONFIG_PATH;
    rmSync(configDir, { recursive: true, force: true });
  });

  it('saves user info and language to config', async () => {
    vi.mocked(ask)
      .mockResolvedValueOnce('Alice Dupont')    // Full name
      .mockResolvedValueOnce('alice@example.com') // Email
      .mockResolvedValueOnce('Acme Corp')        // Company
      .mockResolvedValueOnce('fr');              // Language

    const { setupUserInfo } = await import('../../../src/cli/setup/user-info.js');
    await setupUserInfo();

    const config = loadConfig(configPath);
    expect(config.userInfo.name).toBe('Alice Dupont');
    expect(config.userInfo.email).toBe('alice@example.com');
    expect(config.userInfo.company).toBe('Acme Corp');
    expect(config.language).toBe('fr');
  });

  it('keeps existing info when user confirms', async () => {
    writeFileSync(configPath, JSON.stringify({
      version: 1,
      userInfo: { name: 'Bob', email: 'bob@example.com', company: 'Corp' },
      language: 'en',
    }));

    vi.mocked(ask)
      .mockResolvedValueOnce('');  // Keep current info? -> Enter (yes)

    const { setupUserInfo } = await import('../../../src/cli/setup/user-info.js');
    await setupUserInfo();

    const config = loadConfig(configPath);
    expect(config.userInfo.name).toBe('Bob');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @opentidy/backend exec vitest run tests/cli/setup/user-info.test.ts`
Expected: FAIL (module doesn't exist)

- [ ] **Step 3: Implement setupUserInfo**

Create `apps/backend/src/cli/setup/user-info.ts`:

```typescript
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { loadConfig, saveConfig, getConfigPath } from '../../config.js';
import { ask, info, success } from './utils.js';

export async function setupUserInfo(): Promise<void> {
  const configPath = getConfigPath();
  const config = loadConfig(configPath);

  console.log('');
  console.log('  ┌─────────────────────────────────────┐');
  console.log('  │  User Info                            │');
  console.log('  └─────────────────────────────────────┘');
  console.log('');
  info('OpenTidy needs your info to personalize the assistant.');
  console.log('');

  if (config.userInfo.name) {
    info(`Current: ${config.userInfo.name} <${config.userInfo.email}> (${config.language})`);
    const keep = await ask('  Keep current info? (Y/n) ');
    if (keep.toLowerCase() !== 'n') {
      success('User info unchanged.');
      return;
    }
  }

  config.userInfo.name = await ask('  Full name: ');
  config.userInfo.email = await ask('  Email: ');
  config.userInfo.company = await ask('  Company (optional): ');

  const lang = await ask('  Assistant language (en/fr): ');
  config.language = lang === 'fr' ? 'fr' : 'en';

  saveConfig(configPath, config);
  success('User info saved.');
}
```

- [ ] **Step 4: Run test**

Run: `pnpm --filter @opentidy/backend exec vitest run tests/cli/setup/user-info.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/cli/setup/user-info.ts apps/backend/tests/cli/setup/user-info.test.ts
git commit -m "feat(setup): add user-info module for name/email/company/language"
```

---

## Task 3: Create setupGmail module

**Files:**
- Create: `apps/backend/src/cli/setup/gmail.ts`
- Create: `apps/backend/tests/cli/setup/gmail.test.ts`

- [ ] **Step 1: Write failing test**

Create `apps/backend/tests/cli/setup/gmail.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { loadConfig } from '../../../src/config.js';

vi.mock('../../../src/cli/setup/utils.js', () => ({
  ask: vi.fn(),
  run: vi.fn(),
  closeRl: vi.fn(),
  info: vi.fn(),
  success: vi.fn(),
  warn: vi.fn(),
}));

vi.mock('child_process', () => ({
  execFileSync: vi.fn(),
}));

import { ask, warn } from '../../../src/cli/setup/utils.js';
import { execFileSync } from 'child_process';

describe('setupGmail', () => {
  let configDir: string;
  let configPath: string;

  beforeEach(() => {
    vi.clearAllMocks();
    configDir = join(tmpdir(), `opentidy-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(configDir, { recursive: true });
    configPath = join(configDir, 'config.json');
    writeFileSync(configPath, JSON.stringify({ version: 1 }));
    process.env.OPENTIDY_CONFIG_PATH = configPath;
  });

  afterEach(() => {
    delete process.env.OPENTIDY_CONFIG_PATH;
    rmSync(configDir, { recursive: true, force: true });
  });

  it('marks gmail as configured on successful OAuth', async () => {
    vi.mocked(execFileSync).mockReturnValue('');
    vi.mocked(ask).mockResolvedValueOnce(''); // Press Enter to start OAuth

    const { setupGmail } = await import('../../../src/cli/setup/gmail.js');
    await setupGmail();

    const config = loadConfig(configPath);
    expect(config.mcp.gmail.enabled).toBe(true);
    expect(config.mcp.gmail.configured).toBe(true);
  });

  it('warns when npx is not found', async () => {
    vi.mocked(execFileSync).mockImplementation(() => { throw new Error('not found'); });

    const { setupGmail } = await import('../../../src/cli/setup/gmail.js');
    await setupGmail();

    expect(vi.mocked(warn)).toHaveBeenCalledWith(expect.stringContaining('npx not found'));
    const config = loadConfig(configPath);
    expect(config.mcp.gmail.enabled).toBe(false);
  });

  it('still configures when OAuth exits non-zero but credentials exist', async () => {
    let callCount = 0;
    vi.mocked(execFileSync).mockImplementation(() => {
      callCount++;
      if (callCount === 1) return ''; // npx --version
      throw new Error('OAuth process exited');
    });
    vi.mocked(ask).mockResolvedValueOnce('');

    const { setupGmail } = await import('../../../src/cli/setup/gmail.js');
    await setupGmail();

    // Gmail is marked configured regardless, user can re-run if it failed
    const config = loadConfig(configPath);
    expect(config.mcp.gmail.configured).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @opentidy/backend exec vitest run tests/cli/setup/gmail.test.ts`
Expected: FAIL (module doesn't exist)

- [ ] **Step 3: Implement setupGmail**

Create `apps/backend/src/cli/setup/gmail.ts`:

```typescript
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { execFileSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { loadConfig, saveConfig, getConfigPath } from '../../config.js';
import { ask, info, success, warn } from './utils.js';

// Gmail MCP stores OAuth credentials here
const GMAIL_CREDENTIALS_DIR = join(homedir(), '.gmail-mcp');

export async function setupGmail(): Promise<void> {
  const configPath = getConfigPath();
  const config = loadConfig(configPath);

  console.log('');
  console.log('  ┌─────────────────────────────────────┐');
  console.log('  │  Gmail                                │');
  console.log('  └─────────────────────────────────────┘');
  console.log('');
  info('Gmail lets OpenTidy read emails, search, and create drafts.');
  info('Uses OAuth, no API keys needed.');
  console.log('');

  if (config.mcp.gmail.configured) {
    success('Gmail already configured.');
    const reconfigure = await ask('  Reconfigure? (y/N) ');
    if (reconfigure.toLowerCase() !== 'y') return;
  }

  // Check if npx is available
  try {
    execFileSync('npx', ['--version'], { encoding: 'utf-8', timeout: 10_000, stdio: 'pipe' });
  } catch {
    warn('npx not found. Install Node.js first.');
    return;
  }

  info('This will open a browser for Google OAuth consent.');
  info('Grant access to read/send emails for your account.');
  console.log('');
  await ask('  Press Enter to start Gmail OAuth...');

  try {
    execFileSync('npx', ['@gongrzhe/server-gmail-autoauth-mcp'], {
      stdio: 'inherit',
      timeout: 120_000,
    });
    console.log('');
    success('Gmail OAuth completed.');
  } catch {
    if (existsSync(GMAIL_CREDENTIALS_DIR)) {
      console.log('');
      success('Gmail credentials detected.');
    } else {
      console.log('');
      warn('Gmail OAuth may have failed.');
      info('You can retry later: opentidy setup gmail');
    }
  }

  config.mcp.gmail.enabled = true;
  config.mcp.gmail.configured = true;
  saveConfig(configPath, config);
  success('Gmail configured.');
}
```

- [ ] **Step 4: Run test**

Run: `pnpm --filter @opentidy/backend exec vitest run tests/cli/setup/gmail.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/cli/setup/gmail.ts apps/backend/tests/cli/setup/gmail.test.ts
git commit -m "feat(setup): add gmail module with OAuth flow"
```

---

## Task 4: Create setupCamoufox module

**Files:**
- Create: `apps/backend/src/cli/setup/camoufox.ts`
- Create: `apps/backend/tests/cli/setup/camoufox.test.ts`

- [ ] **Step 1: Write failing test**

Create `apps/backend/tests/cli/setup/camoufox.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { loadConfig } from '../../../src/config.js';

vi.mock('../../../src/cli/setup/utils.js', () => ({
  ask: vi.fn(),
  run: vi.fn(() => '1.0.0'),
  closeRl: vi.fn(),
  info: vi.fn(),
  success: vi.fn(),
  warn: vi.fn(),
}));

import { run, warn } from '../../../src/cli/setup/utils.js';

describe('setupCamoufox', () => {
  let configDir: string;
  let configPath: string;
  let claudeConfigDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    configDir = join(tmpdir(), `opentidy-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(configDir, { recursive: true });
    claudeConfigDir = join(configDir, 'claude-config');
    configPath = join(configDir, 'config.json');
    writeFileSync(configPath, JSON.stringify({
      version: 1,
      claudeConfig: { dir: claudeConfigDir },
    }));
    process.env.OPENTIDY_CONFIG_PATH = configPath;
  });

  afterEach(() => {
    delete process.env.OPENTIDY_CONFIG_PATH;
    rmSync(configDir, { recursive: true, force: true });
  });

  it('marks camoufox as configured and creates wrapper script', async () => {
    const { setupCamoufox } = await import('../../../src/cli/setup/camoufox.js');
    await setupCamoufox();

    const config = loadConfig(configPath);
    expect(config.mcp.camoufox.enabled).toBe(true);
    expect(config.mcp.camoufox.configured).toBe(true);

    // Verify wrapper script was created
    const wrapperPath = join(claudeConfigDir, 'scripts', 'camofox-mcp.sh');
    expect(existsSync(wrapperPath)).toBe(true);

    const content = readFileSync(wrapperPath, 'utf-8');
    expect(content).toContain('CAMOFOX_USER');
    expect(content).toContain('camofox-mcp@latest');
  });

  it('warns when npx is not available', async () => {
    vi.mocked(run).mockReturnValue('');

    const { setupCamoufox } = await import('../../../src/cli/setup/camoufox.js');
    await setupCamoufox();

    expect(vi.mocked(warn)).toHaveBeenCalledWith(expect.stringContaining('npx not found'));
    const config = loadConfig(configPath);
    expect(config.mcp.camoufox.enabled).toBe(false);
  });

  it('warns when claudeConfig.dir is not set', async () => {
    writeFileSync(configPath, JSON.stringify({ version: 1 }));

    const { setupCamoufox } = await import('../../../src/cli/setup/camoufox.js');
    await setupCamoufox();

    expect(vi.mocked(warn)).toHaveBeenCalledWith(expect.stringContaining('Claude Code setup first'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @opentidy/backend exec vitest run tests/cli/setup/camoufox.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement setupCamoufox**

Create `apps/backend/src/cli/setup/camoufox.ts`:

```typescript
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { writeFileSync, mkdirSync, chmodSync } from 'fs';
import { join } from 'path';
import { loadConfig, saveConfig, getConfigPath } from '../../config.js';
import { run, info, success, warn } from './utils.js';

const WRAPPER_SCRIPT = `#!/usr/bin/env bash
# Wrapper for camofox MCP: unique CAMOFOX_USER per Claude Code session
# so multiple agents get isolated BrowserContexts (separate tabs, cookies in memory)
# while sharing saved sessions on disk (~/.camofox/sessions/).
set -euo pipefail
export CAMOFOX_USER="opentidy-\${PPID}"
exec npx -y camofox-mcp@latest
`;

export async function setupCamoufox(): Promise<void> {
  const configPath = getConfigPath();
  const config = loadConfig(configPath);

  console.log('');
  console.log('  ┌─────────────────────────────────────┐');
  console.log('  │  Camoufox (Browser)                   │');
  console.log('  └─────────────────────────────────────┘');
  console.log('');
  info('Camoufox is an anti-detection browser for web navigation.');
  info('Each agent gets its own isolated browser context.');
  console.log('');

  // Check npx
  if (!run('npx', ['--version'])) {
    warn('npx not found. Install Node.js first.');
    return;
  }

  // Need claude config dir for the wrapper script
  const claudeConfigDir = config.claudeConfig.dir;
  if (!claudeConfigDir) {
    warn('Run Claude Code setup first (opentidy setup claude).');
    return;
  }

  const scriptsDir = join(claudeConfigDir, 'scripts');
  mkdirSync(scriptsDir, { recursive: true });

  const wrapperPath = join(scriptsDir, 'camofox-mcp.sh');
  writeFileSync(wrapperPath, WRAPPER_SCRIPT);
  chmodSync(wrapperPath, '755');
  success(`Wrapper script: ${wrapperPath}`);

  config.mcp.camoufox.enabled = true;
  config.mcp.camoufox.configured = true;
  saveConfig(configPath, config);
  success('Camoufox configured.');
}
```

- [ ] **Step 4: Run test**

Run: `pnpm --filter @opentidy/backend exec vitest run tests/cli/setup/camoufox.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/cli/setup/camoufox.ts apps/backend/tests/cli/setup/camoufox.test.ts
git commit -m "feat(setup): add camoufox module with wrapper script"
```

---

## Task 5: Create setupWhatsApp module

**Files:**
- Create: `apps/backend/src/cli/setup/whatsapp.ts`
- Create: `apps/backend/tests/cli/setup/whatsapp.test.ts`

- [ ] **Step 1: Write failing test**

Create `apps/backend/tests/cli/setup/whatsapp.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { loadConfig } from '../../../src/config.js';

vi.mock('../../../src/cli/setup/utils.js', () => ({
  ask: vi.fn(),
  run: vi.fn(),
  closeRl: vi.fn(),
  info: vi.fn(),
  success: vi.fn(),
  warn: vi.fn(),
}));

vi.mock('child_process', () => ({
  execFileSync: vi.fn(),
}));

import { ask, run, warn } from '../../../src/cli/setup/utils.js';
import { execFileSync } from 'child_process';

describe('setupWhatsApp', () => {
  let configDir: string;
  let configPath: string;

  beforeEach(() => {
    vi.clearAllMocks();
    configDir = join(tmpdir(), `opentidy-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(configDir, { recursive: true });
    configPath = join(configDir, 'config.json');
    writeFileSync(configPath, JSON.stringify({ version: 1 }));
    process.env.OPENTIDY_CONFIG_PATH = configPath;
  });

  afterEach(() => {
    delete process.env.OPENTIDY_CONFIG_PATH;
    rmSync(configDir, { recursive: true, force: true });
  });

  it('marks whatsapp as configured when wacli is authenticated', async () => {
    vi.mocked(run).mockImplementation((cmd: string) => {
      if (cmd === 'wacli') return '1.0.0';
      if (cmd === 'which') return '/usr/local/bin/wacli';
      return '';
    });
    vi.mocked(execFileSync).mockReturnValue('{"authenticated": true}');

    const { setupWhatsApp } = await import('../../../src/cli/setup/whatsapp.js');
    await setupWhatsApp();

    const config = loadConfig(configPath);
    expect(config.mcp.whatsapp.enabled).toBe(true);
    expect(config.mcp.whatsapp.configured).toBe(true);
    expect(config.mcp.whatsapp.wacliPath).toBe('/usr/local/bin/wacli');
  });

  it('skips when wacli is not installed and user confirms skip', async () => {
    vi.mocked(run).mockReturnValue('');
    vi.mocked(ask).mockResolvedValueOnce(''); // Skip? -> Enter (yes)

    const { setupWhatsApp } = await import('../../../src/cli/setup/whatsapp.js');
    await setupWhatsApp();

    expect(vi.mocked(warn)).toHaveBeenCalledWith(expect.stringContaining('wacli not found'));
    const config = loadConfig(configPath);
    expect(config.mcp.whatsapp.enabled).toBe(false);
  });

  it('triggers QR auth when wacli is installed but not authenticated', async () => {
    vi.mocked(run).mockImplementation((cmd: string) => {
      if (cmd === 'wacli') return '1.0.0';
      if (cmd === 'which') return '/usr/local/bin/wacli';
      return '';
    });
    vi.mocked(execFileSync).mockImplementation((_cmd, args) => {
      const argsArr = args as string[];
      if (argsArr?.[0] === 'doctor') return '{"authenticated": false}';
      return '';
    });
    vi.mocked(ask).mockResolvedValueOnce(''); // Press Enter to start QR

    const { setupWhatsApp } = await import('../../../src/cli/setup/whatsapp.js');
    await setupWhatsApp();

    expect(vi.mocked(execFileSync)).toHaveBeenCalledWith(
      'wacli', ['auth'], expect.objectContaining({ stdio: 'inherit' }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @opentidy/backend exec vitest run tests/cli/setup/whatsapp.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement setupWhatsApp**

Create `apps/backend/src/cli/setup/whatsapp.ts`:

```typescript
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { execFileSync } from 'child_process';
import { loadConfig, saveConfig, getConfigPath } from '../../config.js';
import { ask, run, info, success, warn } from './utils.js';

export async function setupWhatsApp(): Promise<void> {
  const configPath = getConfigPath();
  const config = loadConfig(configPath);

  console.log('');
  console.log('  ┌─────────────────────────────────────┐');
  console.log('  │  WhatsApp                             │');
  console.log('  └─────────────────────────────────────┘');
  console.log('');
  info('WhatsApp lets OpenTidy read and send messages.');
  info('Requires wacli (WhatsApp CLI) to be installed.');
  console.log('');

  if (config.mcp.whatsapp.configured) {
    success('WhatsApp already configured.');
    const reconfigure = await ask('  Reconfigure? (y/N) ');
    if (reconfigure.toLowerCase() !== 'y') return;
  }

  // Check wacli
  const wacliVersion = run('wacli', ['--version']);
  if (!wacliVersion) {
    warn('wacli not found.');
    info('Install: go install github.com/nickolasgamba/wacli@latest');
    info('Or: brew install wacli (if available)');
    console.log('');
    const skip = await ask('  Skip WhatsApp setup? (Y/n) ');
    if (skip.toLowerCase() !== 'n') return;
    if (!run('wacli', ['--version'])) {
      warn('wacli still not found. Skipping.');
      return;
    }
  }

  // Check authentication
  let authenticated = false;
  try {
    const doctorOutput = execFileSync('wacli', ['doctor', '--json'], {
      encoding: 'utf-8',
      timeout: 10_000,
      stdio: 'pipe',
    });
    const status = JSON.parse(doctorOutput);
    authenticated = !!status.authenticated;
  } catch {
    // doctor failed, need auth
  }

  if (!authenticated) {
    console.log('');
    info('WhatsApp needs to be authenticated via QR code.');
    info('This will display a QR code, scan it with your phone.');
    info('Open WhatsApp > Settings > Linked Devices > Link a Device');
    console.log('');
    await ask('  Press Enter to start QR code auth...');

    try {
      execFileSync('wacli', ['auth'], { stdio: 'inherit', timeout: 120_000 });
      console.log('');
      success('WhatsApp authenticated.');
      authenticated = true;
    } catch {
      console.log('');
      warn('Authentication failed or timed out.');
      info('Run manually: wacli auth');
    }
  } else {
    success('WhatsApp already authenticated.');
  }

  if (authenticated) {
    config.mcp.whatsapp.enabled = true;
    config.mcp.whatsapp.configured = true;
    config.mcp.whatsapp.wacliPath = run('which', ['wacli']) || 'wacli';
    saveConfig(configPath, config);
    success('WhatsApp configured.');
  }
}
```

- [ ] **Step 4: Run test**

Run: `pnpm --filter @opentidy/backend exec vitest run tests/cli/setup/whatsapp.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/cli/setup/whatsapp.ts apps/backend/tests/cli/setup/whatsapp.test.ts
git commit -m "feat(setup): add whatsapp module with wacli check and auth"
```

---

## Task 6: Refactor setupClaude to generate settings.json dynamically

This is the core change. Instead of copying a static `settings.json`, we generate it with the correct `mcpServers` based on what's been configured. Also generates a personalized CLAUDE.md from template.

**Files:**
- Modify: `apps/backend/src/cli/setup/claude.ts`
- Create: `apps/backend/tests/cli/setup/claude.test.ts`

- [ ] **Step 1: Write failing tests for generateClaudeSettings and generateClaudeMd**

Create `apps/backend/tests/cli/setup/claude.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { loadConfig } from '../../../src/config.js';

// Helper: build a full config with defaults merged
function buildTestConfig(overrides: Record<string, unknown> = {}) {
  const dir = join(tmpdir(), `opentidy-cfg-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, 'config.json');
  writeFileSync(path, JSON.stringify({ version: 1, ...overrides }));
  const config = loadConfig(path);
  rmSync(dir, { recursive: true, force: true });
  return config;
}

describe('generateClaudeSettings', () => {
  let generateClaudeSettings: typeof import('../../../src/cli/setup/claude.js').generateClaudeSettings;

  beforeEach(async () => {
    const mod = await import('../../../src/cli/setup/claude.js');
    generateClaudeSettings = mod.generateClaudeSettings;
  });

  it('generates settings with no MCP servers when none configured', () => {
    const config = buildTestConfig({ claudeConfig: { dir: '/tmp/test' } });
    const settings = generateClaudeSettings(config);
    expect(settings.permissions.allow).toContain('Read');
    expect(settings.permissions.allow).toContain('Bash(osascript:*)');
    expect(settings.mcpServers).toEqual({});
  });

  it('includes gmail MCP when enabled', () => {
    const config = buildTestConfig({
      claudeConfig: { dir: '/tmp/test' },
      mcp: {
        gmail: { enabled: true, configured: true },
        camoufox: { enabled: false, configured: false },
        whatsapp: { enabled: false, configured: false, wacliPath: '', mcpServerPath: '' },
      },
    });
    const settings = generateClaudeSettings(config);
    expect(settings.mcpServers.gmail).toBeDefined();
    expect(settings.mcpServers.gmail.command).toBe('npx');
    expect(settings.mcpServers.gmail.args).toContain('@gongrzhe/server-gmail-autoauth-mcp');
    expect(settings.permissions.allow).toContain('mcp__gmail__*');
  });

  it('includes camoufox MCP when enabled', () => {
    const config = buildTestConfig({
      claudeConfig: { dir: '/tmp/test-claude' },
      mcp: {
        gmail: { enabled: false, configured: false },
        camoufox: { enabled: true, configured: true },
        whatsapp: { enabled: false, configured: false, wacliPath: '', mcpServerPath: '' },
      },
    });
    const settings = generateClaudeSettings(config);
    expect(settings.mcpServers.camofox).toBeDefined();
    expect(settings.mcpServers.camofox.command).toBe('bash');
    expect(settings.mcpServers.camofox.args[0]).toContain('camofox-mcp.sh');
    expect(settings.permissions.allow).toContain('mcp__camofox__*');
  });

  it('adds wacli Bash permission when whatsapp has no mcpServerPath', () => {
    const config = buildTestConfig({
      claudeConfig: { dir: '/tmp/test' },
      mcp: {
        gmail: { enabled: false, configured: false },
        camoufox: { enabled: false, configured: false },
        whatsapp: { enabled: true, configured: true, wacliPath: '/usr/local/bin/wacli', mcpServerPath: '' },
      },
    });
    const settings = generateClaudeSettings(config);
    expect(settings.mcpServers.whatsapp).toBeUndefined();
    expect(settings.permissions.allow).toContain('Bash(wacli:*)');
  });

  it('includes whatsapp MCP when mcpServerPath is set', () => {
    const config = buildTestConfig({
      claudeConfig: { dir: '/tmp/test' },
      mcp: {
        gmail: { enabled: false, configured: false },
        camoufox: { enabled: false, configured: false },
        whatsapp: { enabled: true, configured: true, wacliPath: '/usr/local/bin/wacli', mcpServerPath: '/opt/mcp-wacli' },
      },
    });
    const settings = generateClaudeSettings(config);
    expect(settings.mcpServers.whatsapp).toBeDefined();
    expect(settings.mcpServers.whatsapp.cwd).toBe('/opt/mcp-wacli');
    expect(settings.permissions.allow).toContain('mcp__whatsapp__*');
  });

  it('includes all MCPs when all configured', () => {
    const config = buildTestConfig({
      claudeConfig: { dir: '/tmp/test' },
      mcp: {
        gmail: { enabled: true, configured: true },
        camoufox: { enabled: true, configured: true },
        whatsapp: { enabled: true, configured: true, wacliPath: '/usr/local/bin/wacli', mcpServerPath: '/opt/mcp-wacli' },
      },
    });
    const settings = generateClaudeSettings(config);
    expect(Object.keys(settings.mcpServers).sort()).toEqual(['camofox', 'gmail', 'whatsapp']);
  });
});

describe('generateClaudeMd', () => {
  let generateClaudeMd: typeof import('../../../src/cli/setup/claude.js').generateClaudeMd;
  let templateDir: string;
  let templatePath: string;

  beforeEach(async () => {
    const mod = await import('../../../src/cli/setup/claude.js');
    generateClaudeMd = mod.generateClaudeMd;

    templateDir = join(tmpdir(), `opentidy-tmpl-${Date.now()}`);
    mkdirSync(templateDir, { recursive: true });
    templatePath = join(templateDir, 'CLAUDE.md');
    writeFileSync(templatePath, [
      '# OpenTidy. Personal Assistant',
      '## User Info',
      '- Email: (configured during setup)',
      '- Full name: (configured during setup)',
      '- Company: (configured during setup)',
      '## Identity',
      "- Communicate in the user's preferred language",
    ].join('\n'));
  });

  afterEach(() => {
    rmSync(templateDir, { recursive: true, force: true });
  });

  it('replaces user info placeholders', () => {
    const config = buildTestConfig({
      userInfo: { name: 'Alice', email: 'alice@example.com', company: 'Acme' },
      language: 'en',
    });
    const result = generateClaudeMd(templatePath, config);
    expect(result).toContain('- Email: alice@example.com');
    expect(result).toContain('- Full name: Alice');
    expect(result).toContain('- Company: Acme');
  });

  it('sets French language', () => {
    const config = buildTestConfig({ language: 'fr' });
    const result = generateClaudeMd(templatePath, config);
    expect(result).toContain('Communicate in French');
  });

  it('handles missing user info gracefully', () => {
    const config = buildTestConfig({});
    const result = generateClaudeMd(templatePath, config);
    expect(result).toContain('- Email: (not configured)');
    expect(result).toContain('- Full name: (not configured)');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @opentidy/backend exec vitest run tests/cli/setup/claude.test.ts`
Expected: FAIL (`generateClaudeSettings` and `generateClaudeMd` not exported)

- [ ] **Step 3: Implement generateClaudeSettings, generateClaudeMd, and refactor setupClaude**

Rewrite `apps/backend/src/cli/setup/claude.ts`:

```typescript
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { execFileSync } from 'child_process';
import type { OpenTidyConfig } from '@opentidy/shared';
import { loadConfig, saveConfig, getConfigPath } from '../../config.js';
import { ask, info, success, warn } from './utils.js';

// Base permissions, always present
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
}

interface ClaudeSettings {
  permissions: { allow: string[]; deny: string[] };
  mcpServers: Record<string, McpServerDef>;
}

export function generateClaudeSettings(config: OpenTidyConfig): ClaudeSettings {
  const allow = [...BASE_PERMISSIONS];
  const mcpServers: Record<string, McpServerDef> = {};

  // Gmail
  if (config.mcp.gmail.enabled) {
    allow.push('mcp__gmail__*');
    mcpServers.gmail = {
      type: 'stdio',
      command: 'npx',
      args: ['@gongrzhe/server-gmail-autoauth-mcp'],
    };
  }

  // Camoufox
  if (config.mcp.camoufox.enabled) {
    allow.push('mcp__camofox__*');
    const wrapperPath = join(config.claudeConfig.dir, 'scripts', 'camofox-mcp.sh');
    mcpServers.camofox = {
      type: 'stdio',
      command: 'bash',
      args: [wrapperPath],
    };
  }

  // WhatsApp
  if (config.mcp.whatsapp.enabled) {
    if (config.mcp.whatsapp.mcpServerPath) {
      allow.push('mcp__whatsapp__*');
      mcpServers.whatsapp = {
        type: 'stdio',
        command: 'uv',
        args: ['run', 'server.py'],
        cwd: config.mcp.whatsapp.mcpServerPath,
      };
    } else {
      allow.push('Bash(wacli:*)');
    }
  }

  return {
    permissions: { allow, deny: [] },
    mcpServers,
  };
}

export function generateClaudeMd(templatePath: string, config: OpenTidyConfig): string {
  let content = readFileSync(templatePath, 'utf-8');

  content = content.replace(
    '- Email: (configured during setup)',
    `- Email: ${config.userInfo.email || '(not configured)'}`,
  );
  content = content.replace(
    '- Full name: (configured during setup)',
    `- Full name: ${config.userInfo.name || '(not configured)'}`,
  );
  content = content.replace(
    '- Company: (configured during setup)',
    `- Company: ${config.userInfo.company || '(not configured)'}`,
  );

  if (config.language) {
    const langName = config.language === 'fr' ? 'French' : config.language;
    content = content.replace(
      "Communicate in the user's preferred language",
      `Communicate in ${langName}`,
    );
  }

  return content;
}

export async function setupClaude(): Promise<void> {
  const configPath = getConfigPath();
  const config = loadConfig(configPath);

  console.log('');
  console.log('  ┌─────────────────────────────────────┐');
  console.log('  │  Claude Code                         │');
  console.log('  └─────────────────────────────────────┘');
  console.log('');
  info('OpenTidy runs Claude Code sessions autonomously.');
  info('It uses an isolated config (separate from yours).');
  console.log('');

  const templateDir = resolve(import.meta.dirname, '../../../config/claude');
  const claudeConfigDir = resolve(dirname(configPath), 'claude-config');

  // Generate settings.json from config
  const settings = generateClaudeSettings(config);
  mkdirSync(claudeConfigDir, { recursive: true });
  writeFileSync(join(claudeConfigDir, 'settings.json'), JSON.stringify(settings, null, 2) + '\n');
  success('Generated settings.json with MCP servers.');

  // Generate personalized CLAUDE.md from template
  const templateMd = join(templateDir, 'CLAUDE.md');
  if (existsSync(templateMd)) {
    const personalizedMd = generateClaudeMd(templateMd, config);
    writeFileSync(join(claudeConfigDir, 'CLAUDE.md'), personalizedMd);
    success('Generated personalized CLAUDE.md.');
  }

  // settings.local.json, user overrides, never overwritten
  const localSettings = join(claudeConfigDir, 'settings.local.json');
  if (!existsSync(localSettings)) {
    writeFileSync(localSettings, '{}\n');
  }

  config.claudeConfig.dir = claudeConfigDir;
  saveConfig(configPath, config);

  // MCP summary
  const mcpNames = Object.keys(settings.mcpServers);
  if (mcpNames.length > 0) {
    info(`MCP servers: ${mcpNames.join(', ')}`);
  } else {
    warn('No MCP servers configured. Run setup for Gmail/Camoufox/WhatsApp first.');
  }

  // Auth
  console.log('');
  info('Claude Code needs to be authenticated (OAuth).');
  info('This opens a browser, log in with your Claude account.');
  console.log('');
  await ask('  Press Enter to open the browser...');

  try {
    execFileSync('claude', ['auth', 'login'], {
      stdio: 'inherit',
      timeout: 120_000,
      env: { ...process.env, CLAUDE_CONFIG_DIR: claudeConfigDir },
    });
    console.log('');
    success('Claude Code authenticated.');
  } catch {
    console.log('');
    warn('Authentication failed or skipped.');
    info(`Run manually: CLAUDE_CONFIG_DIR="${claudeConfigDir}" claude auth login`);
  }
}
```

- [ ] **Step 4: Run test**

Run: `pnpm --filter @opentidy/backend exec vitest run tests/cli/setup/claude.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/cli/setup/claude.ts apps/backend/tests/cli/setup/claude.test.ts
git commit -m "feat(setup): generate claude settings.json dynamically with MCP servers"
```

---

## Task 7: Wire new modules into setup menu

**Files:**
- Modify: `apps/backend/src/cli/setup/index.ts`
- Modify: `apps/backend/src/cli/setup.ts:1-19,39-47`
- Modify: `apps/backend/src/cli/setup/status.ts`

- [ ] **Step 1: Update barrel exports in index.ts**

Replace contents of `apps/backend/src/cli/setup/index.ts` with:

```typescript
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

export { setupUserInfo } from './user-info.js';
export { setupTelegram } from './telegram.js';
export { setupAuth } from './auth.js';
export { setupGmail } from './gmail.js';
export { setupCamoufox } from './camoufox.js';
export { setupWhatsApp } from './whatsapp.js';
export { setupClaude, generateClaudeSettings, generateClaudeMd } from './claude.js';
export { setupTunnel } from './tunnel.js';
export { setupPermissions } from './permissions.js';
export { getModuleStatuses } from './status.js';
export type { ModuleStatus } from './status.js';
export { ask, closeRl } from './utils.js';
```

Note: `copyClaudeConfigTemplate` is no longer exported. Remove the re-export in `setup.ts` line 19 too.

- [ ] **Step 2: Update MODULES map and MODULE_ORDER in setup.ts**

Update imports:

```typescript
import {
  setupUserInfo,
  setupTelegram,
  setupAuth,
  setupGmail,
  setupCamoufox,
  setupWhatsApp,
  setupClaude,
  setupTunnel,
  setupPermissions,
  getModuleStatuses,
  ask,
  closeRl,
} from './setup/index.js';
```

Remove `export { copyClaudeConfigTemplate } from './setup/index.js';` if present.

Update maps:

```typescript
const MODULES: Record<string, () => Promise<void>> = {
  'user-info': setupUserInfo,
  telegram: setupTelegram,
  auth: setupAuth,
  gmail: setupGmail,
  camoufox: setupCamoufox,
  whatsapp: setupWhatsApp,
  claude: setupClaude,
  cloudflare: setupTunnel,
  permissions: setupPermissions,
};

const MODULE_ORDER = [
  'user-info', 'telegram', 'auth',
  'gmail', 'camoufox', 'whatsapp',
  'claude', 'cloudflare', 'permissions',
];
```

Key: `claude` is AFTER MCP modules so `generateClaudeSettings()` picks up their config.

- [ ] **Step 3: Rewrite getModuleStatuses in status.ts to match MODULE_ORDER**

Replace the full return array in `getModuleStatuses()`:

```typescript
export function getModuleStatuses(): ModuleStatus[] {
  const configPath = getConfigPath();
  const config = existsSync(configPath) ? loadConfig(configPath) : null;

  return [
    {
      name: 'User Info',
      key: 'user-info',
      done: !!(config?.userInfo?.name && config?.userInfo?.email),
      detail: config?.userInfo?.name
        ? `${config.userInfo.name} <${config.userInfo.email}>`
        : 'Not configured',
    },
    {
      name: 'Telegram',
      key: 'telegram',
      done: !!(config?.telegram.botToken && config?.telegram.chatId),
      detail: config?.telegram.botToken
        ? `Bot: ...${config.telegram.botToken.slice(-8)}`
        : 'Not configured',
    },
    {
      name: 'API Auth',
      key: 'auth',
      done: !!(config?.auth.bearerToken),
      detail: config?.auth.bearerToken
        ? `Token: ...${config.auth.bearerToken.slice(-8)}`
        : 'Not configured',
    },
    {
      name: 'Gmail',
      key: 'gmail',
      done: !!(config?.mcp?.gmail?.configured),
      detail: config?.mcp?.gmail?.configured
        ? 'OAuth configured'
        : 'Not configured',
    },
    {
      name: 'Camoufox',
      key: 'camoufox',
      done: !!(config?.mcp?.camoufox?.configured),
      detail: config?.mcp?.camoufox?.configured
        ? 'Wrapper script ready'
        : 'Not configured',
    },
    {
      name: 'WhatsApp',
      key: 'whatsapp',
      done: !!(config?.mcp?.whatsapp?.configured),
      detail: config?.mcp?.whatsapp?.configured
        ? 'wacli authenticated'
        : 'Not configured (optional)',
    },
    {
      name: 'Claude Code',
      key: 'claude',
      done: !!(config?.claudeConfig.dir && existsSync(join(config.claudeConfig.dir, 'settings.json'))),
      detail: config?.claudeConfig.dir
        ? config.claudeConfig.dir
        : 'Not configured',
    },
    {
      name: 'Cloudflare Tunnel',
      key: 'cloudflare',
      done: existsSync(`${process.env.HOME}/.cloudflared/config.yml`),
      detail: existsSync(`${process.env.HOME}/.cloudflared/config.yml`)
        ? 'Config exists'
        : 'Not configured',
    },
    {
      name: 'macOS Permissions',
      key: 'permissions',
      ...checkPermissions(),
    },
  ];
}
```

- [ ] **Step 4: Run full test suite**

Run: `pnpm --filter @opentidy/backend test`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/cli/setup/index.ts apps/backend/src/cli/setup.ts apps/backend/src/cli/setup/status.ts
git commit -m "feat(setup): wire gmail, camoufox, whatsapp, user-info into setup menu"
```

---

## Task 8: Update existing tests for config shape changes

**Files:**
- Modify: `apps/backend/tests/config.test.ts`
- Possibly: other test files that create partial mock configs

- [ ] **Step 1: Check existing tests still pass**

Run: `pnpm --filter @opentidy/shared build && pnpm --filter @opentidy/backend test`

If they fail, `deepMerge` in config.ts should handle the new fields (existing configs without `userInfo`/`mcp` get defaults merged in). If tests explicitly check config shape, update them.

- [ ] **Step 2: Fix any broken tests**

Common fix: tests that build mock `OpenTidyConfig` objects without `userInfo`/`mcp` will get TypeScript errors. Either add the new sections or use `loadConfig('/nonexistent')` to get proper defaults.

- [ ] **Step 3: Run full test suite again**

Run: `pnpm --filter @opentidy/backend test`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add -u
git commit -m "test: update existing tests for new config shape"
```

---

## Task 9: Manual integration test

Not automatable; verify the full flow works interactively.

- [ ] **Step 1: Build**

Run: `pnpm build`

- [ ] **Step 2: Run setup interactively**

Run: `node apps/backend/dist/cli.js setup`

Verify:
- Menu shows all 9 modules with correct status icons
- User Info prompts for name/email/company/language
- Gmail attempts OAuth (can cancel)
- Camoufox creates wrapper script in claude-config/scripts/
- WhatsApp checks for wacli
- Claude generates settings.json with correct mcpServers
- Arrow key navigation works, separator line at correct position
- "Setup all missing" runs modules in correct order (MCP before claude)

- [ ] **Step 3: Verify generated files**

Check `~/.config/opentidy/claude-config/settings.json`:
- Has `permissions.allow` with correct entries
- Has `mcpServers` section with configured services
- No hardcoded dev machine paths

Check `~/.config/opentidy/claude-config/CLAUDE.md`:
- User info placeholders replaced with real values
- Language preference set correctly

- [ ] **Step 4: Verify MCP interaction with --strict-mcp-config**

Run a test to verify MCP servers from settings.json are picked up:
```bash
CLAUDE_CONFIG_DIR=~/.config/opentidy/claude-config claude -p --strict-mcp-config --mcp-config '{}' "List your available MCP servers"
```
Expected: Claude sees gmail, camofox (and whatsapp if configured) from settings.json.

---

## Summary of changes

| Area | Before | After |
|------|--------|-------|
| Config type | No `userInfo`, no `mcp` | Full `UserInfo` + `McpConfig` sections |
| Setup modules | 5 (telegram, auth, claude, cloudflare, perms) | 9 (+user-info, gmail, camoufox, whatsapp) |
| Agent settings.json | Static copy, no MCP servers | Generated dynamically with configured MCPs |
| Agent CLAUDE.md | Placeholder user info | Personalized at generation time |
| Module order | claude before MCPs | MCPs before claude (so it reads their config) |
| Language | Defaulted to 'en', never asked | Prompted in user-info module |
