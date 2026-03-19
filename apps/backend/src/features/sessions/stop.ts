// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { Hono } from 'hono';
import type { AppDeps } from '../../server.js';

export function stopSessionRoute(deps: AppDeps) {
  const router = new Hono();

  // POST /session/:id/stop — force stop a session
  router.post('/session/:id/stop', async (c) => {
    const id = c.req.param('id');
    await deps.launcher.archiveSession(id);
    deps.sse.emit({ type: 'session:ended', data: { dossierId: id }, timestamp: new Date().toISOString() });
    return c.json({ stopped: true });
  });

  return router;
}
