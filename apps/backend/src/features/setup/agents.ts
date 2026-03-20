// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { Hono } from 'hono';
import type { AgentName } from '@opentidy/shared';

const AGENT_DEFS: Record<AgentName, {
  label: string;
  badge: 'stable' | 'experimental' | 'coming-soon';
  installCommand: string;
  authCommand: string;
}> = {
  claude: {
    label: 'Claude Code',
    badge: 'stable',
    installCommand: 'curl -fsSL https://claude.ai/install.sh | sh',
    authCommand: 'claude auth login',
  },
  gemini: {
    label: 'Gemini CLI',
    badge: 'coming-soon',
    installCommand: 'npm install -g @google/gemini-cli',
    authCommand: 'gemini auth login',
  },
  copilot: {
    label: 'Copilot CLI',
    badge: 'coming-soon',
    installCommand: 'npm install -g @github/copilot-cli',
    authCommand: 'copilot auth login',
  },
};

const AGENT_NAMES = Object.keys(AGENT_DEFS) as AgentName[];

export interface AgentSetupDeps {
  checkInstalled: (name: AgentName) => boolean;
  checkAuth: (name: AgentName) => boolean;
  getActiveAgent: () => AgentName;
}

export function setupAgentsRoute(deps: AgentSetupDeps) {
  const app = new Hono();

  app.get('/setup/agents', (c) => {
    console.log('[setup] GET /setup/agents');
    const activeAgent = deps.getActiveAgent();

    const agents = AGENT_NAMES.map((name) => ({
      name,
      label: AGENT_DEFS[name].label,
      badge: AGENT_DEFS[name].badge,
      installed: deps.checkInstalled(name),
      authed: deps.checkAuth(name),
      active: name === activeAgent,
    }));

    return c.json(agents);
  });

  app.get('/setup/agents/install-command', (c) => {
    console.log('[setup] GET /setup/agents/install-command');
    const agent = c.req.query('agent');

    if (!agent || !AGENT_NAMES.includes(agent as AgentName)) {
      return c.json({ error: 'Unknown or missing agent' }, 400);
    }

    const def = AGENT_DEFS[agent as AgentName];
    return c.json({
      installCommand: def.installCommand,
      authCommand: def.authCommand,
    });
  });

  return app;
}
