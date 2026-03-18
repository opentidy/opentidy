// watchdog.ts — fs.watch workspace monitor
// Emits dossier:updated SSE events when state.md / artifacts change.
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
        // filename is relative, e.g. "dossier-id/state.md"
        const normalized = filename.replace(/\\/g, '/');
        // React to state.md and artifacts/ changes
        const isRelevant = normalized.endsWith('/state.md') || normalized === 'state.md'
          || normalized.includes('/artifacts/');
        if (!isRelevant) return;

        const dossierId = normalized.includes('/') ? normalized.split('/')[0] : '.';
        // Skip internal dirs and bare files at workspace root
        if (dossierId === '.' || dossierId.startsWith('_')) return;

        // Debounce per dossier — files can be written multiple times rapidly
        if (debounceTimers.has(dossierId)) {
          clearTimeout(debounceTimers.get(dossierId)!);
        }
        debounceTimers.set(dossierId, setTimeout(() => {
          debounceTimers.delete(dossierId);
          console.log(`[watchdog] file changed for ${dossierId}, emitting dossier:updated`);
          deps.sse.emit({ type: 'dossier:updated', data: { dossierId }, timestamp: new Date().toISOString() });
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
