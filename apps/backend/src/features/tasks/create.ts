// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { Hono } from 'hono';
import { CreateTaskSchema } from '@opentidy/shared';
import { generateSlug } from '../../shared/slug.js';
import { createSSEEvent } from '../../shared/sse.js';
import type { AppDeps } from '../../server.js';

export function createTaskRoute(deps: AppDeps) {
  const app = new Hono();

  app.post('/task', async (c) => {
    const body = await c.req.json();
    const parsed = CreateTaskSchema.parse(body);
    const id = body.id || generateSlug(parsed.instruction, 30);

    // Create task immediately with instruction as description, launch session non-blocking
    const title = parsed.instruction.slice(0, 80);
    deps.workspace.taskManager.createTask(id, parsed.instruction, title);

    // Launch session in background, don't block the HTTP response
    deps.launcher.launchSession(id, { source: 'app', content: parsed.instruction }).catch(err => {
      console.error(`[server] launchSession failed for ${id}:`, err);
    });
    deps.sse.emit(createSSEEvent('task:updated', { taskId: id }));

    return c.json({ created: true, id });
  });

  return app;
}
