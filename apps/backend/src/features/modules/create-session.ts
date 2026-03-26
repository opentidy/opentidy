// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { Hono } from 'hono';
import { mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { MODULE_NAME_REGEX } from '@opentidy/shared';

interface CreateSessionDeps {
  paths: { customModules: string };
  taskManager: { createTask(id: string, instruction: string, title?: string): void };
  launcher: { launchSession(taskId: string): Promise<void> };
}

export function createModuleSessionRoute(deps: CreateSessionDeps) {
  const app = new Hono();

  app.post('/modules/create-session', async (c) => {
    console.log('[modules] POST /modules/create-session');
    const { name } = await c.req.json<{ name: string }>();

    if (!name || !MODULE_NAME_REGEX.test(name)) {
      return c.json({ error: 'Module name must match /^[a-z0-9-]+$/' }, 400);
    }

    const moduleDir = join(deps.paths.customModules, name);

    // Check for existing module BEFORE creating directory
    if (existsSync(join(moduleDir, 'module.json'))) {
      return c.json({ error: `Module "${name}" already exists. Remove it first or choose a different name.` }, 409);
    }

    mkdirSync(moduleDir, { recursive: true });

    const instruction = `The user wants to create a module named "${name}". The module directory is at "${moduleDir}". Ask them what they want this module to do.`;

    const taskId = `create-module-${name}`;
    deps.taskManager.createTask(taskId, instruction, `Create module: ${name}`);
    await deps.launcher.launchSession(taskId);

    return c.json({ sessionId: taskId, taskId }, 201);
  });

  return app;
}
