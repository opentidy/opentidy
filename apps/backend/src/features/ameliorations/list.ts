// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { Hono } from 'hono';
import type { AppDeps } from '../../server.js';

export function listAmeliorationsRoute(deps: AppDeps) {
  const router = new Hono();

  // GET /ameliorations
  router.get('/ameliorations', (c) => {
    return c.json(deps.workspace.gapsManager.listGaps());
  });

  return router;
}
