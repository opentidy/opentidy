// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { Hono } from 'hono';
import { join } from 'path';
import type { AppDeps } from '../../server.js';
import { getOpenTidyPaths } from '../../shared/paths.js';

export function resetRoute(deps: AppDeps) {
  const router = new Hono();

  // POST /reset — factory reset: kill sessions, wipe workspace, clear DB, reset config to defaults
  router.post('/reset', async (c) => {
    console.log('[opentidy] RESET — factory reset');
    const { execFileSync } = await import('child_process');
    const { readdirSync, rmSync, statSync, existsSync, mkdirSync } = await import('fs');

    // 1. Kill all opentidy tmux sessions
    try {
      const raw = execFileSync('tmux', ['list-sessions', '-F', '#{session_name}'], { encoding: 'utf-8' });
      for (const name of raw.trim().split('\n').filter(n => n.startsWith('opentidy-'))) {
        try { execFileSync('tmux', ['kill-session', '-t', name]); } catch {}
      }
    } catch {}

    // 2. Clean workspace (keep INSTRUCTIONS.md template only)
    for (const entry of readdirSync(deps.workspaceDir)) {
      if (entry === 'INSTRUCTIONS.md') continue;
      rmSync(join(deps.workspaceDir, entry), { recursive: true, force: true });
    }
    // Re-create empty system dirs (including _data for DB)
    for (const dir of ['_data', '_suggestions', '_gaps', '_audit', '_outputs', '.claude']) {
      mkdirSync(join(deps.workspaceDir, dir), { recursive: true });
    }

    // 3. Clear database — wipe all tables
    if (deps.db) {
      try {
        deps.db.exec('DELETE FROM schedules');
        deps.db.exec('DELETE FROM sessions');
        deps.db.exec('DELETE FROM notifications');
        deps.db.exec('DELETE FROM claude_processes');
        deps.db.exec('DELETE FROM dedup_hashes');
        deps.db.exec('DELETE FROM session_history');
        console.log('[opentidy] Database tables cleared');
      } catch (err) {
        console.error('[opentidy] Failed to clear database:', err);
      }
    }

    // 4. Clean locks
    try {
      const lockDir = getOpenTidyPaths().lockDir;
      if (statSync(lockDir).isDirectory()) {
        for (const f of readdirSync(lockDir)) rmSync(join(lockDir, f), { force: true });
      }
    } catch {}

    // 5. Kill ttyd processes
    try {
      const ttydPids = execFileSync('pgrep', ['-f', 'ttyd'], { encoding: 'utf-8' }).trim();
      for (const pid of ttydPids.split('\n').filter(Boolean)) {
        try { process.kill(parseInt(pid)); } catch {}
      }
    } catch {}

    // 6. Clear in-memory state
    deps.launcher.clearAll?.();

    // 7. Clear agent config directories (OAuth tokens, .claude.json, etc.)
    const paths = getOpenTidyPaths();
    const agentsDir = join(paths.config, 'agents');
    if (existsSync(agentsDir)) {
      rmSync(agentsDir, { recursive: true, force: true });
      console.log('[opentidy] Agent config directories cleared');
    }

    // 8. Reset config to defaults (wipes modules, permissions, userInfo, agentConfig, setupComplete)
    if (deps.configFns) {
      const config = deps.configFns.loadConfig();
      // Preserve only machine-level infrastructure settings
      const preserved = {
        auth: config.auth,
        server: config.server,
        workspace: config.workspace,
        github: config.github,
      };
      deps.configFns.saveConfig({
        ...preserved,
        version: 3,
        update: config.update,
        language: 'en',
        userInfo: { name: '', email: '', company: '' },
        agentConfig: { name: 'claude' as const, configDir: '' },
        modules: { opentidy: { enabled: true, source: 'curated' as const } },
        permissions: { preset: 'autonomous' as const, defaultLevel: 'ask' as const, modules: {} },
        setupComplete: false,
      } as any);
      console.log('[opentidy] Config reset to defaults (setupComplete=false)');
    }

    // 9. Notify all connected clients to refresh
    deps.sse.emit({ type: 'system:reset', data: {}, timestamp: new Date().toISOString() });

    console.log('[opentidy] Factory reset complete — exiting for clean restart');

    // Schedule process exit after response is sent — the process manager (launchd/brew services)
    // restarts the backend with fresh state (recomputed AGENT_CONFIG_DIR, fresh DB connections, etc.)
    setTimeout(() => process.exit(0), 500);

    return c.json({ reset: true });
  });

  return router;
}
