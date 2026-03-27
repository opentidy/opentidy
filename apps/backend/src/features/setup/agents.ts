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

// Check if an agent has been explicitly connected through the setup wizard.
// Uses a marker file (.opentidy-connected) or Claude's own hasCompletedOnboarding flag.
// Does NOT rely on `claude auth status` which returns true for global OAuth sessions.
function isAgentConnected(agentConfigDir: string, name: AgentName): boolean {
  if (!agentConfigDir || !fs.existsSync(agentConfigDir)) return false;
  const markerPath = path.join(agentConfigDir, '.opentidy-connected');
  if (fs.existsSync(markerPath)) return true;

  // Detect Claude's own onboarding completion (set when user runs claude interactively)
  if (name === 'claude') {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(agentConfigDir, '.claude.json'), 'utf-8'));
      if (data.hasCompletedOnboarding === true) {
        fs.writeFileSync(markerPath, new Date().toISOString());
        return true;
      }
    } catch { /* not completed */ }
  }
  return false;
}

export function setupAgentsRoute(deps: AgentSetupDeps) {
  const app = new Hono();

  app.get('/setup/agents', (c) => {
    console.log('[setup] GET /setup/agents');
    const activeAgent = deps.getActiveAgent();

    const agents = AGENT_NAMES.map((name) => {
      const installed = deps.checkInstalled(name);
      const connected = isAgentConnected(deps.agentConfigDir, name);
      return {
        name,
        label: AGENT_DEFS[name].label,
        badge: AGENT_DEFS[name].badge,
        installed,
        authed: connected,
        onboarded: connected,
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

  // POST /setup/agents/confirm-connection: verify auth and write connection marker
  // Called when user closes the terminal drawer after completing the connect flow
  app.post('/setup/agents/confirm-connection', (c) => {
    const agent = c.req.query('agent');
    console.log(`[setup] POST /setup/agents/confirm-connection agent=${agent}`);

    if (!agent || !AGENT_NAMES.includes(agent as AgentName)) {
      return c.json({ error: 'Unknown or missing agent' }, 400);
    }

    const authed = deps.checkAuth(agent as AgentName);
    if (!authed) {
      return c.json({ connected: false });
    }

    const configDir = path.join(path.dirname(getConfigPath()), 'agents', agent);
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(path.join(configDir, '.opentidy-connected'), new Date().toISOString());
    return c.json({ connected: true });
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

    // Remove connection marker
    try { fs.rmSync(path.join(configDir, '.opentidy-connected'), { force: true }); } catch { /* ignore */ }

    return c.json({ success: true });
  });

  return app;
}
