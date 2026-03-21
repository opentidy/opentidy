// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { Hono } from 'hono';
import { join } from 'path';
import type { AppDeps } from '../../server.js';
import { getOpenTidyPaths } from '../../shared/paths.js';

export function resetRoute(deps: AppDeps) {
  const router = new Hono();

  // POST /reset — factory reset: kill sessions, wipe workspace, reset config to defaults
  router.post('/reset', async (c) => {
    console.log('[opentidy] RESET — factory reset');
    const { execFileSync } = await import('child_process');
    const { readdirSync, rmSync, statSync } = await import('fs');

    // 1. Kill all opentidy tmux sessions
    try {
      const raw = execFileSync('tmux', ['list-sessions', '-F', '#{session_name}'], { encoding: 'utf-8' });
      for (const name of raw.trim().split('\n').filter(n => n.startsWith('opentidy-'))) {
        try { execFileSync('tmux', ['kill-session', '-t', name]); } catch {}
      }
    } catch {}

    // 2. Clean workspace (keep _data for DB, INSTRUCTIONS.md for global prompt)
    const keep = new Set(['_data', 'INSTRUCTIONS.md']);
    for (const entry of readdirSync(deps.workspaceDir)) {
      if (keep.has(entry)) continue;
      rmSync(join(deps.workspaceDir, entry), { recursive: true, force: true });
    }
    // Re-create empty system dirs
    const { mkdirSync } = await import('fs');
    for (const dir of ['_suggestions', '_gaps', '_audit', '_outputs', '.claude']) {
      mkdirSync(join(deps.workspaceDir, dir), { recursive: true });
    }

    // 3. Clean locks
    try {
      const lockDir = getOpenTidyPaths().lockDir;
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

    // 5. Clear in-memory state
    deps.launcher.clearAll?.();

    // 6. Reset config to defaults (wipes modules, permissions, userInfo, setupComplete)
    if (deps.configFns) {
      const config = deps.configFns.loadConfig();
      // Preserve only infrastructure settings that depend on the machine
      const preserved = {
        auth: config.auth,
        server: config.server,
        workspace: config.workspace,
        agentConfig: config.agentConfig,
        claudeConfig: config.claudeConfig,
        github: config.github,
      };
      deps.configFns.saveConfig({
        ...preserved,
        version: 3,
        update: config.update,
        language: 'en',
        userInfo: { name: '', email: '', company: '' },
        modules: { opentidy: { enabled: true, source: 'curated' as const } },
        permissions: { preset: 'autonomous' as const, defaultLevel: 'confirm' as const, modules: {} },
        setupComplete: false,
      } as any);
      console.log('[opentidy] Config reset to defaults (setupComplete=false)');
    }

    // 7. Notify all connected clients to refresh
    deps.sse.emit({ type: 'system:reset', data: {}, timestamp: new Date().toISOString() });

    console.log('[opentidy] Factory reset complete');
    return c.json({ reset: true });
  });

  return router;
}
