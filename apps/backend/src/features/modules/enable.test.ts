// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect, vi } from 'vitest';
import { enableModuleRoute } from './enable.js';
import * as checks from './checks.js';
import type { OpenTidyConfig, ModuleManifest } from '@opentidy/shared';
import type { ModuleRouteDeps } from './types.js';

vi.mock('./checks.js', () => ({
  runCheckCommand: vi.fn(() => true),
  isModuleConfigured: vi.fn(() => true),
}));

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

describe('enableModuleRoute', () => {
  it('enables a known module and returns success', async () => {
    const deps = makeDeps();
    deps.manifests.set('email', {
      name: 'email', label: 'Email', description: 'Email integration', version: '1.0.0',
    });

    const app = enableModuleRoute(deps);
    const res = await app.request('/modules/email/enable', { method: 'POST' });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(deps.lifecycle.enable).toHaveBeenCalledWith('email');
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

  it('returns 422 when checkCommand fails', async () => {
    vi.mocked(checks.runCheckCommand).mockReturnValue(false);

    const deps = makeDeps();
    deps.manifests.set('email', {
      name: 'email', label: 'Email', description: 'Email', version: '1.0.0',
      setup: { authCommand: 'echo auth', checkCommand: 'test -f ~/.email-mcp/credentials.json' },
    });

    const app = enableModuleRoute(deps);
    const res = await app.request('/modules/email/enable', { method: 'POST' });

    expect(res.status).toBe(422);
    const body = await res.json() as any;
    expect(body.error).toBe('Module setup incomplete');
    expect(deps.lifecycle.enable).not.toHaveBeenCalled();
  });

  it('returns 422 when required config fields are missing', async () => {
    vi.mocked(checks.runCheckCommand).mockReturnValue(true);
    vi.mocked(checks.isModuleConfigured).mockReturnValue(false);

    const deps = makeDeps();
    deps.manifests.set('telegram', {
      name: 'telegram', label: 'Telegram', description: 'Telegram', version: '1.0.0',
      setup: {
        configFields: [
          { key: 'botToken', label: 'Bot Token', type: 'password', required: true },
          { key: 'chatId', label: 'Chat ID', type: 'text', required: true },
        ],
      },
    });

    const app = enableModuleRoute(deps);
    const res = await app.request('/modules/telegram/enable', { method: 'POST' });

    expect(res.status).toBe(422);
    const body = await res.json() as any;
    expect(body.error).toBe('Module not configured');
    expect(body.missing).toEqual(['botToken', 'chatId']);
    expect(deps.lifecycle.enable).not.toHaveBeenCalled();
  });

  it('enables module when checkCommand passes and config is complete', async () => {
    vi.mocked(checks.runCheckCommand).mockReturnValue(true);
    vi.mocked(checks.isModuleConfigured).mockReturnValue(true);

    const deps = makeDeps(makeConfig({
      modules: { telegram: { enabled: false, source: 'curated', config: { botToken: 'tok', chatId: '123' } } },
    }));
    deps.manifests.set('telegram', {
      name: 'telegram', label: 'Telegram', description: 'Telegram', version: '1.0.0',
      setup: {
        configFields: [
          { key: 'botToken', label: 'Bot Token', type: 'password', required: true },
          { key: 'chatId', label: 'Chat ID', type: 'text', required: true },
        ],
      },
    });

    const app = enableModuleRoute(deps);
    const res = await app.request('/modules/telegram/enable', { method: 'POST' });

    expect(res.status).toBe(200);
    expect(deps.lifecycle.enable).toHaveBeenCalledWith('telegram');
  });
});
