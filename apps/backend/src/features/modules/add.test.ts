// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect, vi } from 'vitest';
import { addModuleRoute } from './add.js';
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
  const storedConfig = config ?? makeConfig();
  return {
    manifests: new Map<string, ModuleManifest>(),
    loadConfig: vi.fn(() => storedConfig),
    lifecycle: {
      enable: vi.fn().mockResolvedValue(undefined),
      disable: vi.fn().mockResolvedValue(undefined),
      configure: vi.fn().mockResolvedValue(undefined),
      registerCustomModule: vi.fn(),
    },
    saveConfig: vi.fn(),
  };
}

describe('addModuleRoute', () => {
  it('adds a custom module and returns 201 with module info', async () => {
    const deps = makeDeps();

    const app = addModuleRoute(deps);
    const res = await app.request('/modules/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'my-plugin',
        manifest: {
          name: 'my-plugin',
          label: 'My Plugin',
          description: 'A custom plugin',
          version: '0.1.0',
        },
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
    expect(body.module.name).toBe('my-plugin');
    expect(body.module.label).toBe('My Plugin');
    expect(body.module.source).toBe('custom');
    expect(body.module.enabled).toBe(false);

    // Verify registration was called via lifecycle
    expect(deps.lifecycle.registerCustomModule).toHaveBeenCalledOnce();
    expect(deps.lifecycle.registerCustomModule).toHaveBeenCalledWith('my-plugin', expect.objectContaining({ name: 'my-plugin' }));
  });

  it('returns 400 when name is missing', async () => {
    const deps = makeDeps();

    const app = addModuleRoute(deps);
    const res = await app.request('/modules/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ manifest: { name: 'x', label: 'X', description: '', version: '1.0.0' } }),
    });

    expect(res.status).toBe(400);
    const body = await res.json() as any;
    expect(body.error).toBe('name and manifest are required');
  });

  it('returns 400 when manifest is invalid (Zod validation)', async () => {
    const deps = makeDeps();

    const app = addModuleRoute(deps);
    const res = await app.request('/modules/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'bad', manifest: { missing: 'fields' } }),
    });

    expect(res.status).toBe(400);
    const body = await res.json() as any;
    expect(body.error).toBe('Invalid manifest');
  });
});
