// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { execFileSync } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { loadConfig, saveConfig, getConfigPath, DEFAULT_PORT } from '../shared/config.js';
import {
  setupUserInfo,
  setupTelegram,
  setupAuth,
  setupCamoufox,
  setupWhatsApp,
  setupClaude,
  setupTunnel,
  setupPermissions,
  setupGitHub,
  getModuleStatuses,
  ask,
  closeRl,
} from './setup/index.js';
import { createRawModeSelector } from './interactive-select.js';

export function createConfigFile(configPath: string, opts: {
  telegramBotToken: string;
  telegramChatId: string;
  bearerToken: string;
  port: number;
}): void {
  const config = loadConfig(configPath);
  // Store Telegram config in modules
  if (!config.modules.telegram) {
    config.modules.telegram = { enabled: false, source: 'curated' };
  }
  config.modules.telegram.config = {
    ...(config.modules.telegram.config ?? {}),
    botToken: opts.telegramBotToken,
    chatId: opts.telegramChatId,
  };
  if (opts.telegramBotToken) config.modules.telegram.enabled = true;
  config.auth.bearerToken = opts.bearerToken;
  config.server.port = opts.port;
  saveConfig(configPath, config);
}

// ═══════════════════════════════════════
// Module map
// ═══════════════════════════════════════

const MODULES: Record<string, () => Promise<void>> = {
  'user-info': setupUserInfo,
  telegram: setupTelegram,
  auth: setupAuth,
  camoufox: setupCamoufox,
  whatsapp: setupWhatsApp,
  claude: setupClaude,
  cloudflare: setupTunnel,
  github: setupGitHub,
  permissions: setupPermissions,
};

const MODULE_ORDER = [
  'user-info', 'telegram', 'auth',
  'camoufox', 'whatsapp',
  'claude', 'cloudflare', 'github', 'permissions',
];

// ═══════════════════════════════════════
// Interactive menu (arrow keys + enter)
// ═══════════════════════════════════════

interface MenuItem {
  label: string;
  key: string;
  icon: string;
  detail: string;
}

async function showInteractiveMenu(): Promise<string> {
  const statuses = getModuleStatuses();
  const missing = statuses.filter(s => !s.done);

  const items: MenuItem[] = statuses.map(s => ({
    label: s.name,
    key: s.key,
    icon: s.done ? '✓' : '○',
    detail: s.detail,
  }));

  if (missing.length > 0) {
    items.push({ label: `Setup all missing (${missing.length})`, key: '_missing', icon: '▶', detail: '' });
  }
  items.push({ label: 'Setup everything', key: '_all', icon: '▶', detail: '' });
  items.push({ label: 'Exit', key: '_exit', icon: ' ', detail: '' });

  const initialCursor = missing.length > 0 ? items.length - 3 : items.length - 2;

  const render = (cursor: number) => {
    process.stdout.write('\x1B[2J\x1B[H');
    console.log('');
    console.log('  ╔═══════════════════════════════════════╗');
    console.log('  ║          OpenTidy Setup                  ║');
    console.log('  ╚═══════════════════════════════════════╝');
    console.log('');
    console.log('  Use ↑↓ arrows to navigate, Enter to select.');
    console.log('');

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const pointer = i === cursor ? '❯' : ' ';

      if (i === statuses.length && i > 0) {
        console.log('  ─────────────────────────────────────────');
      }

      if (item.detail) {
        console.log(`  ${pointer} ${item.icon}  ${item.label.padEnd(22)} ${item.detail}`);
      } else {
        console.log(`  ${pointer} ${item.icon}  ${item.label}`);
      }
    }
    console.log('');
  };

  const { cursor, action } = await createRawModeSelector({
    totalItems: items.length,
    initialCursor,
    render,
  });

  if (action === 'cancel') return '_exit';
  return items[cursor].key;
}

// ═══════════════════════════════════════
// Main entry point
// ═══════════════════════════════════════

export async function runSetup(moduleArg?: string): Promise<void> {
  // If the server is running, redirect to the browser setup UI
  const config = loadConfig();
  const port = config.server?.port || DEFAULT_PORT;
  try {
    execFileSync('curl', ['-sf', `http://localhost:${port}/api/health`], { timeout: 3000 });
    // Server is running, redirect to browser
    const section = moduleArg ? `?section=${moduleArg}` : '';
    const url = `http://localhost:${port}/setup${section}`;
    console.log(`Opening setup in browser: ${url}`);
    try {
      execFileSync('open', [url], { timeout: 5000, stdio: 'pipe' });
    } catch {
      console.log(`  Open this URL manually: ${url}`);
    }
    return;
  } catch {
    // Server not running, fall through to CLI setup
  }

  // Ensure base config file exists
  const configPath = getConfigPath();
  if (!existsSync(configPath)) {
    mkdirSync(dirname(configPath), { recursive: true });
    saveConfig(configPath, loadConfig(configPath));
  }

  // Direct module from CLI arg: opentidy setup telegram
  if (moduleArg && moduleArg !== '--all') {
    const fn = MODULES[moduleArg];
    if (!fn) {
      console.log(`  Unknown module: ${moduleArg}`);
      console.log(`  Available: ${MODULE_ORDER.join(', ')}`);
      return;
    }
    await fn();
    closeRl();
    return;
  }

  // --all flag: run everything sequentially
  if (moduleArg === '--all') {
    for (const key of MODULE_ORDER) {
      await MODULES[key]();
    }
    printSummary(configPath);
    closeRl();
    return;
  }

  // Interactive menu loop
  while (true) {
    const choice = await showInteractiveMenu();

    if (choice === '_exit') break;

    if (choice === '_missing') {
      const statuses = getModuleStatuses();
      const missing = statuses.filter(s => !s.done);
      for (const mod of missing) {
        await MODULES[mod.key]();
      }
      printSummary(configPath);
      await ask('\n  Press Enter to return to menu...');
      continue;
    }

    if (choice === '_all') {
      for (const key of MODULE_ORDER) {
        await MODULES[key]();
      }
      printSummary(configPath);
      await ask('\n  Press Enter to return to menu...');
      continue;
    }

    // Individual module
    const fn = MODULES[choice];
    if (fn) {
      await fn();
      await ask('\n  Press Enter to return to menu...');
    }
  }

  closeRl();
}

function printSummary(configPath: string): void {
  console.log('');
  console.log('  ╔═══════════════════════════════════════╗');
  console.log('  ║          Setup Complete!               ║');
  console.log('  ╚═══════════════════════════════════════╝');
  console.log('');

  const config = loadConfig(configPath);
  if (config.auth.bearerToken) {
    console.log(`  API Token: ${config.auth.bearerToken}`);
    console.log('');
  }

  console.log('  Start: opentidy start');
  console.log('  Check: opentidy doctor');
}
