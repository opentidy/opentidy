// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { Hono } from 'hono';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import type { ModuleRouteDeps } from './types.js';

export function removeModuleRoute(deps: ModuleRouteDeps) {
  const app = new Hono();

  app.delete('/modules/:name', async (c) => {
    const name = c.req.param('name');
    console.log(`[modules] DELETE /modules/${name}`);

    const config = deps.loadConfig();
    const state = config.modules[name];

    if (!state && !deps.manifests.has(name)) {
      return c.json({ error: 'Module not found' }, 404);
    }

    // Curated modules cannot be removed
    if (!state || state.source === 'curated') {
      return c.json({ error: 'Cannot remove curated module' }, 400);
    }

    // Stop receivers/daemon if currently enabled
    if (state.enabled) {
      await deps.lifecycle.disable(name);
    }

    // Always clean module data directory (auth tokens, caches, SQLite, etc.)
    const modulesDataDir = deps.paths?.modulesData
      || join(process.env.HOME || '', '.config', 'opentidy', 'modules');
    const dataDir = join(modulesDataDir, name);
    try {
      rmSync(dataDir, { recursive: true, force: true });
      console.log(`[modules] Cleaned data directory: ${dataDir}`);
    } catch {}

    // Remove from config
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { [name]: _, ...remainingModules } = config.modules;
    config.modules = remainingModules;
    deps.saveConfig(config);

    // Remove from manifests
    deps.manifests.delete(name);

    // Delete custom module directory from disk
    if (deps.paths?.customModules) {
      const moduleDir = join(deps.paths.customModules, name);
      try {
        rmSync(moduleDir, { recursive: true, force: true });
        console.log(`[modules] Deleted custom module directory: ${moduleDir}`);
      } catch (err) {
        console.warn(`[modules] Failed to delete module directory: ${(err as Error).message}`);
      }
    }

    return c.json({ success: true });
  });

  return app;
}
