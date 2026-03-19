// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { Hono } from 'hono';
import { loadConfig, saveConfig } from '../../shared/config.js';
import { regenerateAgentConfig } from '../../shared/agent-config.js';
import type { McpDeps } from './list.js';

const CURATED_NAMES = ['gmail', 'camoufox', 'whatsapp'] as const;

export function toggleMcpRoute(deps: McpDeps) {
  const app = new Hono();

  app.post('/mcp/curated/:name/toggle', (c) => {
    const name = c.req.param('name');
    if (!CURATED_NAMES.includes(name as any)) {
      return c.json({ error: `Unknown curated MCP: ${name}` }, 400);
    }

    const config = loadConfig(deps.configPath);
    const curated = config.mcp.curated[name as keyof typeof config.mcp.curated];
    curated.enabled = !curated.enabled;
    saveConfig(deps.configPath, config);
    regenerateAgentConfig(config, deps.mcpEnvDir);

    return c.json(config.mcp);
  });

  return app;
}
