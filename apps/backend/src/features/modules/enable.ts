// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { Hono } from 'hono';
import type { ModuleRouteDeps } from './types.js';

export function enableModuleRoute(deps: ModuleRouteDeps) {
  const app = new Hono();

  app.post('/modules/:name/enable', async (c) => {
    const name = c.req.param('name');
    console.log(`[modules] POST /modules/${name}/enable`);

    const config = deps.loadConfig();
    if (!deps.manifests.has(name) && !config.modules[name]) {
      return c.json({ error: 'Module not found' }, 404);
    }

    await deps.lifecycle.enable(name);
    return c.json({ success: true });
  });

  return app;
}
