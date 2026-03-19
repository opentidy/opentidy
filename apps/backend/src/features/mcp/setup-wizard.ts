// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { Hono } from 'hono';
import { execFileSync } from 'child_process';
import type { McpDeps } from './list.js';

const VALID_SETUP_MODULES = ['gmail', 'camoufox', 'whatsapp', 'claude'];

export function setupWizardRoute(_deps: McpDeps) {
  const app = new Hono();

  app.post('/setup/:name/start', (c) => {
    const name = c.req.param('name');
    if (!VALID_SETUP_MODULES.includes(name)) {
      return c.json({ error: `Unknown setup module: ${name}` }, 400);
    }

    const sessionName = `opentidy-setup-${name}`;

    // Kill existing setup session if any
    try {
      execFileSync('tmux', ['kill-session', '-t', sessionName], { stdio: 'ignore' });
    } catch { /* session may not exist */ }

    // Spawn setup wizard in tmux — name is validated against allowlist
    execFileSync('tmux', ['new-session', '-d', '-s', sessionName, `opentidy setup ${name}`]);

    return c.json({ session: sessionName });
  });

  return app;
}
