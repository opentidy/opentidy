// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { Hono } from 'hono';
import { existsSync } from 'fs';
import { join } from 'path';
import type { AppDeps } from '../../server.js';

export function getTaskRoute(deps: AppDeps) {
  const app = new Hono();

  app.get('/task/:id', (c) => {
    const id = c.req.param('id');
    const stateFile = join(deps.workspaceDir, id, 'state.md');
    if (!existsSync(stateFile)) {
      return c.json({ error: 'Task not found' }, 404);
    }
    const task = deps.workspace.getTask(deps.workspaceDir, id);
    const activeSessions = deps.launcher.listActiveSessions();
    const hasActive = activeSessions.some((s) => s.taskId === id);
    return c.json({ ...task, hasActiveSession: hasActive });
  });

  return app;
}
