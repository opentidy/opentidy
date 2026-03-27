// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { execFileSync } from 'child_process';
import { existsSync } from 'fs';
import { loadConfig, saveConfig, getConfigPath } from '../shared/config.js';
import { defaultCheckPermission } from '../features/setup/permissions.js';
import { getVersion } from '../cli.js';

const REQUIRED_NODE_MAJOR = 22;

interface CheckResult {
  ok: boolean;
  name: string;
  detail?: string;
  warn?: boolean;
}

export function checkNodeVersion(): CheckResult {
  try {
    const version = execFileSync('node', ['--version'], {
      encoding: 'utf-8',
      timeout: 5000,
    }).trim();
    const major = parseInt(version.replace(/^v/, '').split('.')[0], 10);
    if (major !== REQUIRED_NODE_MAJOR) {
      return {
        ok: true,
        warn: true,
        name: 'node',
        detail: `${version}, expected ${REQUIRED_NODE_MAJOR}.x, native addons may not work`,
      };
    }
    return { ok: true, name: 'node', detail: version };
  } catch {
    return { ok: false, name: 'node', detail: 'not found in PATH' };
  }
}

export function checkDependency(bin: string): CheckResult {
  // tmux uses -V instead of --version
  const versionFlag = bin === 'tmux' ? '-V' : '--version';
  try {
    const version = execFileSync(bin, [versionFlag], {
      encoding: 'utf-8',
      timeout: 5000,
    }).trim().split('\n')[0];
    return { ok: true, name: bin, detail: version };
  } catch {
    return { ok: false, name: bin, detail: 'not found in PATH' };
  }
}

export function checkConfig(configPath: string): CheckResult {
  if (!existsSync(configPath)) {
    return { ok: false, name: 'config', detail: `${configPath} not found, run opentidy setup` };
  }
  const config = loadConfig(configPath);
  const telegramToken = (config.modules?.telegram?.config?.botToken as string) || '';
  if (!telegramToken) {
    return { ok: false, name: 'config', detail: 'telegram.botToken is empty, configure Telegram module' };
  }
  return { ok: true, name: 'config', detail: configPath };
}

export function checkClaudeConfig(claudeConfigDir: string | undefined): CheckResult {
  if (!claudeConfigDir || !existsSync(claudeConfigDir)) {
    return { ok: false, name: 'claude-config', detail: `${claudeConfigDir || '(not set)'} not found, run opentidy setup` };
  }
  if (!existsSync(`${claudeConfigDir}/settings.json`)) {
    return { ok: false, name: 'claude-config', detail: 'settings.json missing' };
  }
  return { ok: true, name: 'claude-config', detail: claudeConfigDir };
}

export function runCheckPermissions(): void {
  console.log('\n  Checking system permissions...\n');

  const fda = defaultCheckPermission('full-disk-access');
  const acc = defaultCheckPermission('accessibility');

  console.log(`  ${fda ? 'OK' : '!!'}  Full Disk Access: ${fda ? 'granted' : 'not granted'}`);
  console.log(`  ${acc ? 'OK' : '!!'}  Accessibility: ${acc ? 'granted' : 'not granted'}`);

  // Save to config so the web UI (running as a service) can read the result
  const configPath = getConfigPath();
  const config = loadConfig(configPath);
  config.systemPermissions = {
    fullDiskAccess: fda,
    accessibility: acc,
    checkedAt: new Date().toISOString(),
  };
  saveConfig(configPath, config);

  console.log(`\n  Saved to ${configPath}`);
  if (!fda || !acc) {
    console.log('  Grant missing permissions in System Settings → Privacy & Security');
    console.log('  Then re-run: opentidy doctor --check-permissions\n');
  } else {
    console.log('  All permissions granted.\n');
  }
}

export async function runDoctor(args: string[] = []): Promise<void> {
  if (args.includes('--check-permissions')) {
    runCheckPermissions();
    return;
  }
  console.log(`\n  OpenTidy Doctor (v${getVersion()})\n`);
  const results: CheckResult[] = [];

  // Node version check (special, validates major version)
  results.push(checkNodeVersion());

  // Other dependencies
  for (const bin of ['claude', 'tmux', 'ttyd', 'python3']) {
    results.push(checkDependency(bin));
  }

  // Config
  const configPath = getConfigPath();
  results.push(checkConfig(configPath));

  // Claude Code config
  const config = loadConfig(configPath);
  results.push(checkClaudeConfig(config.claudeConfig?.dir));

  // Health check (if server running)
  try {
    const port = config.server.port || 5175;
    execFileSync('curl', ['-sf', `http://localhost:${port}/api/health`], { encoding: 'utf-8', timeout: 5000 });
    results.push({ ok: true, name: 'server', detail: `running on port ${port}` });
  } catch {
    results.push({ ok: false, name: 'server', detail: 'not responding' });
  }

  // Print results
  let hasErrors = false;
  for (const r of results) {
    const icon = r.warn ? '  ⚠ ' : r.ok ? '  OK' : '  !!';
    console.log(`${icon}  ${r.name}: ${r.detail || ''}`);
    if (!r.ok) hasErrors = true;
  }

  console.log(hasErrors ? '\n  Some checks failed.\n' : '\n  All checks passed.\n');
  process.exit(hasErrors ? 1 : 0);
}