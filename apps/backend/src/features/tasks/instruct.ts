// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { Hono } from 'hono';
import type { AppDeps } from '../../server.js';

export function instructTaskRoute(deps: AppDeps) {
  const app = new Hono();

  app.post('/task/:id/instruction', async (c) => {
    const id = c.req.param('id');
    const body = await c.req.json();
    const activeSessions = deps.launcher.listActiveSessions();
    const hasActive = activeSessions.some((s) => s.taskId === id);
    if (hasActive) {
      await deps.launcher.sendMessage(id, body.instruction);
    } else {
      await deps.launcher.launchSession(id, { source: 'app', content: body.instruction });
    }
    deps.sse.emit({ type: 'session:started', data: { taskId: id }, timestamp: new Date().toISOString() });
    return c.json({ launched: true });
  });

  return app;
}
