// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { Hono } from 'hono';
import type { AppDeps } from '../../server.js';

export function completeJobRoute(deps: AppDeps) {
  const app = new Hono();

  app.post('/job/:id/complete', async (c) => {
    const id = c.req.param('id');
    await deps.launcher.archiveSession(id);
    deps.workspace.jobManager.completeJob(id);
    deps.scheduler?.deleteByJob(id);
    deps.sse.emit({ type: 'job:updated', data: { jobId: id }, timestamp: new Date().toISOString() });
    deps.sse.emit({ type: 'session:ended', data: { jobId: id }, timestamp: new Date().toISOString() });
    return c.json({ completed: true });
  });

  return app;
}
