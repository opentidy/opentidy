// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { Hono } from 'hono';
import type { AppDeps } from '../../server.js';

export function listDossiersRoute(deps: AppDeps) {
  const app = new Hono();

  app.get('/dossiers', (c) => {
    const ids = deps.workspace.listDossierIds(deps.workspaceDir);
    const activeSessions = deps.launcher.listActiveSessions();
    const activeIds = new Set(activeSessions.map((s) => s.dossierId));
    const dossiers = ids.map((id: string) => {
      const d = deps.workspace.getDossier(deps.workspaceDir, id);
      return { ...d, hasActiveSession: activeIds.has(id) };
    });
    return c.json(dossiers);
  });

  return app;
}
