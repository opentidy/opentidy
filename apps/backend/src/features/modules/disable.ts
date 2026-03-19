// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { Hono } from 'hono';
import type { ModuleRouteDeps } from './types.js';

export function disableModuleRoute(deps: ModuleRouteDeps) {
  const app = new Hono();

  app.post('/modules/:name/disable', async (c) => {
    const name = c.req.param('name');
    console.log(`[modules] POST /modules/${name}/disable`);

    await deps.lifecycle.disable(name);
    return c.json({ success: true });
  });

  return app;
}
