// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { Hono } from 'hono';
import type { ModuleRouteDeps } from './types.js';

export function removeModuleRoute(deps: ModuleRouteDeps) {
  const app = new Hono();

  app.delete('/modules/:name', async (c) => {
    const name = c.req.param('name');
    console.log(`[modules] DELETE /modules/${name}`);

    const config = deps.loadConfig();
    const state = config.modules[name];

    if (!state && !deps.manifests.has(name)) {
      return c.json({ error: 'Module not found' }, 404);
    }

    // Curated modules cannot be removed
    if (!state || state.source === 'curated') {
      return c.json({ error: 'Cannot remove curated module' }, 400);
    }

    // Disable if currently enabled
    if (state.enabled) {
      await deps.lifecycle.disable(name);
    }

    // Remove from config
    delete config.modules[name];
    deps.saveConfig(config);

    // Remove from manifests
    deps.manifests.delete(name);

    return c.json({ success: true });
  });

  return app;
}
