// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { Hono } from 'hono';
import type { AppDeps } from '../../server.js';

export function readMemoryRoute(deps: AppDeps) {
  const router = new Hono();

  // GET /memory/:filename (read one memory file)
  router.get('/memory/:filename', (c) => {
    if (!deps.memoryManager) return c.json({ error: 'memory not available' }, 503);
    const { filename } = c.req.param();
    try {
      const entry = deps.memoryManager.readFile(filename);
      return c.json(entry);
    } catch {
      return c.json({ error: 'Not found' }, 404);
    }
  });

  return router;
}
