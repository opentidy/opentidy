// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect, vi } from 'vitest';
import { listModulesRoute } from './list.js';
import type { OpenTidyConfig, ModuleManifest } from '@opentidy/shared';
import type { ModuleRouteDeps } from './types.js';

function makeConfig(overrides: Partial<OpenTidyConfig> = {}): OpenTidyConfig {
  return {
    version: 1,
    auth: { bearerToken: 'test-token' },
    server: { port: 3000, appBaseUrl: 'http://localhost:3000' },
    workspace: { dir: '/tmp/workspace', lockDir: '/tmp/locks' },
    update: { autoUpdate: false, checkInterval: '6h', notifyBeforeUpdate: false, delayBeforeUpdate: '0', keepReleases: 2 },
    agentConfig: { name: 'claude', configDir: '/tmp/claude' },
    language: 'en',
    modules: {},
    userInfo: { name: 'Test User', email: 'test@example.com', company: 'Test Co' },
    ...overrides,
  };
}

function makeDeps(config?: OpenTidyConfig): ModuleRouteDeps {
  return {
    manifests: new Map<string, ModuleManifest>(),
    loadConfig: vi.fn(() => config ?? makeConfig()),
    lifecycle: {
      enable: vi.fn().mockResolvedValue(undefined),
      disable: vi.fn().mockResolvedValue(undefined),
      configure: vi.fn().mockResolvedValue(undefined),
    },
    saveConfig: vi.fn(),
  };
}

describe('listModulesRoute', () => {
  it('returns empty list when no manifests and no custom modules', async () => {
    const deps = makeDeps();
    const app = listModulesRoute(deps);

    const res = await app.request('/modules');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ modules: [] });
  });

  it('returns curated modules from manifests', async () => {
    const deps = makeDeps(makeConfig({
      modules: { gmail: { enabled: true, source: 'curated' } },
    }));
    deps.manifests.set('gmail', {
      name: 'gmail',
      label: 'Gmail',
      description: 'Gmail integration',
      version: '1.0.0',
      mcpServers: [{ name: 'gmail-server', command: 'node', args: ['gmail.js'] }],
      skills: [{ name: 'email-skill', content: 'send emails' }],
      receivers: [{ name: 'gmail-webhook', mode: 'webhook', source: 'gmail' }],
    });

    const app = listModulesRoute(deps);
    const res = await app.request('/modules');
    expect(res.status).toBe(200);

    const body = (await res.json() as any).modules;
    expect(body).toHaveLength(1);
    expect(body[0].name).toBe('gmail');
    expect(body[0].label).toBe('Gmail');
    expect(body[0].enabled).toBe(true);
    expect(body[0].source).toBe('curated');
    expect(body[0].components.mcpServers).toEqual(['gmail-server']);
    expect(body[0].components.skills).toEqual(['email-skill']);
    expect(body[0].components.receivers).toEqual(['gmail-webhook']);
  });

  it('marks setup.configured=false when required config fields are missing', async () => {
    const deps = makeDeps(makeConfig({
      modules: { gmail: { enabled: false, source: 'curated', config: {} } },
    }));
    deps.manifests.set('gmail', {
      name: 'gmail',
      label: 'Gmail',
      description: 'Gmail integration',
      version: '1.0.0',
      setup: {
        configFields: [
          { key: 'apiKey', label: 'API Key', type: 'password', required: true },
        ],
      },
    });

    const app = listModulesRoute(deps);
    const res = await app.request('/modules');
    const body = (await res.json() as any).modules;

    expect(body[0].setup.configured).toBe(false);
  });

  it('includes custom modules from config that are not in manifests', async () => {
    const deps = makeDeps(makeConfig({
      modules: { 'my-plugin': { enabled: false, source: 'custom' } },
    }));

    const app = listModulesRoute(deps);
    const res = await app.request('/modules');
    const body = (await res.json() as any).modules;

    expect(body).toHaveLength(1);
    expect(body[0].name).toBe('my-plugin');
    expect(body[0].source).toBe('custom');
  });
});
