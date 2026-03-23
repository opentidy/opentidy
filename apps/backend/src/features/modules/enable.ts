// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { Hono } from 'hono';
import type { ModuleRouteDeps } from './types.js';
import { runCheckCommand, isModuleConfigured } from './checks.js';

export function enableModuleRoute(deps: ModuleRouteDeps) {
  const app = new Hono();

  app.post('/modules/:name/enable', async (c) => {
    const name = c.req.param('name');
    console.log(`[modules] POST /modules/${name}/enable`);

    const config = deps.loadConfig();
    if (!deps.manifests.has(name) && !config.modules[name]) {
      return c.json({ error: 'Module not found' }, 404);
    }

    const manifest = deps.manifests.get(name);

    // Guard: required config fields must be filled
    if (manifest) {
      const moduleConfig = config.modules[name]?.config ?? {};
      if (!isModuleConfigured(manifest, moduleConfig, deps.keychain)) {
        const missing = (manifest.setup?.configFields ?? [])
          .filter((f) => f.required && (moduleConfig[f.key] == null || moduleConfig[f.key] === ''));
        console.warn(`[modules] Cannot enable ${name}: missing required config fields: ${missing.map((f) => f.key).join(', ')}`);
        return c.json({
          error: 'Module not configured',
          missing: missing.map((f) => f.key),
        }, 422);
      }
    }

    // Guard: checkCommand must pass (deps on disk, auth complete, etc.)
    if (manifest?.setup?.checkCommand) {
      if (!runCheckCommand(manifest.setup.checkCommand)) {
        console.warn(`[modules] Cannot enable ${name}: checkCommand failed`);
        return c.json({ error: 'Module setup incomplete' }, 422);
      }
    }

    await deps.lifecycle.enable(name);
    return c.json({ success: true });
  });

  return app;
}
