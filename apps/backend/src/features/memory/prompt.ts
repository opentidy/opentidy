// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { Hono } from 'hono';
import { MemoryPromptSchema } from '@opentidy/shared';
import type { AppDeps } from '../../server.js';

export function promptMemoryRoute(deps: AppDeps) {
  const router = new Hono();

  // POST /memory/prompt — natural language → create/update memory
  // Registered BEFORE /:filename routes to avoid "prompt" matching as :filename
  router.post('/memory/prompt', async (c) => {
    if (!deps.memoryAgents) return c.json({ error: 'memory agents not available' }, 503);
    const { text } = MemoryPromptSchema.parse(await c.req.json());
    console.log('[memory] processing prompt:', text);
    await deps.memoryAgents.runPromptAgent(text);
    return c.json({ ok: true });
  });

  return router;
}
