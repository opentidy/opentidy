// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { Hono } from 'hono';
import type { AppDeps } from '../../server.js';

export function resolveAmeliorationRoute(deps: AppDeps) {
  const router = new Hono();

  // POST /amelioration/:id/resolve
  router.post('/amelioration/:id/resolve', (c) => {
    deps.workspace.gapsManager.markResolved(parseInt(c.req.param('id'), 10));
    deps.sse.emit({ type: 'amelioration:created', data: { id: c.req.param('id') }, timestamp: new Date().toISOString() });
    return c.json({ resolved: true });
  });

  return router;
}
