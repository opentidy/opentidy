// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { Hono } from 'hono';
import { execFileSync } from 'child_process';
import type { ModuleRouteDeps } from './types.js';

export function verifyModuleRoute(deps: ModuleRouteDeps) {
  const app = new Hono();

  // POST /modules/:name/verify — run checkCommand to verify module is installed
  app.post('/modules/:name/verify', (c) => {
    const name = c.req.param('name');
    console.log(`[modules] POST /modules/${name}/verify`);

    const manifest = deps.manifests.get(name);
    if (!manifest) {
      return c.json({ error: 'Module not found' }, 404);
    }

    const checkCommand = manifest.setup?.checkCommand;
    if (!checkCommand) {
      // No check command — assume ready
      return c.json({ ready: true });
    }

    try {
      execFileSync('/bin/sh', ['-c', checkCommand], {
        timeout: 10_000,
        stdio: 'pipe',
        env: { ...process.env, HOME: process.env.HOME ?? '' },
      });
      return c.json({ ready: true });
    } catch {
      return c.json({ ready: false });
    }
  });

  return app;
}
