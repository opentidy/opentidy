// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { Hono } from 'hono';
import { rmSync } from 'fs';
import { join } from 'path';
import { loadConfig, saveConfig } from '../../shared/config.js';
import { regenerateAgentConfig } from '../../shared/agent-config.js';
import type { SkillsDeps } from './list.js';

export function removeSkillRoute(deps: SkillsDeps) {
  const app = new Hono();

  app.delete('/skills/user/:name', (c) => {
    const name = c.req.param('name');
    const config = loadConfig(deps.configPath);

    const idx = config.skills.user.findIndex(s => s.name === name);
    if (idx === -1) {
      return c.json({ error: `Skill not found: ${name}` }, 404);
    }

    // Remove symlink from config dir before removing from config
    const skillPath = join(deps.agentConfigDir, 'skills', name);
    rmSync(skillPath, { recursive: true, force: true });

    config.skills.user.splice(idx, 1);
    saveConfig(deps.configPath, config);
    regenerateAgentConfig(config);

    return c.json(config.skills);
  });

  return app;
}
