// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { execFileSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { loadConfig, saveConfig, getConfigPath } from '../../shared/config.js';
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
  info('Uses OAuth — no API keys needed.');
  console.log('');

  if (config.mcp.curated.gmail.configured) {
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

  config.mcp.curated.gmail.enabled = true;
  config.mcp.curated.gmail.configured = true;
  saveConfig(configPath, config);
  success('Gmail configured.');
}
