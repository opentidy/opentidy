// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { Hono } from 'hono';
import type { AppDeps } from '../../server.js';

export function checkupTriggerRoute(deps: AppDeps) {
  const router = new Hono();

  // POST /checkup
  router.post('/checkup', async (c) => {
    const result = await deps.checkup.runCheckup();
    deps.sse.emit({ type: 'dossier:updated', data: { source: 'checkup' }, timestamp: new Date().toISOString() });
    return c.json(result);
  });

  // GET /checkup/status
  router.get('/checkup/status', (c) => {
    return c.json(deps.checkup.getStatus());
  });

  return router;
}
