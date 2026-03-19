// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect, vi } from 'vitest';
import { setupCompleteRoute, type CompleteDeps } from './complete.js';
import type { OpenTidyConfig } from '@opentidy/shared';

function makeConfig(overrides: Partial<OpenTidyConfig> = {}): OpenTidyConfig {
  return {
    version: 1,
    telegram: { botToken: '', chatId: '' },
    auth: { bearerToken: '' },
    server: { port: 5175, appBaseUrl: '' },
    workspace: { dir: '', lockDir: '' },
    update: {
      autoUpdate: false,
      checkInterval: '6h',
      notifyBeforeUpdate: false,
      delayBeforeUpdate: '0',
      keepReleases: 3,
    },
    agentConfig: { name: 'claude', configDir: '' },
    language: 'en',
    receivers: [],
    userInfo: { name: '', email: '', company: '' },
    mcp: {
      curated: {
        gmail: { enabled: false, configured: false },
        camoufox: { enabled: false, configured: false },
        whatsapp: { enabled: false, configured: false, wacliPath: '', mcpServerPath: '' },
      },
      marketplace: {},
    },
    skills: { curated: {}, user: [] },
    ...overrides,
  };
}

function makeDeps(overrides: Partial<CompleteDeps> = {}): CompleteDeps {
  return {
    loadConfig: () => makeConfig(),
    saveConfig: vi.fn(),
    ...overrides,
  };
}

describe('POST /setup/complete', () => {
  it('sets setupComplete to true and calls saveConfig', async () => {
    const saveConfig = vi.fn();
    const deps = makeDeps({ saveConfig });
    const app = setupCompleteRoute(deps);

    const res = await app.request('/setup/complete', { method: 'POST' });

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.success).toBe(true);

    expect(saveConfig).toHaveBeenCalledOnce();
    const savedConfig = saveConfig.mock.calls[0][0] as OpenTidyConfig;
    expect(savedConfig.setupComplete).toBe(true);
  });

  it('saves setupComplete: true even if it was false before', async () => {
    const saveConfig = vi.fn();
    const deps = makeDeps({
      loadConfig: () => makeConfig({ setupComplete: false }),
      saveConfig,
    });
    const app = setupCompleteRoute(deps);

    await app.request('/setup/complete', { method: 'POST' });

    const savedConfig = saveConfig.mock.calls[0][0] as OpenTidyConfig;
    expect(savedConfig.setupComplete).toBe(true);
  });
});
