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

function checkOnboarded(agentConfigDir: string, name: AgentName): boolean {
  // Claude Code stores hasCompletedOnboarding in .claude.json after the full onboarding wizard.
  // Just checking auth status is not enough; the user may have logged in via OAuth but not
  // finished the theme/permissions steps. Without this flag, Claude Code re-shows the onboarding.
  if (name !== 'claude') return true;
  // Agent config dir must exist; if cleared (e.g., after reset), agent is not onboarded
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

    const agents = AGENT_NAMES.map((name) => ({
      name,
      label: AGENT_DEFS[name].label,
      badge: AGENT_DEFS[name].badge,
      installed: deps.checkInstalled(name),
      authed: deps.checkAuth(name),
      onboarded: checkOnboarded(deps.agentConfigDir, name),
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
