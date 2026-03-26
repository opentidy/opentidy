// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect, vi } from 'vitest';
import { moduleHealthRoute } from './health.js';
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
      registerCustomModule: vi.fn(),
    },
    saveConfig: vi.fn(),
  };
}

describe('moduleHealthRoute', () => {
  it('returns health status from config', async () => {
    const deps = makeDeps(makeConfig({
      modules: { email: { enabled: true, source: 'curated', health: 'ok' } },
    }));
    deps.manifests.set('email', {
      name: 'email', label: 'Email', description: 'Email integration', version: '1.0.0',
    });

    const app = moduleHealthRoute(deps);
    const res = await app.request('/modules/email/health');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ health: 'ok' });
  });

  it('returns unknown when module has no health info', async () => {
    const deps = makeDeps(makeConfig({
      modules: { email: { enabled: true, source: 'curated' } },
    }));
    deps.manifests.set('email', {
      name: 'email', label: 'Email', description: 'Email integration', version: '1.0.0',
    });

    const app = moduleHealthRoute(deps);
    const res = await app.request('/modules/email/health');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ health: 'unknown' });
  });

  it('returns unknown for a curated module not yet in config', async () => {
    const deps = makeDeps();
    deps.manifests.set('email', {
      name: 'email', label: 'Email', description: 'Email integration', version: '1.0.0',
    });

    const app = moduleHealthRoute(deps);
    const res = await app.request('/modules/email/health');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ health: 'unknown' });
  });

  it('returns 404 for unknown module', async () => {
    const deps = makeDeps();

    const app = moduleHealthRoute(deps);
    const res = await app.request('/modules/nonexistent/health');

    expect(res.status).toBe(404);
    const body = await res.json() as any;
    expect(body.error).toBe('Module not found');
  });
});
