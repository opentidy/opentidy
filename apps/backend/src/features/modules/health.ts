// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { Hono } from 'hono';
import type { ModuleRouteDeps } from './types.js';

export function moduleHealthRoute(deps: ModuleRouteDeps) {
  const app = new Hono();

  app.get('/modules/:name/health', (c) => {
    const name = c.req.param('name');
    console.log(`[modules] GET /modules/${name}/health`);

    const config = deps.loadConfig();

    if (!deps.manifests.has(name) && !config.modules[name]) {
      return c.json({ error: 'Module not found' }, 404);
    }

    const state = config.modules[name];
    return c.json({ health: state?.health ?? 'unknown' });
  });

  return app;
}
