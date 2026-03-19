// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { Hono } from 'hono';
import type { AppDeps } from '../../server.js';

export function listSessionsRoute(deps: AppDeps) {
  const router = new Hono();

  // GET /sessions
  router.get('/sessions', (c) => {
    return c.json(deps.launcher.listActiveSessions());
  });

  return router;
}
