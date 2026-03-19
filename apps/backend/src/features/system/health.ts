// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { Hono } from 'hono';
import type { AppDeps } from '../../server.js';

export function healthRoute(deps: AppDeps) {
  const router = new Hono();

  // GET /audit
  router.get('/audit', (c) => {
    return c.json(deps.audit?.read() ?? []);
  });

  return router;
}
