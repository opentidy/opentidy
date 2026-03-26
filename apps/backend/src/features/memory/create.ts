// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { Hono } from 'hono';
import { MemoryCreateSchema } from '@opentidy/shared';
import type { AppDeps } from '../../server.js';

export function createMemoryRoute(deps: AppDeps) {
  const router = new Hono();

  // POST /memory: create new memory file
  router.post('/memory', async (c) => {
    if (!deps.memoryManager) return c.json({ error: 'memory not available' }, 503);
    const body = MemoryCreateSchema.parse(await c.req.json());
    // Check if file already exists. Prevent silent overwrite.
    try {
      deps.memoryManager.readFile(body.filename);
      return c.json({ error: 'File already exists' }, 409);
    } catch {
      // File doesn't exist, good to create
    }
    deps.memoryManager.writeFile(body);
    return c.json({ ok: true }, 201);
  });

  return router;
}
