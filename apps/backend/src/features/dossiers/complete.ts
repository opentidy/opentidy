// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { Hono } from 'hono';
import type { AppDeps } from '../../server.js';

export function completeDossierRoute(deps: AppDeps) {
  const app = new Hono();

  app.post('/dossier/:id/complete', async (c) => {
    const id = c.req.param('id');
    await deps.launcher.archiveSession(id);
    deps.workspace.dossierManager.completeDossier(id);
    deps.scheduler?.deleteByDossier(id);
    deps.sse.emit({ type: 'dossier:updated', data: { dossierId: id }, timestamp: new Date().toISOString() });
    deps.sse.emit({ type: 'session:ended', data: { dossierId: id }, timestamp: new Date().toISOString() });
    return c.json({ completed: true });
  });

  return app;
}
