// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { Hono } from 'hono';
import type { AppDeps } from '../../server.js';

export function listTasksRoute(deps: AppDeps) {
  const app = new Hono();

  app.get('/tasks', (c) => {
    const ids = deps.workspace.listTaskIds(deps.workspaceDir);
    const activeSessions = deps.launcher.listActiveSessions();
    const activeIds = new Set(activeSessions.map((s) => s.taskId));
    const tasks = ids.map((id: string) => {
      const d = deps.workspace.getTask(deps.workspaceDir, id);
      return { ...d, hasActiveSession: activeIds.has(id) };
    });
    return c.json(tasks);
  });

  return app;
}
