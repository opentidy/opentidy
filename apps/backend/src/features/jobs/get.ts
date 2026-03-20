// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { Hono } from 'hono';
import { existsSync } from 'fs';
import { join } from 'path';
import type { AppDeps } from '../../server.js';

export function getJobRoute(deps: AppDeps) {
  const app = new Hono();

  app.get('/job/:id', (c) => {
    const id = c.req.param('id');
    const stateFile = join(deps.workspaceDir, id, 'state.md');
    if (!existsSync(stateFile)) {
      return c.json({ error: 'Job not found' }, 404);
    }
    const job = deps.workspace.getJob(deps.workspaceDir, id);
    const activeSessions = deps.launcher.listActiveSessions();
    const hasActive = activeSessions.some((s) => s.jobId === id);
    return c.json({ ...job, hasActiveSession: hasActive });
  });

  return app;
}
