// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { writeFileSync, mkdirSync, chmodSync } from 'fs';
import { join } from 'path';
import { loadConfig, saveConfig, getConfigPath } from '../../shared/config.js';
import { run, info, success, warn } from './utils.js';

const WRAPPER_SCRIPT = `#!/usr/bin/env bash
# Wrapper for camofox MCP, unique CAMOFOX_USER per Claude Code session
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
  const claudeConfigDir = config.claudeConfig?.dir;
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

  if (!config.modules.camoufox) config.modules.camoufox = { enabled: false, source: 'curated' };
  config.modules.camoufox.enabled = true;
  saveConfig(configPath, config);
  success('Camoufox configured.');
}
