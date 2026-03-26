// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect, vi } from 'vitest';
import { disableModuleRoute } from './disable.js';
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

describe('disableModuleRoute', () => {
  it('disables a module and returns success', async () => {
    const deps = makeDeps();

    const app = disableModuleRoute(deps);
    const res = await app.request('/modules/email/disable', { method: 'POST' });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(deps.lifecycle.disable).toHaveBeenCalledWith('email', false);
  });

  it('calls lifecycle.disable even for unknown modules (idempotent)', async () => {
    const deps = makeDeps();

    const app = disableModuleRoute(deps);
    const res = await app.request('/modules/unknown/disable', { method: 'POST' });

    expect(res.status).toBe(200);
    expect(deps.lifecycle.disable).toHaveBeenCalledWith('unknown', false);
  });
});
