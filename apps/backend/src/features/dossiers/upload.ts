// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { Hono } from 'hono';
import type { AppDeps } from '../../server.js';

export function uploadDossierRoute(deps: AppDeps) {
  const app = new Hono();

  app.post('/dossier/:id/upload', async (c) => {
    const id = c.req.param('id');
    const formData = await c.req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return c.json({ error: 'no file' }, 400);
    const buffer = Buffer.from(await file.arrayBuffer());
    deps.workspace.dossierManager.saveArtifact(id, file.name, buffer);
    deps.sse.emit({ type: 'dossier:updated', data: { dossierId: id }, timestamp: new Date().toISOString() });
    return c.json({ uploaded: true, filename: file.name });
  });

  return app;
}
