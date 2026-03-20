// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { Hono } from 'hono';
import type { AppDeps } from '../../server.js';

export function approveSuggestionRoute(deps: AppDeps) {
  const router = new Hono();

  // POST /suggestion/:slug/approve
  router.post('/suggestion/:slug/approve', async (c) => {
    const slug = c.req.param('slug');
    const body = await c.req.json().catch(() => ({}));
    // Read suggestion before creating job (file gets moved/deleted)
    const suggestion = deps.workspace.suggestionsManager.listSuggestions().find(s => s.slug === slug);
    if (!suggestion) {
      return c.json({ error: 'Suggestion not found' }, 404);
    }
    const instruction = body.instruction || suggestion.summary || suggestion.title || 'Lis state.md et commence.';
    deps.workspace.jobManager.createJobFromSuggestion(slug, body.instruction);
    await deps.launcher.launchSession(slug, { source: 'suggestion', content: instruction });
    deps.sse.emit({ type: 'suggestion:created', data: { slug }, timestamp: new Date().toISOString() });
    deps.sse.emit({ type: 'job:updated', data: { jobId: slug }, timestamp: new Date().toISOString() });
    return c.json({ approved: true });
  });

  return router;
}
