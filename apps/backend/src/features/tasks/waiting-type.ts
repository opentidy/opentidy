// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { Hono } from 'hono';
import { join } from 'path';
import { setWaitingType } from './state.js';
import type { AppDeps } from '../../server.js';

export function waitingTypeTaskRoute(deps: AppDeps) {
  const app = new Hono();

  app.post('/task/:id/waiting-type', async (c) => {
    const id = c.req.param('id');
    const body = await c.req.json();
    const type = body.type;
    if (type !== 'user' && type !== 'tiers') {
      return c.json({ error: 'type must be "user" or "tiers"' }, 400);
    }
    const taskDir = join(deps.workspaceDir, id);
    setWaitingType(taskDir, type);
    deps.launcher.setSessionWaitingType?.(id, type);
    deps.sse.emit({ type: 'task:updated', data: { taskId: id, waitingType: type }, timestamp: new Date().toISOString() });
    return c.json({ ok: true });
  });

  return app;
}
