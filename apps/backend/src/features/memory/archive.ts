// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { Hono } from 'hono';
import type { AppDeps } from '../../server.js';

export function archiveMemoryRoute(deps: AppDeps) {
  const router = new Hono();

  // POST /memory/:filename/archive (archive memory file)
  router.post('/memory/:filename/archive', (c) => {
    if (!deps.memoryManager) return c.json({ error: 'memory not available' }, 503);
    const { filename } = c.req.param();
    try {
      deps.memoryManager.archiveFile(filename);
      return c.json({ ok: true });
    } catch {
      return c.json({ error: 'Not found' }, 404);
    }
  });

  return router;
}
