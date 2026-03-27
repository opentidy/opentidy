// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import type { OpenTidyConfig } from '@opentidy/shared';
import { OpenTidyConfigSchema } from '@opentidy/shared';
import { getOpenTidyPaths } from './paths.js';

const openTidyPaths = getOpenTidyPaths();

export const DEFAULT_PORT = 5175;

const DEFAULT_CONFIG: OpenTidyConfig = {
  version: 3,
  auth: { bearerToken: '' },
  server: { port: DEFAULT_PORT, appBaseUrl: `http://localhost:${DEFAULT_PORT}` },
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
  modules: {
    opentidy: { enabled: true, source: 'curated' as const },
  },
  preferences: {
    scanInterval: '2h',
    notificationRateLimit: 60_000,
  },
  permissions: {
    preset: 'autonomous' as const,
    defaultLevel: 'ask' as const,
    modules: {},
  },
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

function migrateV2ToV3(parsed: Record<string, any>): Record<string, any> {
  if (parsed.version && parsed.version >= 3) return parsed;
  console.log('[config] Migrating config.json v2 → v3 (module system)');
  parsed.version = 3;
  parsed.modules = parsed.modules ?? {};
  // Old fields will be ignored by deepMerge since they're not in DEFAULT_CONFIG
  delete parsed.mcp;
  delete parsed.skills;
  delete parsed.receivers;
  delete parsed.telegram;
  return parsed;
}

function migratePermissionLevels(config: OpenTidyConfig): boolean {
  let changed = false;
  const perms = config.permissions;
  if (!perms) return false;

  // Migrate defaultLevel: 'ask' (old) → 'block', 'confirm' → 'ask'
  // Order matters: 'ask' → 'block' first, then 'confirm' → 'ask'
  if ((perms.defaultLevel as string) === 'ask') {
    perms.defaultLevel = 'block';
    changed = true;
  } else if ((perms.defaultLevel as string) === 'confirm') {
    perms.defaultLevel = 'ask';
    changed = true;
  }

  for (const [key, value] of Object.entries(perms.modules)) {
    if (typeof value === 'string') {
      if ((value as string) === 'ask') {
        perms.modules[key] = 'block';
        changed = true;
      } else if ((value as string) === 'confirm') {
        perms.modules[key] = 'ask';
        changed = true;
      }
    } else if (value && typeof value === 'object') {
      const mpl = value as Record<string, any>;
      for (const field of ['safe', 'critical'] as const) {
        if (mpl[field] === 'ask') { mpl[field] = 'block'; changed = true; }
        else if (mpl[field] === 'confirm') { mpl[field] = 'ask'; changed = true; }
      }
      if (mpl.overrides) {
        for (const [tk, tv] of Object.entries(mpl.overrides)) {
          if (tv === 'ask') { mpl.overrides[tk] = 'block'; changed = true; }
          else if (tv === 'confirm') { mpl.overrides[tk] = 'ask'; changed = true; }
        }
      }
    }
  }

  // Migrate preset names: 'full-auto' → 'autonomous', old 'autonomous' → 'assisted'
  if ((perms.preset as string) === 'full-auto') {
    perms.preset = 'autonomous';
    changed = true;
  } else if ((perms.preset as string) === 'autonomous' && perms.modules && Object.values(perms.modules).some(v => typeof v === 'object' && (v as any).critical === 'ask')) {
    perms.preset = 'assisted';
    changed = true;
  }

  // Re-apply preset defaults to fix stale values from old preset definitions
  const PRESET_DEFAULTS: Record<string, { safe: string; critical: string }> = {
    'supervised': { safe: 'ask', critical: 'ask' },
    'assisted': { safe: 'allow', critical: 'ask' },
    'autonomous': { safe: 'allow', critical: 'allow' },
  };
  const presetDef = PRESET_DEFAULTS[perms.preset as string];
  if (presetDef) {
    for (const [, value] of Object.entries(perms.modules)) {
      if (typeof value === 'object' && value) {
        const mpl = value as Record<string, any>;
        const hasOverrides = mpl.overrides && Object.keys(mpl.overrides).length > 0;
        // Only re-apply if no per-tool overrides (user customization)
        if (!hasOverrides && (mpl.safe !== presetDef.safe || mpl.critical !== presetDef.critical)) {
          mpl.safe = presetDef.safe;
          mpl.critical = presetDef.critical;
          changed = true;
        }
      }
    }
    if (perms.defaultLevel !== presetDef.critical) {
      perms.defaultLevel = presetDef.critical as any;
      changed = true;
    }
  }

  if (changed) console.log('[config] Migrated permission config');
  return changed;
}

export function loadConfig(configPath?: string): OpenTidyConfig {
  const path = configPath || getConfigPath();
  try {
    const raw = readFileSync(path, 'utf-8');
    const parsed = JSON.parse(raw);
    const migrated = migrateV2ToV3(migrateV1ToV2(parsed));
    const config = deepMerge(DEFAULT_CONFIG, migrated);

    // Validate critical config fields (warn only, don't block for backward compat)
    const validation = OpenTidyConfigSchema.safeParse(config);
    if (!validation.success) {
      console.warn('[config] Config validation warnings:', validation.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', '));
    }

    // Migrate v1 claudeConfig → v2 agentConfig
    if (config.claudeConfig?.dir && (!config.agentConfig?.configDir || config.agentConfig.configDir === '')) {
      config.agentConfig = { name: 'claude', configDir: config.claudeConfig.dir };
      console.log('[config] migrated claudeConfig → agentConfig');
    }

    // Migrate old permission level names: confirm→ask, ask→block
    const permsMigrated = migratePermissionLevels(config);

    // Persist migration if version changed or permissions migrated
    if (parsed.version !== config.version || permsMigrated) {
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