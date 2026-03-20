// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

// watchdog.ts — fs.watch workspace monitor
// Emits job:updated SSE events when state.md / artifacts change.
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
        // filename is relative, e.g. "job-id/state.md"
        const normalized = filename.replace(/\\/g, '/');
        // React to state.md and artifacts/ changes
        const isRelevant = normalized.endsWith('/state.md') || normalized === 'state.md'
          || normalized.includes('/artifacts/');
        if (!isRelevant) return;

        const jobId = normalized.includes('/') ? normalized.split('/')[0] : '.';
        // Skip internal dirs and bare files at workspace root
        if (jobId === '.' || jobId.startsWith('_')) return;

        // Debounce per job — files can be written multiple times rapidly
        if (debounceTimers.has(jobId)) {
          clearTimeout(debounceTimers.get(jobId)!);
        }
        debounceTimers.set(jobId, setTimeout(() => {
          debounceTimers.delete(jobId);
          console.log(`[watchdog] file changed for ${jobId}, emitting job:updated`);
          deps.sse.emit({ type: 'job:updated', data: { jobId }, timestamp: new Date().toISOString() });
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