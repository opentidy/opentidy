// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { Hono } from 'hono';
import { HookPayloadSchema } from '@opentidy/shared';
import type { PermissionCheckDeps } from './types.js';
import { createPermissionChecker } from './check.js';

export interface PermissionRouteDeps extends PermissionCheckDeps {
  // No additional deps required beyond the checker
}

function extractJobId(sessionId: string, cwd?: string): string | null {
  // Try session_id first (format: opentidy-<jobId>)
  if (sessionId.startsWith('opentidy-')) {
    return sessionId.slice('opentidy-'.length);
  }
  // Fallback: extract from cwd (/path/to/workspace/<jobId>)
  if (cwd?.includes('/workspace/')) {
    const parts = cwd.split('/workspace/');
    const jobId = parts[parts.length - 1]?.split('/')[0];
    if (jobId && !jobId.startsWith('_') && !jobId.startsWith('.')) {
      return jobId;
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
    const jobId = extractJobId(payload.session_id, payload.cwd);

    if (!jobId) {
      console.warn(`[permissions] Unknown session format: ${payload.session_id} (cwd: ${payload.cwd ?? 'none'})`);
      return c.text('unknown job', 500);
    }

    console.log(`[permissions] check ${payload.tool_name ?? 'unknown'} for job ${jobId} (session: ${payload.session_id})`);

    const toolName = payload.tool_name ?? '';
    const toolInput = (payload.tool_input ?? {}) as Record<string, unknown>;

    const decision = await checker.check(jobId, payload.session_id, toolName, toolInput);

    if (decision === 'allow') {
      return c.text('approved', 200);
    }
    return c.text('denied by user', 403);
  });

  return router;
}
