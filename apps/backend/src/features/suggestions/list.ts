// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { Hono } from 'hono';
import type { AppDeps } from '../../server.js';

export function listSuggestionsRoute(deps: AppDeps) {
  const router = new Hono();

  // GET /suggestions
  router.get('/suggestions', (c) => {
    return c.json(deps.workspace.suggestionsManager.listSuggestions());
  });

  return router;
}
