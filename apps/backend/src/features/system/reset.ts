// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { Hono } from 'hono';
import { join } from 'path';
import type { AppDeps } from '../../server.js';

export function resetRoute(deps: AppDeps) {
  const router = new Hono();

  // POST /reset — kill all sessions, wipe workspace, clean locks
  router.post('/reset', async (c) => {
    console.log('[opentidy] RESET — wiping everything');
    const { execFileSync } = await import('child_process');
    const { readdirSync, rmSync, statSync } = await import('fs');

    // 1. Kill all opentidy tmux sessions
    try {
      const raw = execFileSync('tmux', ['list-sessions', '-F', '#{session_name}'], { encoding: 'utf-8' });
      for (const name of raw.trim().split('\n').filter(n => n.startsWith('opentidy-'))) {
        try { execFileSync('tmux', ['kill-session', '-t', name]); } catch {}
      }
    } catch {}

    // 2. Clean workspace dossiers (keep system dirs and CLAUDE.md)
    const keep = new Set(['_suggestions', '_gaps', '_audit', '_outputs', '.claude', 'CLAUDE.md']);
    for (const entry of readdirSync(deps.workspaceDir)) {
      if (keep.has(entry)) {
        if (entry.startsWith('_')) {
          const dir = join(deps.workspaceDir, entry);
          try {
            if (statSync(dir).isDirectory()) {
              for (const f of readdirSync(dir)) rmSync(join(dir, f), { recursive: true, force: true });
            }
          } catch {}
        }
        continue;
      }
      rmSync(join(deps.workspaceDir, entry), { recursive: true, force: true });
    }

    // 3. Clean locks
    try {
      const lockDir = '/tmp/opentidy-locks';
      if (statSync(lockDir).isDirectory()) {
        for (const f of readdirSync(lockDir)) rmSync(join(lockDir, f), { force: true });
      }
    } catch {}

    // 4. Kill ttyd processes
    try {
      const ttydPids = execFileSync('pgrep', ['-f', 'ttyd'], { encoding: 'utf-8' }).trim();
      for (const pid of ttydPids.split('\n').filter(Boolean)) {
        try { process.kill(parseInt(pid)); } catch {}
      }
    } catch {}

    console.log('[opentidy] RESET complete — restarting in 1s');
    c.header('Content-Type', 'application/json');

    // 5. Schedule self-restart after response is sent
    setTimeout(() => {
      console.log('[opentidy] Restarting process...');
      process.exit(0); // tsx watch or launchctl will restart us
    }, 1000);

    return c.json({ reset: true });
  });

  return router;
}
