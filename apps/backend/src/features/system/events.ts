// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { Hono } from 'hono';
import type { AppDeps } from '../../server.js';

export function eventsRoute(deps: AppDeps) {
  const router = new Hono();

  // GET /events (SSE)
  router.get('/events', (c) => {
    const stream = new ReadableStream({
      start(controller) {
        // Send initial comment so EventSource transitions to OPEN state
        controller.enqueue(new TextEncoder().encode(': connected\n\n'));
        const client = {
          write: (data: string) => controller.enqueue(new TextEncoder().encode(data)),
        };
        deps.sse.addClient(client);
        c.req.raw.signal.addEventListener('abort', () => {
          deps.sse.removeClient(client);
        });
      },
    });
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  });

  return router;
}
