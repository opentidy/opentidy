// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { loadConfig, saveConfig, getConfigPath } from '../../shared/config.js';
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
