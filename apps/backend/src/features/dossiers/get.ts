// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { Hono } from 'hono';
import { existsSync } from 'fs';
import { join } from 'path';
import type { AppDeps } from '../../server.js';

export function getDossierRoute(deps: AppDeps) {
  const app = new Hono();

  app.get('/dossier/:id', (c) => {
    const id = c.req.param('id');
    const stateFile = join(deps.workspaceDir, id, 'state.md');
    if (!existsSync(stateFile)) {
      return c.json({ error: 'Dossier not found' }, 404);
    }
    const dossier = deps.workspace.getDossier(deps.workspaceDir, id);
    const activeSessions = deps.launcher.listActiveSessions();
    const hasActive = activeSessions.some((s) => s.dossierId === id);
    return c.json({ ...dossier, hasActiveSession: hasActive });
  });

  return app;
}
