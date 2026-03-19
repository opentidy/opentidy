// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { Hono } from 'hono';
import { rmSync } from 'fs';
import { join } from 'path';
import { loadConfig, saveConfig } from '../../shared/config.js';
import { regenerateAgentConfig } from '../../shared/agent-config.js';
import type { McpDeps } from './list.js';

export function removeMcpRoute(deps: McpDeps) {
  const app = new Hono();

  app.delete('/mcp/marketplace/:name', (c) => {
    const name = c.req.param('name');
    const config = loadConfig(deps.configPath);

    if (!config.mcp.marketplace[name]) {
      return c.json({ error: `MCP server not found: ${name}` }, 404);
    }

    // Clean up env file if exists
    const envFile = config.mcp.marketplace[name].envFile;
    if (envFile) {
      try { rmSync(join(deps.mcpEnvDir, envFile)); } catch { /* may not exist */ }
    }

    delete config.mcp.marketplace[name];
    saveConfig(deps.configPath, config);
    regenerateAgentConfig(config, deps.mcpEnvDir);

    return c.json(config.mcp);
  });

  return app;
}
