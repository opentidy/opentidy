// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { Hono } from 'hono';
import { generateSlug } from '../../shared/slug.js';
import type { AppDeps } from '../../server.js';

export function testTasksRoute(deps: AppDeps) {
  const router = new Hono();

  // GET /test-tasks/count — how many test tasks are defined
  router.get('/test-tasks/count', async (c) => {
    const { TEST_TASKS } = await import('./test-tasks.js');
    return c.json({ count: TEST_TASKS.length });
  });

  // POST /test-tasks — launch all test tasks
  // Creates all tasks first (sync, fast), then launches sessions in background.
  // Title generation is skipped for test tasks — the task description is used instead.
  router.post('/test-tasks', async (c) => {
    const { TEST_TASKS } = await import('./test-tasks.js');
    console.log(`[opentidy] Launching ${TEST_TASKS.length} test tasks`);
    const created: string[] = [];

    // Step 1: create all tasks (fast, no claude -p)
    for (const task of TEST_TASKS) {
      const id = generateSlug(task.instruction, 30);
      deps.workspace.taskManager.createTask(id, task.instruction, task.description);
      created.push(id);
    }

    // Step 2: launch sessions concurrently in background
    // Each launch is independent (tmux session + Claude Code instance)
    const tasks = [...TEST_TASKS];
    for (let i = 0; i < created.length; i++) {
      const idx = i;
      const id = created[i];
      const task = tasks[i];
      // Fire-and-forget each launch with a small stagger (2s apart)
      setTimeout(async () => {
        console.log(`[test-tasks] Starting launch ${idx + 1}/${created.length}: ${id}`);
        try {
          await deps.launcher.launchSession(id, { source: 'test', content: task.instruction });
          deps.sse.emit({ type: 'task:updated', data: { taskId: id }, timestamp: new Date().toISOString() });
          console.log(`[test-tasks] Launched ${idx + 1}/${created.length}: ${id}`);
        } catch (err) {
          console.error(`[test-tasks] FAILED ${idx + 1}/${created.length} ${id}:`, err);
        }
      }, idx * 2000);
    }

    return c.json({ launched: created.length, ids: created });
  });

  return router;
}
