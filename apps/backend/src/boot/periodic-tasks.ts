// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { createWorkspaceWatcher } from '../features/checkup/watchdog.js';
import { isPidAlive } from '../shared/locks.js';

interface PeriodicTasksDeps {
  launcher: {
    recover(): Promise<void>;
    listActiveSessions(): { id: string; taskId: string; pid?: number }[];
    archiveSession(taskId: string): Promise<void>;
  };
  scheduler: {
    start(): void;
    stop(): void;
  };
  tracker: {
    cleanup(days: number): void;
  };
  dedup: {
    cleanup(): void;
  };
  sse: {
    emit(event: { type: string; data: Record<string, unknown>; timestamp: string }): void;
  };
  workspaceDir: string;
}

const DAILY_MS = 86_400_000;
const SESSION_HEALTH_CHECK_MS = 30_000; // Check tmux session health every 30s

export function startPeriodicTasks(deps: PeriodicTasksDeps): { stop(): void } {
  // Crash recovery: reconcile tmux sessions with workspace state
  deps.launcher.recover().then(() => {
    console.log('[opentidy] Recovery complete');
  }).catch((err: unknown) => {
    console.error('[opentidy] Recovery failed:', err);
  });

  // Scheduler: unified polling engine (handles checkup + scheduled launches)
  deps.scheduler.start();

  // Daily cleanup: remove old claude processes and dedup hashes
  const cleanupTimer = setInterval(() => {
    deps.tracker.cleanup(30); // processes older than 30 days
    deps.dedup.cleanup();     // hashes older than 7 days
    console.log('[opentidy] Daily cleanup complete');
  }, DAILY_MS);
  console.log('[opentidy] Daily cleanup scheduled');

  // Session health check: detect tmux sessions that died without cleanup
  const sessionHealthTimer = setInterval(async () => {
    const sessions = deps.launcher.listActiveSessions();
    for (const session of sessions) {
      if (!session.pid) continue;
      if (!isPidAlive(session.pid)) {
        // PID is dead, session crashed without cleanup
        console.log(`[health] session ${session.taskId} (pid ${session.pid}) is dead, cleaning up`);
        await deps.launcher.archiveSession(session.taskId).catch(() => {});
      }
    }
  }, SESSION_HEALTH_CHECK_MS);

  // Workspace watcher: fs.watch for task:updated SSE events
  const watchdog = createWorkspaceWatcher({ sse: deps.sse, workspaceDir: deps.workspaceDir });
  watchdog.start();
  console.log('[opentidy] Workspace watcher started (fs.watch)');

  return {
    stop(): void {
      deps.scheduler.stop();
      clearInterval(cleanupTimer);
      clearInterval(sessionHealthTimer);
      watchdog.stop();
    },
  };
}
