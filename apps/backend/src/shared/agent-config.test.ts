// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { generateClaudeSettings, syncSkills, readEnvFile, buildMarketplaceGuardrails } from './agent-config.js';
import type { OpenTidyConfig } from '@opentidy/shared';
import { loadConfig } from './config.js';

function buildTestConfig(overrides: Record<string, unknown> = {}): OpenTidyConfig {
  const dir = join(tmpdir(), `opentidy-cfg-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, 'config.json');
  writeFileSync(path, JSON.stringify({ version: 2, ...overrides }));
  const config = loadConfig(path);
  rmSync(dir, { recursive: true, force: true });
  return config;
}

describe('generateClaudeSettings', () => {
  it('includes curated MCP servers when enabled', () => {
    const config = buildTestConfig({
      agentConfig: { name: 'claude', configDir: '/tmp/test' },
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
    expect(settings.permissions.allow).toContain('mcp__gmail__*');
  });

  it('includes marketplace MCP servers', () => {
    const config = buildTestConfig({
      agentConfig: { name: 'claude', configDir: '/tmp/test' },
      mcp: {
        curated: {
          gmail: { enabled: false, configured: false },
          camoufox: { enabled: false, configured: false },
          whatsapp: { enabled: false, configured: false, wacliPath: '', mcpServerPath: '' },
        },
        marketplace: {
          notion: {
            label: 'Notion',
            command: 'npx',
            args: ['@notionhq/notion-mcp'],
            permissions: ['mcp__notion__*'],
            source: 'custom',
          },
        },
      },
    });
    const settings = generateClaudeSettings(config);
    expect(settings.mcpServers.notion).toBeDefined();
    expect(settings.mcpServers.notion.command).toBe('npx');
    expect(settings.permissions.allow).toContain('mcp__notion__*');
  });

  it('reads env from envFile', () => {
    const envDir = mkdtempSync(join(tmpdir(), 'opentidy-env-'));
    writeFileSync(join(envDir, 'mcp-notion.env'), 'NOTION_API_KEY=sk-test-123\nANOTHER=val');
    const config = buildTestConfig({
      agentConfig: { name: 'claude', configDir: '/tmp/test' },
      mcp: {
        curated: {
          gmail: { enabled: false, configured: false },
          camoufox: { enabled: false, configured: false },
          whatsapp: { enabled: false, configured: false, wacliPath: '', mcpServerPath: '' },
        },
        marketplace: {
          notion: {
            label: 'Notion',
            command: 'npx',
            args: ['@notionhq/notion-mcp'],
            envFile: 'mcp-notion.env',
            permissions: ['mcp__notion__*'],
            source: 'custom',
          },
        },
      },
    });
    const settings = generateClaudeSettings(config, envDir);
    expect(settings.mcpServers.notion.env).toEqual({ NOTION_API_KEY: 'sk-test-123', ANOTHER: 'val' });
    rmSync(envDir, { recursive: true, force: true });
  });

  it('adds _regeneratedAt timestamp', () => {
    const config = buildTestConfig({
      agentConfig: { name: 'claude', configDir: '/tmp/test' },
    });
    const settings = generateClaudeSettings(config);
    expect(settings._regeneratedAt).toBeDefined();
  });
});

describe('readEnvFile', () => {
  it('parses KEY=VALUE lines', () => {
    const dir = mkdtempSync(join(tmpdir(), 'opentidy-env-'));
    writeFileSync(join(dir, 'test.env'), 'FOO=bar\n# comment\nBAZ=qux\n');
    const env = readEnvFile(join(dir, 'test.env'));
    expect(env).toEqual({ FOO: 'bar', BAZ: 'qux' });
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns empty object for missing file', () => {
    const env = readEnvFile('/nonexistent/file.env');
    expect(env).toEqual({});
  });
});

describe('syncSkills', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'opentidy-skills-'));
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('copies curated skill when enabled', () => {
    const curatedDir = join(testDir, 'curated-skills', 'browser');
    mkdirSync(curatedDir, { recursive: true });
    writeFileSync(join(curatedDir, 'SKILL.md'), '---\nname: browser\n---\nUse Camoufox');

    const targetDir = join(testDir, 'target');
    mkdirSync(targetDir, { recursive: true });

    syncSkills(
      { curated: { browser: { enabled: true } }, user: [] },
      targetDir,
      join(testDir, 'curated-skills'),
    );

    expect(existsSync(join(targetDir, 'skills', 'browser', 'SKILL.md'))).toBe(true);
  });

  it('removes disabled skills', () => {
    const targetDir = join(testDir, 'target');
    const skillDir = join(targetDir, 'skills', 'browser');
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, 'SKILL.md'), 'old content');

    syncSkills(
      { curated: { browser: { enabled: false } }, user: [] },
      targetDir,
      join(testDir, 'curated-skills'),
    );

    expect(existsSync(skillDir)).toBe(false);
  });
});

describe('buildMarketplaceGuardrails', () => {
  it('generates PostToolUse http hooks for marketplace MCPs', () => {
    const config = buildTestConfig({
      server: { port: 5175 },
      mcp: {
        curated: {
          gmail: { enabled: false, configured: false },
          camoufox: { enabled: false, configured: false },
          whatsapp: { enabled: false, configured: false, wacliPath: '', mcpServerPath: '' },
        },
        marketplace: {
          notion: { label: 'Notion', command: 'npx', args: [], permissions: ['mcp__notion__*'], source: 'custom' },
        },
      },
    });
    const rules = buildMarketplaceGuardrails(config);
    expect(rules).toHaveLength(1);
    expect(rules[0].event).toBe('post-tool');
    expect(rules[0].type).toBe('http');
    expect(rules[0].match).toBe('mcp__notion__');
    expect(rules[0].url).toContain('5175');
  });

  it('returns empty for no marketplace MCPs', () => {
    const config = buildTestConfig({
      mcp: {
        curated: {
          gmail: { enabled: false, configured: false },
          camoufox: { enabled: false, configured: false },
          whatsapp: { enabled: false, configured: false, wacliPath: '', mcpServerPath: '' },
        },
        marketplace: {},
      },
    });
    expect(buildMarketplaceGuardrails(config)).toEqual([]);
  });
});
