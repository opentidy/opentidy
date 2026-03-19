// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { Hono } from 'hono';
import type { OpenTidyConfig } from '@opentidy/shared';

export interface CompleteDeps {
  loadConfig: () => OpenTidyConfig;
  saveConfig: (config: OpenTidyConfig) => void;
}

export function setupCompleteRoute(deps: CompleteDeps) {
  const app = new Hono();

  app.post('/setup/complete', (c) => {
    const config = deps.loadConfig();
    config.setupComplete = true;
    deps.saveConfig(config);
    console.log('[setup] Setup marked as complete');
    return c.json({ success: true });
  });

  return app;
}
