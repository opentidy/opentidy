// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { Hono } from 'hono';
import type { AppDeps } from '../../server.js';

export function notificationsRecentRoute(deps: AppDeps) {
  const router = new Hono();

  // GET /notifications/recent
  router.get('/notifications/recent', (c) => {
    return c.json(deps.notificationStore?.list() ?? []);
  });

  return router;
}
