// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import type { OpenTidyConfig } from '@opentidy/shared';
import { getOpenTidyPaths } from './paths.js';

const openTidyPaths = getOpenTidyPaths();

const DEFAULT_CONFIG: OpenTidyConfig = {
  version: 2,
  telegram: { botToken: '', chatId: '', userId: '' },
  auth: { bearerToken: '' },
  server: { port: 5175, appBaseUrl: 'http://localhost:5175' },
  workspace: { dir: '', lockDir: openTidyPaths.lockDir },
  update: {
    autoUpdate: true,
    checkInterval: '6h',
    notifyBeforeUpdate: true,
    delayBeforeUpdate: '5m',
    keepReleases: 3,
  },
  agentConfig: { name: 'claude', configDir: '' },
  claudeConfig: { dir: '' },
  language: 'en',
  userInfo: { name: '', email: '', company: '' },
  mcp: {
    curated: {
      gmail: { enabled: false, configured: false },
      camoufox: { enabled: false, configured: false },
      whatsapp: { enabled: false, configured: false, wacliPath: '', mcpServerPath: '' },
    },
    marketplace: {},
  },
  skills: {
    curated: {
      browser: { enabled: true },
      bitwarden: { enabled: false },
    },
    user: [],
  },
  receivers: process.platform === 'darwin'
    ? [
        { type: 'gmail-webhook', enabled: true },
        { type: 'imessage', enabled: true },
        { type: 'apple-mail', enabled: true },
      ]
    : [
        { type: 'gmail-webhook', enabled: true },
      ],
};

function deepMerge<T extends Record<string, any>>(defaults: T, overrides: Record<string, any>): T {
  const result = { ...defaults };
  for (const key of Object.keys(overrides)) {
    if (
      overrides[key] && typeof overrides[key] === 'object' && !Array.isArray(overrides[key])
      && defaults[key] && typeof defaults[key] === 'object'
    ) {
      result[key as keyof T] = deepMerge(defaults[key], overrides[key]);
    } else {
      result[key as keyof T] = overrides[key];
    }
  }
  return result;
}

export function getConfigPath(): string {
  return process.env.OPENTIDY_CONFIG_PATH
    || `${openTidyPaths.config}/config.json`;
}

function migrateV1ToV2(parsed: Record<string, any>): Record<string, any> {
  if (parsed.version && parsed.version >= 2) return parsed;

  console.log('[config] Migrating config.json v1 → v2');
  const oldMcp = parsed.mcp || {};

  parsed.version = 2;
  parsed.mcp = {
    curated: {
      gmail: oldMcp.gmail ?? { enabled: false, configured: false },
      camoufox: oldMcp.camoufox ?? { enabled: false, configured: false },
      whatsapp: oldMcp.whatsapp ?? { enabled: false, configured: false, wacliPath: '', mcpServerPath: '' },
    },
    marketplace: {},
  };
  parsed.skills = parsed.skills ?? {
    curated: { browser: { enabled: true }, bitwarden: { enabled: false } },
    user: [],
  };

  return parsed;
}

export function loadConfig(configPath?: string): OpenTidyConfig {
  const path = configPath || getConfigPath();
  try {
    const raw = readFileSync(path, 'utf-8');
    const parsed = JSON.parse(raw);
    const migrated = migrateV1ToV2(parsed);
    const config = deepMerge(DEFAULT_CONFIG, migrated);

    // Migrate v1 claudeConfig → v2 agentConfig
    if (config.claudeConfig?.dir && (!config.agentConfig?.configDir || config.agentConfig.configDir === '')) {
      config.agentConfig = { name: 'claude', configDir: config.claudeConfig.dir };
      console.log('[config] migrated claudeConfig → agentConfig');
    }

    // Persist migration if version changed
    if (parsed.version !== config.version) {
      saveConfig(path, config);
    }

    return config;
  } catch {
    return { ...structuredClone(DEFAULT_CONFIG) };
  }
}

export function saveConfig(configPath: string, config: OpenTidyConfig): void {
  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
}