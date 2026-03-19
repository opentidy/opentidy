// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect, vi } from 'vitest';
import { setupUserInfoRoute, type UserInfoDeps } from './user-info.js';
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

function makeDeps(overrides: Partial<UserInfoDeps> = {}): UserInfoDeps {
  return {
    loadConfig: () => makeConfig(),
    saveConfig: vi.fn(),
    ...overrides,
  };
}

describe('POST /setup/user-info', () => {
  it('saves name and language to config and returns 200', async () => {
    const saveConfig = vi.fn();
    const deps = makeDeps({ saveConfig });
    const app = setupUserInfoRoute(deps);

    const res = await app.request('/setup/user-info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Alice', language: 'fr' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
    expect(body.section).toBe('user-info');

    expect(saveConfig).toHaveBeenCalledOnce();
    const savedConfig = saveConfig.mock.calls[0][0] as OpenTidyConfig;
    expect(savedConfig.userInfo.name).toBe('Alice');
    expect(savedConfig.language).toBe('fr');
  });

  it('returns 400 and does NOT call saveConfig when name is empty', async () => {
    const saveConfig = vi.fn();
    const deps = makeDeps({ saveConfig });
    const app = setupUserInfoRoute(deps);

    const res = await app.request('/setup/user-info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '', language: 'en' }),
    });

    expect(res.status).toBe(400);
    expect(saveConfig).not.toHaveBeenCalled();
  });
});
