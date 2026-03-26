// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { Hono } from 'hono';
import type { SessionHistory } from './history.js';

export function sessionHistoryRoute(deps: { sessionHistory: SessionHistory }) {
  const router = new Hono();

  // GET /tasks/:taskId/sessions/history
  router.get('/tasks/:taskId/sessions/history', (c) => {
    const taskId = c.req.param('taskId');
    return c.json(deps.sessionHistory.listByTask(taskId));
  });

  return router;
}
