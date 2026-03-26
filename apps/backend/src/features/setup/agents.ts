// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { Hono } from 'hono';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import type { AgentName } from '@opentidy/shared';
import { getConfigPath } from '../../shared/config.js';

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
    authCommand: 'claude',
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
  agentConfigDir: string;
}

function checkOnboarded(agentConfigDir: string, name: AgentName, authed: boolean): boolean {
  // If auth is confirmed, consider the agent ready — the onboarding wizard is a UX detail
  // that doesn't affect OpenTidy's ability to spawn sessions.
  if (name !== 'claude') return true;
  if (authed) return true;
  // Fallback: check .claude.json if auth check didn't confirm
  if (!agentConfigDir || !fs.existsSync(agentConfigDir)) return false;
  try {
    const statePath = path.join(agentConfigDir, '.claude.json');
    const data = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
    return data.hasCompletedOnboarding === true;
  } catch {
    return false;
  }
}

export function setupAgentsRoute(deps: AgentSetupDeps) {
  const app = new Hono();

  app.get('/setup/agents', (c) => {
    console.log('[setup] GET /setup/agents');
    const activeAgent = deps.getActiveAgent();

    const agents = AGENT_NAMES.map((name) => {
      const installed = deps.checkInstalled(name);
      const authed = deps.checkAuth(name);
      return {
        name,
        label: AGENT_DEFS[name].label,
        badge: AGENT_DEFS[name].badge,
        installed,
        authed,
        onboarded: checkOnboarded(deps.agentConfigDir, name, authed),
        active: name === activeAgent,
      };
    });

    return c.json(agents);
  });

  app.get('/setup/agents/install-command', (c) => {
    console.log('[setup] GET /setup/agents/install-command');
    const agent = c.req.query('agent');

    if (!agent || !AGENT_NAMES.includes(agent as AgentName)) {
      return c.json({ error: 'Unknown or missing agent' }, 400);
    }

    const def = AGENT_DEFS[agent as AgentName];
    // Build auth command with isolated config dir so auth goes to OpenTidy's agent config
    const configDir = path.join(path.dirname(getConfigPath()), 'agents', agent);
    const authWithEnv = `CLAUDE_CONFIG_DIR="${configDir}" ${def.authCommand}`;
    return c.json({
      installCommand: def.installCommand,
      authCommand: authWithEnv,
    });
  });

  // POST /setup/agents/disconnect: log out the agent from OpenTidy's isolated config
  app.post('/setup/agents/disconnect', (c) => {
    const agent = c.req.query('agent');
    console.log(`[setup] POST /setup/agents/disconnect agent=${agent}`);

    if (!agent || !AGENT_NAMES.includes(agent as AgentName)) {
      return c.json({ error: 'Unknown or missing agent' }, 400);
    }

    const configDir = path.join(path.dirname(getConfigPath()), 'agents', agent);
    try {
      execFileSync(agent, ['auth', 'logout'], {
        timeout: 10_000,
        stdio: 'pipe',
        env: { ...process.env, CLAUDE_CONFIG_DIR: configDir },
      });
    } catch {
      // Ignore, may already be logged out
    }

    return c.json({ success: true });
  });

  return app;
}
