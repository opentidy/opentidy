// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { Hono } from 'hono';
import type { AppDeps } from '../../server.js';

export function listMemoryRoute(deps: AppDeps) {
  const router = new Hono();

  // GET /memory: list all memory entries
  router.get('/memory', (c) => {
    const entries = deps.memoryManager?.readIndex() ?? [];
    return c.json(entries);
  });

  return router;
}
