// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { Hono } from 'hono';
import { join } from 'path';
import { setWaitingType } from './state.js';
import type { AppDeps } from '../../server.js';

export function waitingTypeDossierRoute(deps: AppDeps) {
  const app = new Hono();

  app.post('/dossier/:id/waiting-type', async (c) => {
    const id = c.req.param('id');
    const body = await c.req.json();
    const type = body.type;
    if (type !== 'user' && type !== 'tiers') {
      return c.json({ error: 'type must be "user" or "tiers"' }, 400);
    }
    const dossierDir = join(deps.workspaceDir, id);
    setWaitingType(dossierDir, type);
    deps.launcher.setSessionWaitingType?.(id, type);
    deps.sse.emit({ type: 'dossier:updated', data: { dossierId: id, waitingType: type }, timestamp: new Date().toISOString() });
    return c.json({ ok: true });
  });

  return app;
}
