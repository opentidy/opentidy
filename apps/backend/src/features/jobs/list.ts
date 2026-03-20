// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { Hono } from 'hono';
import type { AppDeps } from '../../server.js';

export function listJobsRoute(deps: AppDeps) {
  const app = new Hono();

  app.get('/jobs', (c) => {
    const ids = deps.workspace.listJobIds(deps.workspaceDir);
    const activeSessions = deps.launcher.listActiveSessions();
    const activeIds = new Set(activeSessions.map((s) => s.jobId));
    const jobs = ids.map((id: string) => {
      const d = deps.workspace.getJob(deps.workspaceDir, id);
      return { ...d, hasActiveSession: activeIds.has(id) };
    });
    return c.json(jobs);
  });

  return app;
}
