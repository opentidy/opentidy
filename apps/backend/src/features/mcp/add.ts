// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { Hono } from 'hono';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { loadConfig, saveConfig } from '../../shared/config.js';
import { regenerateAgentConfig } from '../../shared/agent-config.js';
import { MarketplaceMcpSchema } from '@opentidy/shared';
import { z } from 'zod';
import type { McpDeps } from './list.js';

const AddMcpBodySchema = z.object({
  name: z.string().regex(/^[a-z0-9-]+$/),
  env: z.record(z.string()).optional(),
}).merge(MarketplaceMcpSchema);

export function addMcpRoute(deps: McpDeps) {
  const app = new Hono();

  app.post('/mcp/marketplace', async (c) => {
    const body = await c.req.json();
    const parsed = AddMcpBodySchema.parse(body);
    const { name, env, ...mcpDef } = parsed;

    const config = loadConfig(deps.configPath);
    config.mcp.marketplace[name] = mcpDef;

    // Write env vars to separate file if provided
    if (env && Object.keys(env).length > 0) {
      mkdirSync(deps.mcpEnvDir, { recursive: true });
      const envContent = Object.entries(env).map(([k, v]) => `${k}=${v}`).join('\n') + '\n';
      const envFile = `mcp-${name}.env`;
      writeFileSync(join(deps.mcpEnvDir, envFile), envContent);
      config.mcp.marketplace[name].envFile = envFile;
    }

    saveConfig(deps.configPath, config);
    regenerateAgentConfig(config, deps.mcpEnvDir);

    return c.json(config.mcp);
  });

  return app;
}
