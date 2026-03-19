// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect, vi } from 'vitest';
import { removeModuleRoute } from './remove.js';
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

describe('removeModuleRoute', () => {
  it('removes a custom module and returns success', async () => {
    const config = makeConfig({
      modules: { 'my-plugin': { enabled: false, source: 'custom' } },
    });
    const deps = makeDeps(config);
    deps.manifests.set('my-plugin', {
      name: 'my-plugin', label: 'My Plugin', description: 'Custom', version: '1.0.0',
    });

    const app = removeModuleRoute(deps);
    const res = await app.request('/modules/my-plugin', { method: 'DELETE' });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(deps.saveConfig).toHaveBeenCalledOnce();
    expect(deps.manifests.has('my-plugin')).toBe(false);
  });

  it('disables an enabled custom module before removing', async () => {
    const config = makeConfig({
      modules: { 'my-plugin': { enabled: true, source: 'custom' } },
    });
    const deps = makeDeps(config);

    const app = removeModuleRoute(deps);
    const res = await app.request('/modules/my-plugin', { method: 'DELETE' });

    expect(res.status).toBe(200);
    expect(deps.lifecycle.disable).toHaveBeenCalledWith('my-plugin');
  });

  it('returns 400 when trying to remove a curated module', async () => {
    const config = makeConfig({
      modules: { gmail: { enabled: true, source: 'curated' } },
    });
    const deps = makeDeps(config);
    deps.manifests.set('gmail', {
      name: 'gmail', label: 'Gmail', description: 'Gmail integration', version: '1.0.0',
    });

    const app = removeModuleRoute(deps);
    const res = await app.request('/modules/gmail', { method: 'DELETE' });

    expect(res.status).toBe(400);
    const body = await res.json() as any;
    expect(body.error).toBe('Cannot remove curated module');
  });

  it('returns 404 for unknown module', async () => {
    const deps = makeDeps();

    const app = removeModuleRoute(deps);
    const res = await app.request('/modules/nonexistent', { method: 'DELETE' });

    expect(res.status).toBe(404);
    const body = await res.json() as any;
    expect(body.error).toBe('Module not found');
  });
});
