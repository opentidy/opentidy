// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { Hono } from 'hono';
import type { ModuleRouteDeps } from './types.js';

export function restartModuleRoute(deps: ModuleRouteDeps) {
  const app = new Hono();

  app.post('/modules/:name/restart', async (c) => {
    const name = c.req.param('name');
    console.log(`[modules] POST /modules/${name}/restart`);

    if (!deps.lifecycle.restartDaemon) {
      return c.json({ error: 'Restart not available' }, 501);
    }

    const config = deps.loadConfig();
    if (!deps.manifests.has(name) && !config.modules[name]) {
      return c.json({ error: 'Module not found' }, 404);
    }

    try {
      await deps.lifecycle.restartDaemon(name);
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: (err as Error).message }, 500);
    }
  });

  return app;
}
