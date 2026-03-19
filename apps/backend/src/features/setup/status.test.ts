// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect } from 'vitest';
import { setupStatusRoute, type SetupDeps } from './status.js';
import type { OpenTidyConfig, AgentName } from '@opentidy/shared';

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

function makeDeps(overrides: Partial<SetupDeps> = {}): SetupDeps {
  return {
    loadConfig: () => makeConfig(),
    checkAgentInstalled: () => false,
    checkAgentAuth: () => false,
    ...overrides,
  };
}

describe('GET /setup/status', () => {
  it('returns setupComplete: false and all done: false for a fresh config', async () => {
    const app = setupStatusRoute(makeDeps());
    const res = await app.request('/setup/status');
    expect(res.status).toBe(200);
    const body = await res.json() as any;

    expect(body.setupComplete).toBe(false);
    expect(body.userInfo.done).toBe(false);
    expect(body.agents.done).toBe(false);
    expect(body.agents.connected).toEqual([]);
    // agentConfig.name defaults to 'claude' in the config schema
    expect(body.agents.active).toBe('claude');
    expect(body.permissions.done).toBe(true);
  });

  it('returns setupComplete: true and agents.connected when config has name and agent is installed+authed', async () => {
    const deps = makeDeps({
      loadConfig: () => makeConfig({
        setupComplete: true,
        userInfo: { name: 'Alice', email: 'alice@example.com', company: 'Acme' },
        agentConfig: { name: 'claude', configDir: '/tmp/claude' },
      }),
      checkAgentInstalled: (agent: AgentName) => agent === 'claude',
      checkAgentAuth: (agent: AgentName) => agent === 'claude',
    });

    const app = setupStatusRoute(deps);
    const res = await app.request('/setup/status');
    expect(res.status).toBe(200);
    const body = await res.json() as any;

    expect(body.setupComplete).toBe(true);
    expect(body.userInfo.done).toBe(true);
    expect(body.agents.done).toBe(true);
    expect(body.agents.connected).toEqual(['claude']);
    expect(body.agents.active).toBe('claude');
  });

  it('agents.done is false when installed but not authed', async () => {
    const deps = makeDeps({
      checkAgentInstalled: () => true,
      checkAgentAuth: () => false,
    });
    const app = setupStatusRoute(deps);
    const res = await app.request('/setup/status');
    const body = await res.json() as any;

    expect(body.agents.done).toBe(false);
    expect(body.agents.connected).toEqual([]);
  });

  it('services.telegram is connected when botToken is present', async () => {
    const deps = makeDeps({
      loadConfig: () => makeConfig({
        telegram: { botToken: 'bot12345:ABC', chatId: '123' },
      }),
    });
    const app = setupStatusRoute(deps);
    const res = await app.request('/setup/status');
    const body = await res.json() as any;

    expect(body.services.telegram.status).toBe('connected');
  });

  it('services.telegram is not_configured when botToken is empty', async () => {
    const app = setupStatusRoute(makeDeps());
    const res = await app.request('/setup/status');
    const body = await res.json() as any;

    expect(body.services.telegram.status).toBe('not_configured');
  });

  it('services.gmail is connected when configured', async () => {
    const deps = makeDeps({
      loadConfig: () => makeConfig({
        mcp: {
          curated: {
            gmail: { enabled: true, configured: true },
            camoufox: { enabled: false, configured: false },
            whatsapp: { enabled: false, configured: false, wacliPath: '', mcpServerPath: '' },
          },
          marketplace: {},
        },
      }),
    });
    const app = setupStatusRoute(deps);
    const res = await app.request('/setup/status');
    const body = await res.json() as any;

    expect(body.services.gmail.status).toBe('connected');
  });

  it('services.gmail is not_configured when not configured', async () => {
    const app = setupStatusRoute(makeDeps());
    const res = await app.request('/setup/status');
    const body = await res.json() as any;

    expect(body.services.gmail.status).toBe('not_configured');
  });
});
