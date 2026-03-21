// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { Hono } from 'hono';
import type { AppDeps } from '../../server.js';

export function completeTaskRoute(deps: AppDeps) {
  const app = new Hono();

  app.post('/task/:id/complete', async (c) => {
    const id = c.req.param('id');
    await deps.launcher.archiveSession(id);
    deps.workspace.taskManager.completeTask(id);
    deps.scheduler?.deleteByTask(id);
    deps.sse.emit({ type: 'task:updated', data: { taskId: id }, timestamp: new Date().toISOString() });
    deps.sse.emit({ type: 'session:ended', data: { taskId: id }, timestamp: new Date().toISOString() });
    return c.json({ completed: true });
  });

  return app;
}
