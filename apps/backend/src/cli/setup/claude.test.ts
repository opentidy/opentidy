// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { loadConfig } from '../../shared/config.js';
import { generateClaudeSettings, generateClaudeMd } from './claude.js';

// Helper: build a full config with defaults merged
function buildTestConfig(overrides: Record<string, unknown> = {}) {
  const dir = join(tmpdir(), `opentidy-cfg-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, 'config.json');
  writeFileSync(path, JSON.stringify({ version: 2, ...overrides }));
  const config = loadConfig(path);
  rmSync(dir, { recursive: true, force: true });
  return config;
}

describe('generateClaudeSettings', () => {
  it('generates settings with no MCP servers when none configured', () => {
    const config = buildTestConfig({ claudeConfig: { dir: '/tmp/test' } });
    const settings = generateClaudeSettings(config);
    expect(settings.permissions.allow).toContain('Read');
    expect(settings.permissions.allow).toContain('Bash(osascript:*)');
    // opentidy MCP is always injected (system infrastructure)
    expect(settings.mcpServers.opentidy).toBeDefined();
    expect(Object.keys(settings.mcpServers)).toEqual(['opentidy']);
  });

  it('includes gmail MCP when enabled', () => {
    const config = buildTestConfig({
      claudeConfig: { dir: '/tmp/test' },
      mcp: {
        curated: {
          gmail: { enabled: true, configured: true },
          camoufox: { enabled: false, configured: false },
          whatsapp: { enabled: false, configured: false, wacliPath: '', mcpServerPath: '' },
        },
        marketplace: {},
      },
    });
    const settings = generateClaudeSettings(config);
    expect(settings.mcpServers.gmail).toBeDefined();
    expect(settings.mcpServers.gmail.command).toBe('npx');
    expect(settings.mcpServers.gmail.args).toContain('@gongrzhe/server-gmail-autoauth-mcp');
    expect(settings.permissions.allow).toContain('mcp__gmail__*');
  });

  it('includes camoufox MCP when enabled', () => {
    const config = buildTestConfig({
      claudeConfig: { dir: '/tmp/test-claude' },
      mcp: {
        curated: {
          gmail: { enabled: false, configured: false },
          camoufox: { enabled: true, configured: true },
          whatsapp: { enabled: false, configured: false, wacliPath: '', mcpServerPath: '' },
        },
        marketplace: {},
      },
    });
    const settings = generateClaudeSettings(config);
    expect(settings.mcpServers.camofox).toBeDefined();
    expect(settings.mcpServers.camofox.command).toBe('bash');
    expect(settings.mcpServers.camofox.args[0]).toContain('camofox-mcp.sh');
    expect(settings.permissions.allow).toContain('mcp__camofox__*');
  });

  it('adds wacli Bash permission when whatsapp has no mcpServerPath', () => {
    const config = buildTestConfig({
      claudeConfig: { dir: '/tmp/test' },
      mcp: {
        curated: {
          gmail: { enabled: false, configured: false },
          camoufox: { enabled: false, configured: false },
          whatsapp: { enabled: true, configured: true, wacliPath: '/usr/local/bin/wacli', mcpServerPath: '' },
        },
        marketplace: {},
      },
    });
    const settings = generateClaudeSettings(config);
    expect(settings.mcpServers.whatsapp).toBeUndefined();
    expect(settings.permissions.allow).toContain('Bash(wacli:*)');
  });

  it('includes whatsapp MCP when mcpServerPath is set', () => {
    const config = buildTestConfig({
      claudeConfig: { dir: '/tmp/test' },
      mcp: {
        curated: {
          gmail: { enabled: false, configured: false },
          camoufox: { enabled: false, configured: false },
          whatsapp: { enabled: true, configured: true, wacliPath: '/usr/local/bin/wacli', mcpServerPath: '/opt/mcp-wacli' },
        },
        marketplace: {},
      },
    });
    const settings = generateClaudeSettings(config);
    expect(settings.mcpServers.whatsapp).toBeDefined();
    expect(settings.mcpServers.whatsapp.cwd).toBe('/opt/mcp-wacli');
    expect(settings.permissions.allow).toContain('mcp__whatsapp__*');
  });

  it('includes all MCPs when all configured', () => {
    const config = buildTestConfig({
      claudeConfig: { dir: '/tmp/test' },
      mcp: {
        curated: {
          gmail: { enabled: true, configured: true },
          camoufox: { enabled: true, configured: true },
          whatsapp: { enabled: true, configured: true, wacliPath: '/usr/local/bin/wacli', mcpServerPath: '/opt/mcp-wacli' },
        },
        marketplace: {},
      },
    });
    const settings = generateClaudeSettings(config);
    expect(Object.keys(settings.mcpServers).sort()).toEqual(['camofox', 'gmail', 'opentidy', 'whatsapp']);
  });
});

describe('generateClaudeMd', () => {
  let templateDir: string;
  let templatePath: string;

  beforeEach(() => {
    templateDir = join(tmpdir(), `opentidy-tmpl-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(templateDir, { recursive: true });
    templatePath = join(templateDir, 'CLAUDE.md');
    writeFileSync(templatePath, [
      '# OpenTidy — Personal Assistant',
      '## User Info',
      '- Email: (configured during setup)',
      '- Full name: (configured during setup)',
      '- Company: (configured during setup)',
      '## Identity',
      "- Communicate in the user's preferred language",
    ].join('\n'));
  });

  afterEach(() => {
    rmSync(templateDir, { recursive: true, force: true });
  });

  it('replaces user info placeholders', () => {
    const config = buildTestConfig({
      userInfo: { name: 'Alice', email: 'alice@example.com', company: 'Acme' },
      language: 'en',
    });
    const result = generateClaudeMd(templatePath, config);
    expect(result).toContain('- Email: alice@example.com');
    expect(result).toContain('- Full name: Alice');
    expect(result).toContain('- Company: Acme');
  });

  it('sets French language', () => {
    const config = buildTestConfig({ language: 'fr' });
    const result = generateClaudeMd(templatePath, config);
    expect(result).toContain('Communicate in French');
  });

  it('handles missing user info gracefully', () => {
    const config = buildTestConfig({});
    const result = generateClaudeMd(templatePath, config);
    expect(result).toContain('- Email: (not configured)');
    expect(result).toContain('- Full name: (not configured)');
  });
});
