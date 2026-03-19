// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect, vi } from 'vitest';
import { enableModuleRoute } from './enable.js';
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

describe('enableModuleRoute', () => {
  it('enables a known module and returns success', async () => {
    const deps = makeDeps();
    deps.manifests.set('gmail', {
      name: 'gmail', label: 'Gmail', description: 'Gmail integration', version: '1.0.0',
    });

    const app = enableModuleRoute(deps);
    const res = await app.request('/modules/gmail/enable', { method: 'POST' });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(deps.lifecycle.enable).toHaveBeenCalledWith('gmail');
  });

  it('enables a custom module known only in config', async () => {
    const deps = makeDeps(makeConfig({
      modules: { 'my-plugin': { enabled: false, source: 'custom' } },
    }));

    const app = enableModuleRoute(deps);
    const res = await app.request('/modules/my-plugin/enable', { method: 'POST' });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(deps.lifecycle.enable).toHaveBeenCalledWith('my-plugin');
  });

  it('returns 404 for unknown module', async () => {
    const deps = makeDeps();

    const app = enableModuleRoute(deps);
    const res = await app.request('/modules/nonexistent/enable', { method: 'POST' });

    expect(res.status).toBe(404);
    const body = await res.json() as any;
    expect(body.error).toBe('Module not found');
  });
});
