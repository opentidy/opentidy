// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { Hono } from 'hono';
import type { OpenTidyConfig } from '@opentidy/shared';
import { SetupUserInfoSchema } from '@opentidy/shared';

export interface UserInfoDeps {
  loadConfig: () => OpenTidyConfig;
  saveConfig: (config: OpenTidyConfig) => void;
}

export function setupUserInfoRoute(deps: UserInfoDeps) {
  const app = new Hono();

  app.post('/setup/user-info', async (c) => {
    console.log('[setup] POST /setup/user-info');
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON' }, 400);
    }
    const parsed = SetupUserInfoSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'Validation failed', details: parsed.error.issues }, 400);
    }
    const config = deps.loadConfig();
    config.userInfo.name = parsed.data.name;
    config.language = parsed.data.language;
    deps.saveConfig(config);
    console.log(`[setup] User info saved: ${parsed.data.name} (${parsed.data.language})`);
    return c.json({ success: true, section: 'user-info' });
  });

  return app;
}
