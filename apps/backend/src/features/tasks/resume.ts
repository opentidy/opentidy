// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { Hono } from 'hono';
import { createSSEEvent } from '../../shared/sse.js';
import type { AppDeps } from '../../server.js';

export function resumeTaskRoute(deps: AppDeps) {
  const app = new Hono();

  app.post('/task/:id/resume', async (c) => {
    const id = c.req.param('id');
    await deps.launcher.launchSession(id);
    deps.sse.emit(createSSEEvent('session:started', { taskId: id }));
    return c.json({ resumed: true });
  });

  return app;
}
