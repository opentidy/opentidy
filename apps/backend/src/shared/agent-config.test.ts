// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { generateSettingsFromModules, regenerateAgentConfig, syncSkills, syncModuleSkills, readEnvFile } from './agent-config.js';
import type { ModuleManifest, ModuleState } from '@opentidy/shared';
import { loadConfig } from './config.js';

function buildTestConfig(overrides: Record<string, unknown> = {}) {
  const dir = join(tmpdir(), `opentidy-cfg-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, 'config.json');
  writeFileSync(path, JSON.stringify({ version: 3, ...overrides }));
  const config = loadConfig(path);
  rmSync(dir, { recursive: true, force: true });
  return config;
}

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

describe('syncModuleSkills', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'opentidy-modskills-'));
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('writes skill as SKILL.md with frontmatter', () => {
    syncModuleSkills([{ name: 'browser-skill', content: 'Use Camoufox for browsing.' }], testDir);

    const skillPath = join(testDir, 'skills', 'browser-skill', 'SKILL.md');
    expect(existsSync(skillPath)).toBe(true);
    const content = readFileSync(skillPath, 'utf-8');
    expect(content).toContain('name: browser-skill');
    expect(content).toContain('Use Camoufox for browsing.');
  });

  it('creates .module-generated marker', () => {
    syncModuleSkills([{ name: 'my-skill', content: 'content' }], testDir);
    expect(existsSync(join(testDir, 'skills', 'my-skill', '.module-generated'))).toBe(true);
  });

  it('cleans up old module skills on re-sync', () => {
    // First sync: write a skill
    syncModuleSkills([{ name: 'old-skill', content: 'old' }], testDir);
    expect(existsSync(join(testDir, 'skills', 'old-skill'))).toBe(true);

    // Second sync: different skill. Old one should be gone.
    syncModuleSkills([{ name: 'new-skill', content: 'new' }], testDir);
    expect(existsSync(join(testDir, 'skills', 'old-skill'))).toBe(false);
    expect(existsSync(join(testDir, 'skills', 'new-skill', 'SKILL.md'))).toBe(true);
  });

  it('does not delete non-module skills', () => {
    // Create a user skill (no .module-generated marker)
    const userSkillDir = join(testDir, 'skills', 'user-skill');
    mkdirSync(userSkillDir, { recursive: true });
    writeFileSync(join(userSkillDir, 'SKILL.md'), '---\nname: user-skill\n---\nUser content');

    syncModuleSkills([{ name: 'mod-skill', content: 'module content' }], testDir);

    // User skill preserved, module skill written
    expect(existsSync(join(userSkillDir, 'SKILL.md'))).toBe(true);
    expect(existsSync(join(testDir, 'skills', 'mod-skill', 'SKILL.md'))).toBe(true);
  });

  it('handles empty skills array (cleanup only)', () => {
    syncModuleSkills([{ name: 'to-remove', content: 'x' }], testDir);
    expect(existsSync(join(testDir, 'skills', 'to-remove'))).toBe(true);

    syncModuleSkills([], testDir);
    expect(existsSync(join(testDir, 'skills', 'to-remove'))).toBe(false);
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
      email: makeModuleState(false),
    };
    const manifests = new Map<string, ModuleManifest>([
      ['email', makeManifest('email', {
        mcpServers: [{ name: 'email', command: 'npx', args: ['@email/mcp'] }],
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
      email: makeModuleState(true),
      notion: makeModuleState(true),
    };
    const manifests = new Map<string, ModuleManifest>([
      ['email', makeManifest('email', {
        mcpServers: [{ name: 'email', command: 'npx', args: ['@email/mcp'] }],
      })],
      ['notion', makeManifest('notion', {
        mcpServers: [{ name: 'notion', command: 'npx', args: ['@notion/mcp'] }],
      })],
    ]);
    const result = generateSettingsFromModules(modules, manifests);
    expect(Object.keys(result.mcpServers)).toHaveLength(2);
    expect(result.mcpServers['email']).toBeDefined();
    expect(result.mcpServers['notion']).toBeDefined();
    expect(result.mcpServers['email']).toMatchObject({ type: 'stdio', command: 'npx', args: ['@email/mcp'] });
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

  it('resolves ./ prefixed args relative to modulesBaseDir', () => {
    const modules: Record<string, ModuleState> = {
      'password-manager': makeModuleState(true),
    };
    const manifests = new Map<string, ModuleManifest>([
      ['password-manager', makeManifest('password-manager', {
        mcpServers: [{
          name: 'bitwarden',
          command: 'node',
          args: ['./start-mcp.js'],
        }],
      })],
    ]);
    const result = generateSettingsFromModules(modules, manifests, '/opt/opentidy/modules');
    const entry = result.mcpServers['bitwarden'] as { args: string[] };
    expect(entry.args).toEqual(['/opt/opentidy/modules/password-manager/start-mcp.js']);
  });

  it('does not resolve non-./ args', () => {
    const modules: Record<string, ModuleState> = {
      email: makeModuleState(true),
    };
    const manifests = new Map<string, ModuleManifest>([
      ['email', makeManifest('email', {
        mcpServers: [{
          name: 'email',
          command: 'npx',
          args: ['-y', '@email/mcp'],
        }],
      })],
    ]);
    const result = generateSettingsFromModules(modules, manifests, '/opt/opentidy/modules');
    const entry = result.mcpServers['email'] as { args: string[] };
    expect(entry.args).toEqual(['-y', '@email/mcp']);
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

  it('writes settings.json with module MCPs including opentidy module', () => {
    const config = buildTestConfig({
      agentConfig: { name: 'claude', configDir: testDir },
      server: { port: 5175, appBaseUrl: 'http://localhost:5175' },
      modules: { email: { enabled: true, source: 'curated' }, opentidy: { enabled: true, source: 'curated' } },
    });
    const modules: Record<string, ModuleState> = {
      email: makeModuleState(true),
      opentidy: makeModuleState(true),
    };
    const manifests = new Map<string, ModuleManifest>([
      ['email', makeManifest('email', {
        mcpServers: [{ name: 'email', command: 'npx', args: ['@email/mcp'] }],
      })],
      ['opentidy', makeManifest('opentidy', {
        mcpServers: [{ name: 'opentidy', url: 'http://localhost:5175/mcp', permissions: ['mcp__opentidy__*'] }],
      })],
    ]);

    regenerateAgentConfig(config, undefined, modules, manifests);

    const settingsPath = join(testDir, 'settings.json');
    expect(existsSync(settingsPath)).toBe(true);
    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    expect(settings.mcpServers.email).toBeDefined();
    expect(settings.mcpServers.opentidy).toBeDefined();
    expect(settings.mcpServers.opentidy.url).toContain('5175');
    // Explicit permissions from manifest
    expect(settings.permissions.allow).toContain('mcp__opentidy__*');
    // Auto-generated wildcard for MCP without explicit permissions
    expect(settings.permissions.allow).toContain('mcp__email__*');
    expect(settings._regeneratedAt).toBeDefined();

    // Also writes standalone mcp-config.json for --strict-mcp-config usage
    const mcpConfigPath = join(testDir, 'mcp-config.json');
    expect(existsSync(mcpConfigPath)).toBe(true);
    const mcpConfig = JSON.parse(readFileSync(mcpConfigPath, 'utf-8'));
    expect(mcpConfig.mcpServers.email).toBeDefined();
    expect(mcpConfig.mcpServers.opentidy).toBeDefined();
    expect(mcpConfig.permissions).toBeUndefined(); // only mcpServers, no permissions
  });

  it('resolves password-manager wrapper script path in settings.json', () => {
    const modulesBaseDir = '/opt/test/modules';
    const config = buildTestConfig({
      agentConfig: { name: 'claude', configDir: testDir },
      server: { port: 5175, appBaseUrl: 'http://localhost:5175' },
      modules: { 'password-manager': { enabled: true, source: 'curated' } },
    });
    const modules: Record<string, ModuleState> = {
      'password-manager': makeModuleState(true, { apiUrl: 'https://vault.example.com/api' }),
    };
    const manifests = new Map<string, ModuleManifest>([
      ['password-manager', makeManifest('password-manager', {
        mcpServers: [{
          name: 'bitwarden',
          command: 'node',
          args: ['./start-mcp.js'],
          envFromConfig: { BW_API_BASE_URL: 'apiUrl' },
        }],
      })],
    ]);

    regenerateAgentConfig(config, undefined, modules, manifests, modulesBaseDir);

    const settingsPath = join(testDir, 'settings.json');
    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    expect(settings.mcpServers.bitwarden).toBeDefined();
    expect(settings.mcpServers.bitwarden.command).toBe('node');
    expect(settings.mcpServers.bitwarden.args).toEqual(['/opt/test/modules/password-manager/start-mcp.js']);
    expect(settings.mcpServers.bitwarden.env).toEqual({ BW_API_BASE_URL: 'https://vault.example.com/api' });
  });

  it('writes module skills to skills directory', () => {
    const config = buildTestConfig({
      agentConfig: { name: 'claude', configDir: testDir },
      server: { port: 5175, appBaseUrl: 'http://localhost:5175' },
    });
    const modules: Record<string, ModuleState> = {
      browser: makeModuleState(true),
    };
    const manifests = new Map<string, ModuleManifest>([
      ['browser', makeManifest('browser', {
        skills: [{ name: 'browser-skill', content: 'Use Camoufox for browsing.' }],
      })],
    ]);

    regenerateAgentConfig(config, undefined, modules, manifests);

    const skillPath = join(testDir, 'skills', 'browser-skill', 'SKILL.md');
    expect(existsSync(skillPath)).toBe(true);
    const content = readFileSync(skillPath, 'utf-8');
    expect(content).toContain('Use Camoufox for browsing.');
    expect(existsSync(join(testDir, 'skills', 'browser-skill', '.module-generated'))).toBe(true);
  });
});
