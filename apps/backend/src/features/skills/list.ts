// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { Hono } from 'hono';
import { loadConfig } from '../../shared/config.js';

export interface SkillsDeps {
  configPath: string;
  agentConfigDir: string;
}

export function listSkillsRoute(deps: SkillsDeps) {
  const app = new Hono();

  app.get('/skills', (c) => {
    const config = loadConfig(deps.configPath);
    return c.json(config.skills);
  });

  return app;
}
