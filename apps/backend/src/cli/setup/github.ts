// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { loadConfig, saveConfig, getConfigPath } from '../../shared/config.js';
import { ask, info, success } from './utils.js';

export async function setupGitHub(): Promise<void> {
  const configPath = getConfigPath();
  const config = loadConfig(configPath);

  console.log('');
  console.log('  ┌─────────────────────────────────────┐');
  console.log('  │  GitHub (Actionable Gaps)             │');
  console.log('  └─────────────────────────────────────┘');
  console.log('');
  info('OpenTidy can create GitHub Issues from gaps detected during sessions.');
  info('This requires a Personal Access Token with "repo" scope.');
  console.log('');

  if (config.github?.token) {
    info(`Current token: ...${config.github.token.slice(-8)}`);
    const keep = await ask('  Keep current token? (Y/n) ');
    if (keep.toLowerCase() !== 'n') {
      success('GitHub config unchanged.');
      return;
    }
  }

  const token = await ask('  GitHub Personal Access Token: ');
  if (!token.trim()) {
    info('Skipped — no token provided.');
    return;
  }

  const owner = (await ask('  Repo owner (default: opentidy): ')).trim() || 'opentidy';
  const repo = (await ask('  Repo name (default: opentidy): ')).trim() || 'opentidy';

  config.github = { token: token.trim(), owner, repo };
  saveConfig(configPath, config);
  success('GitHub configured.');
}
