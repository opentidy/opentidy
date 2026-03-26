// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { Hono } from 'hono';
import { ZodError } from 'zod';
import { ModuleManifestSchema } from '@opentidy/shared';
import type { ModuleInfo } from '@opentidy/shared';
import type { ModuleRouteDeps } from './types.js';

export function addModuleRoute(deps: ModuleRouteDeps) {
  const app = new Hono();

  app.post('/modules/add', async (c) => {
    console.log('[modules] POST /modules/add');
    const body = await c.req.json() as { name?: string; manifest?: unknown };

    if (!body.name || !body.manifest) {
      return c.json({ error: 'name and manifest are required' }, 400);
    }

    let manifest;
    try {
      manifest = ModuleManifestSchema.parse(body.manifest);
    } catch (err) {
      if (err instanceof ZodError) {
        return c.json({ error: 'Invalid manifest', details: err.issues }, 400);
      }
      throw err;
    }

    // Register via shared lifecycle logic
    deps.lifecycle.registerCustomModule(body.name, manifest);

    const moduleInfo: ModuleInfo = {
      name: body.name,
      label: manifest.label,
      description: manifest.description,
      icon: manifest.icon,
      source: 'custom',
      enabled: false,
      platform: manifest.platform,
      components: {
        mcpServers: manifest.mcpServers ?? [],
        skills: manifest.skills ?? [],
        receivers: manifest.receivers ?? [],
      },
      setup: {
        needsAuth: !!manifest.setup?.authCommand,
        authCommand: manifest.setup?.authCommand,
        configFields: manifest.setup?.configFields ?? [],
        configured: true,
      },
    };

    return c.json({ success: true, module: moduleInfo }, 201);
  });

  return app;
}
