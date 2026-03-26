// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

// watchdog.ts: fs.watch workspace monitor
// Emits task:updated SSE events when state.md / artifacts change.
// Session lifecycle (start/end) is handled by process exit in launcher/session.ts.

import fs from 'fs';

export function createWorkspaceWatcher(deps: {
  sse: { emit(event: { type: string; data: Record<string, unknown>; timestamp: string }): void };
  workspaceDir: string;
}) {
  let watcher: fs.FSWatcher | null = null;
  const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const DEBOUNCE_MS = 3_000;

  function start(): void {
    if (watcher) return;

    try {
      watcher = fs.watch(deps.workspaceDir, { recursive: true }, (_eventType, filename) => {
        if (!filename) return;
        // filename is relative, e.g. "task-id/state.md"
        const normalized = filename.replace(/\\/g, '/');
        // React to state.md and artifacts/ changes
        const isRelevant = normalized.endsWith('/state.md') || normalized === 'state.md'
          || normalized.includes('/artifacts/');
        if (!isRelevant) return;

        const taskId = normalized.includes('/') ? normalized.split('/')[0] : '.';
        // Skip internal dirs and bare files at workspace root
        if (taskId === '.' || taskId.startsWith('_')) return;

        // Debounce per task, files can be written multiple times rapidly
        if (debounceTimers.has(taskId)) {
          clearTimeout(debounceTimers.get(taskId)!);
        }
        debounceTimers.set(taskId, setTimeout(() => {
          debounceTimers.delete(taskId);
          console.log(`[watchdog] file changed for ${taskId}, emitting task:updated`);
          deps.sse.emit({ type: 'task:updated', data: { taskId }, timestamp: new Date().toISOString() });
        }, DEBOUNCE_MS));
      });

      watcher.on('error', (err) => {
        console.error('[watchdog] fs.watch error:', err);
      });

      console.log(`[watchdog] fs.watch started on ${deps.workspaceDir}`);
    } catch (err) {
      console.warn('[watchdog] fs.watch setup failed:', err);
      watcher = null;
    }
  }

  function stop(): void {
    // Clear all debounce timers
    for (const t of debounceTimers.values()) clearTimeout(t);
    debounceTimers.clear();

    if (watcher) {
      watcher.close();
      watcher = null;
      console.log('[watchdog] fs.watch stopped');
    }
  }

  return { start, stop };
}