// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { existsSync } from 'fs';
import { join } from 'path';
import { execFileSync } from 'child_process';
import { loadConfig, getConfigPath } from '../../shared/config.js';

export interface ModuleStatus {
  name: string;
  key: string;
  done: boolean;
  detail: string;
}

function checkPermissions(): { done: boolean; detail: string } {
  const apps = ['Messages', 'Mail', 'Finder', 'System Events', 'Calendar', 'Contacts'];
  const results: string[] = [];
  let allOk = true;
  for (const app of apps) {
    try {
      execFileSync('osascript', ['-e', `tell application "${app}" to get name`], {
        encoding: 'utf-8', timeout: 5000, stdio: 'pipe',
      });
      results.push(app);
    } catch {
      allOk = false;
    }
  }
  if (allOk) return { done: true, detail: `${apps.length}/${apps.length} apps authorized` };
  if (results.length > 0) return { done: false, detail: `${results.length}/${apps.length} apps authorized` };
  return { done: false, detail: 'Not configured' };
}

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
      done: !!(config?.modules?.telegram?.config?.botToken && config?.modules?.telegram?.config?.chatId),
      detail: config?.modules?.telegram?.config?.botToken
        ? `Bot: ...${(config.modules.telegram.config.botToken as string).slice(-8)}`
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
      done: !!(config?.modules?.gmail?.enabled),
      detail: config?.modules?.gmail?.enabled
        ? 'OAuth configured'
        : 'Not configured',
    },
    {
      name: 'Camoufox',
      key: 'camoufox',
      done: !!(config?.modules?.camoufox?.enabled),
      detail: config?.modules?.camoufox?.enabled
        ? 'Wrapper script ready'
        : 'Not configured',
    },
    {
      name: 'WhatsApp',
      key: 'whatsapp',
      done: !!(config?.modules?.whatsapp?.enabled),
      detail: config?.modules?.whatsapp?.enabled
        ? 'wacli authenticated'
        : 'Not configured (optional)',
    },
    {
      name: 'Claude Code',
      key: 'claude',
      done: !!(config?.claudeConfig?.dir && existsSync(join(config.claudeConfig.dir, 'settings.json'))),
      detail: config?.claudeConfig?.dir
        ? config.claudeConfig.dir
        : 'Not configured',
    },
    {
      name: 'GitHub',
      key: 'github',
      done: !!(config?.github?.token),
      detail: config?.github?.token
        ? `${config.github.owner || 'opentidy'}/${config.github.repo || 'opentidy'}`
        : 'Not configured (optional)',
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
