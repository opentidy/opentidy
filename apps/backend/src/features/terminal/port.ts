// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { Hono } from 'hono';
import type { AppDeps } from '../../server.js';

export function terminalPortRoute(deps: AppDeps) {
  const router = new Hono();

  // GET /terminal/:sessionName/port — returns ttyd port for a session
  router.get('/terminal/:sessionName/port', async (c) => {
    const sessionName = c.req.param('sessionName');
    const port = await deps.terminal?.ensureReady(sessionName);
    if (!port) return c.json({ error: 'no terminal' }, 404);
    return c.json({ port });
  });

  return router;
}
