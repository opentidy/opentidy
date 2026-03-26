// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { Hono } from 'hono';
import { readFileSync, existsSync } from 'fs';
import type { AppDeps } from '../../server.js';

export function processesRoute(deps: AppDeps) {
  const router = new Hono();

  // GET /claude-processes
  router.get('/claude-processes', (c) => {
    const type = c.req.query('type');
    const limit = parseInt(c.req.query('limit') ?? '100', 10);
    const processes = deps.tracker?.list({ type: type || undefined, limit }) ?? [];
    return c.json(processes);
  });

  // GET /claude-processes/:id/output: read raw output of a Claude process
  router.get('/claude-processes/:id/output', (c) => {
    const id = parseInt(c.req.param('id'), 10);
    if (isNaN(id)) return c.json({ error: 'Invalid id' }, 400);
    const proc = deps.tracker?.getById?.(id);
    if (!proc?.outputPath) return c.json({ error: 'No output available' }, 404);
    if (!existsSync(proc.outputPath)) return c.json({ error: 'Output file not found' }, 404);
    const content = readFileSync(proc.outputPath, 'utf-8');
    return c.text(content);
  });

  return router;
}
