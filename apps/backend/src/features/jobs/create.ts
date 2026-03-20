// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { Hono } from 'hono';
import { generateSlug } from '../../shared/slug.js';
import type { AppDeps } from '../../server.js';

export function createJobRoute(deps: AppDeps) {
  const app = new Hono();

  app.post('/job', async (c) => {
    const body = await c.req.json();
    const id = body.id || generateSlug(body.instruction, 30);

    // Create job immediately with instruction as description, launch session non-blocking
    const title = body.instruction.slice(0, 80);
    deps.workspace.jobManager.createJob(id, body.instruction, body.confirm, title);

    // Launch session in background — don't block the HTTP response
    deps.launcher.launchSession(id, { source: 'app', content: body.instruction }).catch(err => {
      console.error(`[server] launchSession failed for ${id}:`, err);
    });
    deps.sse.emit({ type: 'job:updated', data: { jobId: id }, timestamp: new Date().toISOString() });

    return c.json({ created: true, id });
  });

  return app;
}
