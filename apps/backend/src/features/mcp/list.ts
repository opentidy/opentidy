// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { Hono } from 'hono';
import { loadConfig } from '../../shared/config.js';

export interface McpDeps {
  configPath: string;
  agentConfigDir: string;
  mcpEnvDir: string;
}

export function listMcpRoute(deps: McpDeps) {
  const app = new Hono();

  app.get('/mcp', (c) => {
    const config = loadConfig(deps.configPath);
    return c.json(config.mcp);
  });

  return app;
}
