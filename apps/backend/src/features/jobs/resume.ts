// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { Hono } from 'hono';
import type { AppDeps } from '../../server.js';

export function resumeJobRoute(deps: AppDeps) {
  const app = new Hono();

  app.post('/job/:id/resume', async (c) => {
    const id = c.req.param('id');
    await deps.launcher.launchSession(id);
    deps.sse.emit({ type: 'session:started', data: { jobId: id }, timestamp: new Date().toISOString() });
    return c.json({ resumed: true });
  });

  return app;
}
