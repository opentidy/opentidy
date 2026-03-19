// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { Hono } from 'hono';
import { execFileSync } from 'child_process';
import { loadConfig, saveConfig } from '../../shared/config.js';
import { regenerateAgentConfig } from '../../shared/agent-config.js';
import type { McpDeps } from './list.js';
import type { AgentName } from '@opentidy/shared';

interface AgentInfo {
  name: AgentName;
  label: string;
  binary: string;
  installed: boolean;
  version: string | null;
  authenticated: boolean;
  experimental: boolean;
  active: boolean;
  configDir: string;
}

const AGENTS: { name: AgentName; label: string; binary: string; experimental: boolean }[] = [
  { name: 'claude', label: 'Claude Code', binary: 'claude', experimental: false },
  { name: 'gemini', label: 'Gemini CLI', binary: 'gemini', experimental: true },
  { name: 'copilot', label: 'Copilot CLI', binary: 'copilot', experimental: true },
];

function checkBinary(binary: string): { installed: boolean; version: string | null } {
  try {
    const output = execFileSync(binary, ['--version'], { encoding: 'utf-8', timeout: 5_000, stdio: 'pipe' }).trim();
    // Extract version — take first line, strip prefix
    const version = output.split('\n')[0].replace(/^[^0-9]*/, '').trim() || output.split('\n')[0].trim();
    return { installed: true, version };
  } catch {
    return { installed: false, version: null };
  }
}

export function agentsRoute(deps: McpDeps) {
  const app = new Hono();

  app.get('/agents', (c) => {
    const config = loadConfig(deps.configPath);
    const activeName = config.agentConfig?.name || 'claude';

    const agents: AgentInfo[] = AGENTS.map(agent => {
      const { installed, version } = checkBinary(agent.binary);
      return {
        ...agent,
        installed,
        version,
        authenticated: installed && agent.name === activeName,
        active: agent.name === activeName,
        configDir: agent.name === activeName ? (config.agentConfig?.configDir || '') : '',
      };
    });

    return c.json({ active: activeName, agents });
  });

  app.post('/agents/active', async (c) => {
    const { name } = await c.req.json<{ name: AgentName }>();
    const valid = AGENTS.find(a => a.name === name);
    if (!valid) {
      return c.json({ error: `Unknown agent: ${name}` }, 400);
    }
    if (valid.experimental) {
      return c.json({ error: `${valid.label} is experimental and not yet supported` }, 400);
    }

    const config = loadConfig(deps.configPath);
    config.agentConfig.name = name;
    saveConfig(deps.configPath, config);
    regenerateAgentConfig(config, deps.mcpEnvDir);

    return c.json({ active: name });
  });

  return app;
}
