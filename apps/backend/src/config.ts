import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import type { AlfredConfig } from '@alfred/shared';

const DEFAULT_CONFIG: AlfredConfig = {
  version: 1,
  telegram: { botToken: '', chatId: '', userId: '' },
  auth: { bearerToken: '' },
  server: { port: 5175, appBaseUrl: 'http://localhost:5175' },
  workspace: { dir: '', lockDir: '/tmp/assistant-locks' },
  update: {
    autoUpdate: true,
    checkInterval: '6h',
    notifyBeforeUpdate: true,
    delayBeforeUpdate: '5m',
    keepReleases: 3,
  },
  claudeConfig: { dir: '' },
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
  return process.env.ALFRED_CONFIG_PATH
    || `${process.env.HOME}/.config/alfred/config.json`;
}

export function loadConfig(configPath?: string): AlfredConfig {
  const path = configPath || getConfigPath();
  try {
    const raw = readFileSync(path, 'utf-8');
    const parsed = JSON.parse(raw);
    return deepMerge(DEFAULT_CONFIG, parsed);
  } catch {
    return { ...structuredClone(DEFAULT_CONFIG) };
  }
}

export function saveConfig(configPath: string, config: AlfredConfig): void {
  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
}
