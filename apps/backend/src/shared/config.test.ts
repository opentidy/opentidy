// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { loadConfig, saveConfig } from './config.js';

describe('config', () => {
  let configDir: string;

  beforeEach(() => {
    configDir = mkdtempSync(join(tmpdir(), 'opentidy-config-'));
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

  it('migrates claudeConfig to agentConfig', () => {
    const configPath = join(configDir, 'config.json');
    writeFileSync(configPath, JSON.stringify({
      version: 1,
      claudeConfig: { dir: '/old/claude/config' },
    }));
    const config = loadConfig(configPath);
    expect(config.agentConfig.name).toBe('claude');
    expect(config.agentConfig.configDir).toBe('/old/claude/config');
  });

  it('does not overwrite existing agentConfig with claudeConfig migration', () => {
    const configPath = join(configDir, 'config.json');
    writeFileSync(configPath, JSON.stringify({
      version: 1,
      claudeConfig: { dir: '/old/path' },
      agentConfig: { name: 'claude', configDir: '/new/path' },
    }));
    const config = loadConfig(configPath);
    expect(config.agentConfig.configDir).toBe('/new/path');
  });

  it('defaults agentConfig to claude when no config file', () => {
    const config = loadConfig(join(configDir, 'nonexistent.json'));
    expect(config.agentConfig.name).toBe('claude');
    expect(config.agentConfig.configDir).toBe('');
  });

  it('migrates v1 flat mcp to v2 nested curated/marketplace', () => {
    const configPath = join(configDir, 'config.json');
    writeFileSync(configPath, JSON.stringify({
      version: 1,
      mcp: {
        gmail: { enabled: true, configured: true },
        camoufox: { enabled: false, configured: false },
        whatsapp: { enabled: false, configured: false, wacliPath: '', mcpServerPath: '' },
      },
    }));
    const config = loadConfig(configPath);
    expect(config.version).toBe(2);
    expect(config.mcp.curated.gmail.enabled).toBe(true);
    expect(config.mcp.marketplace).toEqual({});
    expect(config.skills.curated.browser.enabled).toBe(true);
    expect(config.skills.user).toEqual([]);
  });

  it('handles missing mcp section in v1', () => {
    const configPath = join(configDir, 'config.json');
    writeFileSync(configPath, JSON.stringify({ version: 1 }));
    const config = loadConfig(configPath);
    expect(config.version).toBe(2);
    expect(config.mcp.curated.gmail.enabled).toBe(false);
  });

  it('does not re-migrate v2 config', () => {
    const configPath = join(configDir, 'config.json');
    writeFileSync(configPath, JSON.stringify({
      version: 2,
      mcp: {
        curated: {
          gmail: { enabled: true, configured: true },
          camoufox: { enabled: false, configured: false },
          whatsapp: { enabled: false, configured: false, wacliPath: '', mcpServerPath: '' },
        },
        marketplace: { notion: { label: 'Notion', command: 'npx', args: [], permissions: ['mcp__notion__*'], source: 'custom' } },
      },
      skills: { curated: { browser: { enabled: true } }, user: [] },
    }));
    const config = loadConfig(configPath);
    expect(config.mcp.marketplace.notion).toBeDefined();
    expect(config.mcp.marketplace.notion.label).toBe('Notion');
  });
});