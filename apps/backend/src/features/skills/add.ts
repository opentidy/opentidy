// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { Hono } from 'hono';
import { loadConfig, saveConfig } from '../../shared/config.js';
import { regenerateAgentConfig } from '../../shared/agent-config.js';
import { UserSkillSchema } from '@opentidy/shared';
import type { SkillsDeps } from './list.js';

export function addSkillRoute(deps: SkillsDeps) {
  const app = new Hono();

  app.post('/skills/user', async (c) => {
    const body = await c.req.json();
    const parsed = UserSkillSchema.parse(body);

    const config = loadConfig(deps.configPath);

    // Check for duplicate name
    if (config.skills.user.some(s => s.name === parsed.name)) {
      return c.json({ error: `Skill already exists: ${parsed.name}` }, 409);
    }

    config.skills.user.push(parsed);
    saveConfig(deps.configPath, config);
    regenerateAgentConfig(config);

    return c.json(config.skills);
  });

  return app;
}
