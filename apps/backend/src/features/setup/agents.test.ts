// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect } from 'vitest';
import { setupAgentsRoute, type AgentSetupDeps } from './agents.js';
import type { AgentName } from '@opentidy/shared';

function makeDeps(overrides: Partial<AgentSetupDeps> = {}): AgentSetupDeps {
  return {
    checkInstalled: () => false,
    checkAuth: () => false,
    getActiveAgent: () => 'claude',
    agentConfigDir: '/tmp/opentidy-test-agents',
    ...overrides,
  };
}

describe('GET /setup/agents', () => {
  it('returns all 3 agents with install/auth status', async () => {
    const app = setupAgentsRoute(makeDeps());
    const res = await app.request('/setup/agents');

    expect(res.status).toBe(200);
    const body = await res.json() as any;

    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(3);

    const names: AgentName[] = body.map((a: any) => a.name);
    expect(names).toContain('claude');
    expect(names).toContain('gemini');
    expect(names).toContain('copilot');
  });

  it('each agent has label, badge, installed, authed, onboarded, active fields', async () => {
    const app = setupAgentsRoute(makeDeps());
    const res = await app.request('/setup/agents');
    const body = await res.json() as any;

    for (const agent of body) {
      expect(typeof agent.name).toBe('string');
      expect(typeof agent.label).toBe('string');
      expect(['stable', 'experimental', 'coming-soon']).toContain(agent.badge);
      expect(typeof agent.installed).toBe('boolean');
      expect(typeof agent.authed).toBe('boolean');
      expect(typeof agent.onboarded).toBe('boolean');
      expect(typeof agent.active).toBe('boolean');
    }
  });

  it('reflects installed status from deps; authed requires connection marker', async () => {
    const deps = makeDeps({
      checkInstalled: (name) => name === 'claude',
      checkAuth: (name) => name === 'claude',
    });
    const app = setupAgentsRoute(deps);
    const res = await app.request('/setup/agents');
    const body = await res.json() as any;

    const claude = body.find((a: any) => a.name === 'claude');
    expect(claude.installed).toBe(true);
    // authed is false because no .opentidy-connected marker exists (fresh config dir)
    expect(claude.authed).toBe(false);

    const gemini = body.find((a: any) => a.name === 'gemini');
    expect(gemini.installed).toBe(false);
    expect(gemini.authed).toBe(false);
  });

  it('marks the active agent correctly', async () => {
    const deps = makeDeps({ getActiveAgent: () => 'gemini' });
    const app = setupAgentsRoute(deps);
    const res = await app.request('/setup/agents');
    const body = await res.json() as any;

    const gemini = body.find((a: any) => a.name === 'gemini');
    expect(gemini.active).toBe(true);

    const claude = body.find((a: any) => a.name === 'claude');
    expect(claude.active).toBe(false);
  });

  it('claude has stable badge', async () => {
    const app = setupAgentsRoute(makeDeps());
    const res = await app.request('/setup/agents');
    const body = await res.json() as any;

    const claude = body.find((a: any) => a.name === 'claude');
    expect(claude.badge).toBe('stable');
  });
});

describe('GET /setup/agents/install-command', () => {
  it('returns installCommand and authCommand for claude', async () => {
    const app = setupAgentsRoute(makeDeps());
    const res = await app.request('/setup/agents/install-command?agent=claude');

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(typeof body.installCommand).toBe('string');
    expect(typeof body.authCommand).toBe('string');
    expect(body.installCommand.length).toBeGreaterThan(0);
    expect(body.authCommand.length).toBeGreaterThan(0);
  });

  it('returns installCommand and authCommand for gemini', async () => {
    const app = setupAgentsRoute(makeDeps());
    const res = await app.request('/setup/agents/install-command?agent=gemini');

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(typeof body.installCommand).toBe('string');
    expect(typeof body.authCommand).toBe('string');
  });

  it('returns 400 for unknown agent', async () => {
    const app = setupAgentsRoute(makeDeps());
    const res = await app.request('/setup/agents/install-command?agent=invalid');

    expect(res.status).toBe(400);
    const body = await res.json() as any;
    expect(body.error).toBeDefined();
  });

  it('returns 400 when agent param is missing', async () => {
    const app = setupAgentsRoute(makeDeps());
    const res = await app.request('/setup/agents/install-command');

    expect(res.status).toBe(400);
  });
});
