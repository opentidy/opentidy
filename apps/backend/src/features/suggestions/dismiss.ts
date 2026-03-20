// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { Hono } from 'hono';
import type { AppDeps } from '../../server.js';

export function dismissSuggestionRoute(deps: AppDeps) {
  const router = new Hono();

  // POST /suggestion/:slug/ignore
  router.post('/suggestion/:slug/ignore', (c) => {
    const slug = c.req.param('slug');
    const suggestion = deps.workspace.suggestionsManager.listSuggestions().find(s => s.slug === slug);
    if (!suggestion) {
      return c.json({ error: 'Suggestion not found' }, 404);
    }
    deps.workspace.suggestionsManager.ignoreSuggestion(slug);
    deps.sse.emit({ type: 'suggestion:created', data: { slug }, timestamp: new Date().toISOString() });
    return c.json({ ignored: true });
  });

  return router;
}
