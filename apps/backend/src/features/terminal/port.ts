// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { Hono } from 'hono';
import { existsSync } from 'fs';
import { join } from 'path';
import type { AppDeps } from '../../server.js';

export function terminalPortRoute(deps: AppDeps) {
  const router = new Hono();

  // GET /terminal/:sessionName/port: returns ttyd port for an existing tmux session
  router.get('/terminal/:sessionName/port', async (c) => {
    const sessionName = c.req.param('sessionName');
    const port = await deps.terminal?.ensureReady(sessionName);
    if (!port) return c.json({ error: 'no terminal' }, 404);
    return c.json({ port });
  });

  // POST /terminal/run: run a command in tmux+ttyd, returns port
  // Accepts { module: "email" } (looks up authCommand) or { command: "..." } (direct)
  router.post('/terminal/run', async (c) => {
    if (!deps.terminal?.runCommand) {
      return c.json({ error: 'Terminal not available' }, 500);
    }

    const body = await c.req.json<{ module?: string; command?: string }>();

    let command: string;
    if (body.module) {
      const manifest = deps.moduleDeps?.manifests.get(body.module);
      if (!manifest?.setup?.authCommand) {
        return c.json({ error: `No auth command for module "${body.module}"` }, 400);
      }

      // Resolve module directory for correct CWD
      let moduleDir: string | undefined;
      if (deps.modulePaths) {
        const curatedDir = join(deps.modulePaths.curated, body.module);
        const customDir = join(deps.modulePaths.custom, body.module);
        if (existsSync(curatedDir)) moduleDir = curatedDir;
        else if (existsSync(customDir)) moduleDir = customDir;
      }

      if (moduleDir) {
        command = `cd '${moduleDir}' && ${manifest.setup.authCommand}`;
      } else {
        console.warn(`[terminal] Module directory not found for "${body.module}", running authCommand without CWD`);
        command = manifest.setup.authCommand;
      }
    } else if (body.command) {
      command = body.command;
    } else {
      return c.json({ error: 'Missing module or command' }, 400);
    }

    console.log(`[terminal] POST /terminal/run: ${command}`);
    const result = await deps.terminal.runCommand(command);

    // Track setup session so verify can check its exit status
    if (body.module && deps.onModuleSetup) {
      deps.onModuleSetup(body.module, result.sessionName);
    }

    return c.json({ port: result.port, session: result.sessionName });
  });

  return router;
}
