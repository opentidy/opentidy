// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { randomBytes } from 'crypto';
import { loadConfig, saveConfig, getConfigPath } from '../../shared/config.js';
import { info, success } from './utils.js';

export async function setupAuth(): Promise<void> {
  const configPath = getConfigPath();
  const config = loadConfig(configPath);

  console.log('');
  console.log('  ┌─────────────────────────────────────┐');
  console.log('  │  API Authentication                  │');
  console.log('  └─────────────────────────────────────┘');
  console.log('');

  if (config.auth.bearerToken) {
    success(`Token already configured: ...${config.auth.bearerToken.slice(-8)}`);
    info(`Port: ${config.server.port || 5175}`);
    return;
  }

  // Auto-generate — no questions asked
  const bearerToken = randomBytes(32).toString('hex');
  config.auth.bearerToken = bearerToken;
  config.server.port = config.server.port || 5175;
  saveConfig(configPath, config);

  success('Bearer token generated automatically.');
  console.log('');
  console.log(`  ┌──────────────────────────────────────────────────────────────────┐`);
  console.log(`  │  ${bearerToken}  │`);
  console.log(`  └──────────────────────────────────────────────────────────────────┘`);
  console.log('');
  info('Save this token — you need it for the web app.');
  info(`Port: ${config.server.port}`);
}
