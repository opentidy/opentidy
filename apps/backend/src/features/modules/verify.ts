// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { Hono } from 'hono';
import type { ModuleRouteDeps } from './types.js';
import { runCheckCommand } from './checks.js';

export function verifyModuleRoute(deps: ModuleRouteDeps) {
  const app = new Hono();

  // POST /modules/:name/verify: run checkCommand to verify module is installed
  app.post('/modules/:name/verify', async (c) => {
    const name = c.req.param('name');
    console.log(`[modules] POST /modules/${name}/verify`);

    const manifest = deps.manifests.get(name);
    if (!manifest) {
      return c.json({ error: 'Module not found' }, 404);
    }

    // If a setup session was started for this module, check its status first.
    // The module should not be considered ready if the authCommand is still running or failed.
    if (manifest.setup?.authCommand && deps.setupTracker) {
      const setupStatus = await deps.setupTracker.getStatus(name);
      if (setupStatus) {
        if (setupStatus.running) {
          return c.json({ ready: false, reason: 'setup-in-progress' });
        }
        if (setupStatus.exitCode !== 0) {
          return c.json({ ready: false, reason: 'setup-failed' });
        }
        // exitCode === 0 → setup completed successfully, fall through to checkCommand
      }
    }

    const checkCommand = manifest.setup?.checkCommand;
    if (!checkCommand) {
      // No check command, assume ready
      return c.json({ ready: true });
    }

    return c.json({ ready: runCheckCommand(checkCommand) });
  });

  return app;
}
