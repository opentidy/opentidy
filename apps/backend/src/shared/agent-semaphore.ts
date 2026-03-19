// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

// Semaphore to limit concurrent agent processes
// Shared between all spawnAgent invocations (one-shot processes)

const DEFAULT_MAX_CONCURRENT = 3;

export function createAgentSemaphore(maxConcurrent = DEFAULT_MAX_CONCURRENT) {
  let running = 0;
  const queue: Array<() => void> = [];

  async function acquire(): Promise<void> {
    if (running < maxConcurrent) {
      running++;
      console.log(`[semaphore] acquired (${running}/${maxConcurrent} slots used, ${queue.length} queued)`);
      return;
    }
    console.log(`[semaphore] full (${running}/${maxConcurrent}), queuing (${queue.length + 1} waiting)`);
    return new Promise<void>((resolve) => {
      queue.push(() => {
        running++;
        console.log(`[semaphore] dequeued → acquired (${running}/${maxConcurrent} slots used, ${queue.length} queued)`);
        resolve();
      });
    });
  }

  function release(): void {
    running--;
    console.log(`[semaphore] released (${running}/${maxConcurrent} slots used, ${queue.length} queued)`);
    const next = queue.shift();
    if (next) next();
  }

  function status(): { running: number; queued: number; max: number } {
    return { running, queued: queue.length, max: maxConcurrent };
  }

  return { acquire, release, status };
}

export type AgentSemaphore = ReturnType<typeof createAgentSemaphore>;