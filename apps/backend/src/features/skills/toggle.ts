// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { Hono } from 'hono';
import { loadConfig, saveConfig } from '../../shared/config.js';
import { regenerateAgentConfig } from '../../shared/agent-config.js';
import type { SkillsDeps } from './list.js';

export function toggleSkillRoute(deps: SkillsDeps) {
  const app = new Hono();

  app.post('/skills/curated/:name/toggle', (c) => {
    const name = c.req.param('name');
    const config = loadConfig(deps.configPath);

    if (!config.skills.curated[name]) {
      return c.json({ error: `Unknown curated skill: ${name}` }, 400);
    }

    config.skills.curated[name].enabled = !config.skills.curated[name].enabled;
    saveConfig(deps.configPath, config);
    regenerateAgentConfig(config);

    return c.json(config.skills);
  });

  return app;
}
