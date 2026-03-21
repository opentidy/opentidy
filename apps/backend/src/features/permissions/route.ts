// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { Hono } from 'hono';
import { HookPayloadSchema } from '@opentidy/shared';
import type { PermissionCheckDeps } from './types.js';
import { createPermissionChecker } from './check.js';

export interface PermissionRouteDeps extends PermissionCheckDeps {
  // No additional deps required beyond the checker
}

function extractTaskId(sessionId: string, cwd?: string): string | null {
  // Try session_id first (format: opentidy-<taskId>)
  if (sessionId.startsWith('opentidy-')) {
    return sessionId.slice('opentidy-'.length);
  }
  // Fallback: extract from cwd (/path/to/workspace/<taskId>)
  if (cwd?.includes('/workspace/')) {
    const parts = cwd.split('/workspace/');
    const taskId = parts[parts.length - 1]?.split('/')[0];
    if (taskId && !taskId.startsWith('_') && !taskId.startsWith('.')) {
      return taskId;
    }
  }
  return null;
}

export function permissionCheckRoute(deps: PermissionRouteDeps) {
  const router = new Hono();
  const checker = createPermissionChecker(deps);

  router.post('/permissions/check', async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.text('invalid JSON', 400);
    }

    const parsed = HookPayloadSchema.safeParse(body);
    if (!parsed.success) {
      return c.text(`invalid payload: ${parsed.error.message}`, 400);
    }

    const payload = parsed.data;
    const taskId = extractTaskId(payload.session_id, payload.cwd);

    if (!taskId) {
      console.warn(`[permissions] Unknown session format: ${payload.session_id} (cwd: ${payload.cwd ?? 'none'})`);
      return c.text('unknown task', 500);
    }

    console.log(`[permissions] check ${payload.tool_name ?? 'unknown'} for task ${taskId} (session: ${payload.session_id})`);

    const toolName = payload.tool_name ?? '';
    const toolInput = (payload.tool_input ?? {}) as Record<string, unknown>;

    const decision = await checker.check(taskId, payload.session_id, toolName, toolInput);

    if (decision === 'allow') {
      return c.text('approved', 200);
    }
    return c.text('denied by user', 403);
  });

  return router;
}
