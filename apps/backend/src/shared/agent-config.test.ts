// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { generateClaudeSettings, generateSettingsFromModules, regenerateAgentConfig, syncSkills, readEnvFile, buildMarketplaceGuardrails } from './agent-config.js';
import type { OpenTidyConfig, ModuleManifest, ModuleState } from '@opentidy/shared';
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

function makeManifest(name: string, overrides: Partial<ModuleManifest> = {}): ModuleManifest {
  return {
    name,
    label: name,
    description: `${name} module`,
    version: '1.0.0',
    ...overrides,
  };
}

function makeModuleState(enabled: boolean, config?: Record<string, unknown>): ModuleState {
  return { enabled, source: 'curated', config };
}

describe('generateSettingsFromModules', () => {
  it('returns empty result when no modules', () => {
    const result = generateSettingsFromModules({}, new Map());
    expect(result.mcpServers).toEqual({});
    expect(result.skills).toEqual([]);
  });

  it('ignores disabled modules', () => {
    const modules: Record<string, ModuleState> = {
      gmail: makeModuleState(false),
    };
    const manifests = new Map<string, ModuleManifest>([
      ['gmail', makeManifest('gmail', {
        mcpServers: [{ name: 'gmail', command: 'npx', args: ['@gmail/mcp'] }],
      })],
    ]);
    const result = generateSettingsFromModules(modules, manifests);
    expect(result.mcpServers).toEqual({});
  });

  it('ignores enabled modules with no manifest', () => {
    const modules: Record<string, ModuleState> = {
      unknown: makeModuleState(true),
    };
    const result = generateSettingsFromModules(modules, new Map());
    expect(result.mcpServers).toEqual({});
  });

  it('collects MCP servers from 2 active modules', () => {
    const modules: Record<string, ModuleState> = {
      gmail: makeModuleState(true),
      notion: makeModuleState(true),
    };
    const manifests = new Map<string, ModuleManifest>([
      ['gmail', makeManifest('gmail', {
        mcpServers: [{ name: 'gmail', command: 'npx', args: ['@gmail/mcp'] }],
      })],
      ['notion', makeManifest('notion', {
        mcpServers: [{ name: 'notion', command: 'npx', args: ['@notion/mcp'] }],
      })],
    ]);
    const result = generateSettingsFromModules(modules, manifests);
    expect(Object.keys(result.mcpServers)).toHaveLength(2);
    expect(result.mcpServers['gmail']).toBeDefined();
    expect(result.mcpServers['notion']).toBeDefined();
    expect(result.mcpServers['gmail']).toMatchObject({ type: 'stdio', command: 'npx', args: ['@gmail/mcp'] });
  });

  it('deduplicates MCPs with same command+args from different modules', () => {
    const modules: Record<string, ModuleState> = {
      modA: makeModuleState(true),
      modB: makeModuleState(true),
    };
    const sharedMcp = { name: 'shared-mcp', command: 'npx', args: ['@shared/mcp'] };
    const manifests = new Map<string, ModuleManifest>([
      ['modA', makeManifest('modA', { mcpServers: [sharedMcp] })],
      ['modB', makeManifest('modB', { mcpServers: [{ ...sharedMcp, name: 'shared-mcp-alias' }] })],
    ]);
    const result = generateSettingsFromModules(modules, manifests);
    // Only the first registration wins; duplicate is skipped
    expect(Object.keys(result.mcpServers)).toHaveLength(1);
    expect(result.mcpServers['shared-mcp']).toBeDefined();
  });

  it('resolves envFromConfig: maps config value to env var', () => {
    const modules: Record<string, ModuleState> = {
      notion: makeModuleState(true, { NOTION_TOKEN: 'secret-token-xyz' }),
    };
    const manifests = new Map<string, ModuleManifest>([
      ['notion', makeManifest('notion', {
        mcpServers: [{
          name: 'notion',
          command: 'npx',
          args: ['@notion/mcp'],
          envFromConfig: { NOTION_API_KEY: 'NOTION_TOKEN' },
        }],
      })],
    ]);
    const result = generateSettingsFromModules(modules, manifests);
    expect(result.mcpServers['notion']).toBeDefined();
    const entry = result.mcpServers['notion'] as { env?: Record<string, string> };
    expect(entry.env).toEqual({ NOTION_API_KEY: 'secret-token-xyz' });
  });

  it('envFromConfig ignores missing config keys (does not set undefined)', () => {
    const modules: Record<string, ModuleState> = {
      notion: makeModuleState(true, {}),
    };
    const manifests = new Map<string, ModuleManifest>([
      ['notion', makeManifest('notion', {
        mcpServers: [{
          name: 'notion',
          command: 'npx',
          args: ['@notion/mcp'],
          envFromConfig: { NOTION_API_KEY: 'NOTION_TOKEN' },
        }],
      })],
    ]);
    const result = generateSettingsFromModules(modules, manifests);
    const entry = result.mcpServers['notion'] as { env?: Record<string, string> };
    // No env key since config value was missing
    expect(entry.env).toBeUndefined();
  });

  it('collects skills from active modules', () => {
    const modules: Record<string, ModuleState> = {
      mymod: makeModuleState(true),
    };
    const manifests = new Map<string, ModuleManifest>([
      ['mymod', makeManifest('mymod', {
        skills: [
          { name: 'my-skill', content: '# My Skill\nDo things.' },
        ],
      })],
    ]);
    const result = generateSettingsFromModules(modules, manifests);
    expect(result.skills).toHaveLength(1);
    expect(result.skills[0].name).toBe('my-skill');
  });

  it('does not include skills from disabled modules', () => {
    const modules: Record<string, ModuleState> = {
      mymod: makeModuleState(false),
    };
    const manifests = new Map<string, ModuleManifest>([
      ['mymod', makeManifest('mymod', {
        skills: [{ name: 'my-skill', content: '# My Skill' }],
      })],
    ]);
    const result = generateSettingsFromModules(modules, manifests);
    expect(result.skills).toHaveLength(0);
  });
});

describe('regenerateAgentConfig (module path)', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'opentidy-agent-cfg-'));
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('writes settings.json with module MCPs + opentidy system MCP', () => {
    const config = buildTestConfig({
      agentConfig: { name: 'claude', configDir: testDir },
      server: { port: 5175, appBaseUrl: 'http://localhost:5175' },
      modules: { gmail: { enabled: true, source: 'curated' } },
    });
    const modules: Record<string, ModuleState> = {
      gmail: makeModuleState(true),
    };
    const manifests = new Map<string, ModuleManifest>([
      ['gmail', makeManifest('gmail', {
        mcpServers: [{ name: 'gmail', command: 'npx', args: ['@gmail/mcp'] }],
      })],
    ]);

    regenerateAgentConfig(config, undefined, modules, manifests);

    const settingsPath = join(testDir, 'settings.json');
    expect(existsSync(settingsPath)).toBe(true);
    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    expect(settings.mcpServers.gmail).toBeDefined();
    expect(settings.mcpServers.opentidy).toBeDefined();
    expect(settings.mcpServers.opentidy.url).toContain('5175');
    expect(settings.permissions.allow).toContain('mcp__opentidy__*');
    expect(settings._regeneratedAt).toBeDefined();
  });
});
