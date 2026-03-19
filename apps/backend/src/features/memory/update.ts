// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { Hono } from 'hono';
import { MemoryUpdateSchema } from '@opentidy/shared';
import type { AppDeps } from '../../server.js';

export function updateMemoryRoute(deps: AppDeps) {
  const router = new Hono();

  // PUT /memory/:filename — update memory file
  router.put('/memory/:filename', async (c) => {
    if (!deps.memoryManager) return c.json({ error: 'memory not available' }, 503);
    const { filename } = c.req.param();
    const body = MemoryUpdateSchema.parse(await c.req.json());
    let existing;
    try {
      existing = deps.memoryManager.readFile(filename);
    } catch {
      return c.json({ error: 'Not found' }, 404);
    }
    deps.memoryManager.writeFile({
      filename,
      category: body.category ?? existing.category,
      description: body.description ?? existing.description,
      content: body.content,
    });
    return c.json({ ok: true });
  });

  return router;
}
