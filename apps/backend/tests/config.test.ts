import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { loadConfig, saveConfig } from '../src/config.js';

describe('config', () => {
  let configDir: string;

  beforeEach(() => {
    configDir = mkdtempSync(join(tmpdir(), 'alfred-config-'));
  });

  afterEach(() => {
    rmSync(configDir, { recursive: true, force: true });
  });

  it('loads config from file', () => {
    const configPath = join(configDir, 'config.json');
    writeFileSync(configPath, JSON.stringify({
      version: 1,
      telegram: { botToken: 'test-token', chatId: '123' },
      auth: { bearerToken: 'secret' },
      server: { port: 5175, appBaseUrl: 'http://localhost:5175' },
      workspace: { dir: '/tmp/workspace', lockDir: '/tmp/locks' },
      update: { autoUpdate: true, checkInterval: '6h', notifyBeforeUpdate: true, delayBeforeUpdate: '5m', keepReleases: 3 },
      claudeConfig: { dir: join(configDir, 'claude-config') },
    }));
    const config = loadConfig(configPath);
    expect(config.telegram.botToken).toBe('test-token');
    expect(config.server.port).toBe(5175);
  });

  it('returns defaults when no config file exists', () => {
    const config = loadConfig(join(configDir, 'nonexistent.json'));
    expect(config.server.port).toBe(5175);
    expect(config.update.autoUpdate).toBe(true);
  });

  it('deep merges partial config with defaults', () => {
    const configPath = join(configDir, 'config.json');
    writeFileSync(configPath, JSON.stringify({
      version: 1,
      update: { autoUpdate: false },
    }));
    const config = loadConfig(configPath);
    // autoUpdate overridden
    expect(config.update.autoUpdate).toBe(false);
    // rest of update preserved from defaults
    expect(config.update.checkInterval).toBe('6h');
    expect(config.update.keepReleases).toBe(3);
    // other sections preserved
    expect(config.server.port).toBe(5175);
  });

  it('saves config to file', () => {
    const configPath = join(configDir, 'config.json');
    const config = loadConfig(configPath);
    config.telegram.botToken = 'new-token';
    saveConfig(configPath, config);
    const reloaded = loadConfig(configPath);
    expect(reloaded.telegram.botToken).toBe('new-token');
  });
});
