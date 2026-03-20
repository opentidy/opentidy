// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { Hono } from 'hono';
import type { AppDeps } from '../../server.js';

export function uploadJobRoute(deps: AppDeps) {
  const app = new Hono();

  app.post('/job/:id/upload', async (c) => {
    const id = c.req.param('id');
    const formData = await c.req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return c.json({ error: 'no file' }, 400);
    const buffer = Buffer.from(await file.arrayBuffer());
    deps.workspace.jobManager.saveArtifact(id, file.name, buffer);
    deps.sse.emit({ type: 'job:updated', data: { jobId: id }, timestamp: new Date().toISOString() });
    return c.json({ uploaded: true, filename: file.name });
  });

  return app;
}
