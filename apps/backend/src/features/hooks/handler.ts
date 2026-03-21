// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { Hono } from 'hono';
import { HookPayloadSchema, type HookPayload } from '@opentidy/shared';

interface AuditLogger {
  log(input: {
    sessionId: string;
    toolName: string;
    toolInput: Record<string, unknown>;
    decision: 'ALLOW' | 'DENY' | 'BLOCK';
    result?: string;
  }): void;
}

interface Launcher {
  handleSessionEnd(taskId: string): void;
  markWaiting(taskId: string): void;
}

interface Notifier {
  notifyCompleted(taskId: string): void;
  notifyIdle?(taskId: string): void;
}

interface SSEEmitter {
  emit(event: { type: string; data: Record<string, unknown>; timestamp: string }): void;
}

export interface HooksHandlerDeps {
  launcher: Launcher;
  audit: AuditLogger;
  notify: Notifier;
  sse: SSEEmitter;
  onSessionEnd?: (taskId: string) => void;
}

function extractTaskId(payload: { session_id: string; cwd?: string }): string | null {
  // Try session_id first (opentidy-<taskId>)
  if (payload.session_id.startsWith('opentidy-')) {
    return payload.session_id.slice('opentidy-'.length);
  }
  // Fallback: extract from cwd (/path/to/workspace/<taskId>)
  if (payload.cwd?.includes('/workspace/')) {
    const parts = payload.cwd.split('/workspace/');
    const taskId = parts[parts.length - 1]?.split('/')[0];
    if (taskId && !taskId.startsWith('_') && !taskId.startsWith('.')) {
      return taskId;
    }
  }
  return null;
}

export function createHooksHandler(deps: HooksHandlerDeps) {
  function handle(payload: HookPayload): { status: string } {
    const taskId = extractTaskId(payload);
    if (!taskId) {
      console.warn(`[hooks] Unknown session format: ${payload.session_id} (cwd: ${payload.cwd ?? 'none'})`);
      return { status: 'ignored' };
    }

    console.log(`[hooks] ${payload.hook_event_name} from ${payload.session_id} (tool: ${payload.tool_name ?? 'n/a'})`);

    switch (payload.hook_event_name) {
      case 'PreToolUse':
        handlePreToolUse(taskId, payload);
        break;
      case 'PostToolUse':
        handlePostToolUse(taskId, payload);
        break;
      case 'Notification':
        handleNotification(taskId, payload);
        break;
      case 'SessionEnd':
        handleSessionEnd(taskId, payload);
        break;
      case 'Stop':
        handleStop(taskId, payload);
        break;
    }

    return { status: 'ok' };
  }

  function handlePreToolUse(taskId: string, payload: HookPayload): void {
    // Audit log only — command hooks observe, they don't decide
    deps.audit.log({
      sessionId: payload.session_id,
      toolName: payload.tool_name ?? 'unknown',
      toolInput: payload.tool_input ?? {},
      decision: 'ALLOW',
    });
  }

  function handlePostToolUse(taskId: string, payload: HookPayload): void {
    // Audit log only
    deps.audit.log({
      sessionId: payload.session_id,
      toolName: payload.tool_name ?? 'unknown',
      toolInput: payload.tool_input ?? {},
      decision: 'ALLOW',
    });
  }

  function handleNotification(taskId: string, payload: HookPayload): void {
    // Notify only — no launcher state change needed
    if (deps.notify.notifyIdle) {
      deps.notify.notifyIdle(taskId);
    }
  }

  function handleSessionEnd(taskId: string, payload: HookPayload): void {
    // SessionEnd fires when Claude Code process exits — cleanup only
    deps.launcher.handleSessionEnd(taskId);
    deps.onSessionEnd?.(taskId);
    deps.sse.emit({
      type: 'session:ended',
      data: { taskId },
      timestamp: new Date().toISOString(),
    });
  }

  function handleStop(taskId: string, payload: HookPayload): void {
    // Stop = Claude finished its turn, waiting for input → mark as idle
    deps.launcher.markWaiting(taskId);
    deps.sse.emit({
      type: 'session:idle',
      data: { taskId },
      timestamp: new Date().toISOString(),
    });
  }

  function parsePayload(body: unknown): { success: true; data: HookPayload } | { success: false; error: string } {
    const result = HookPayloadSchema.safeParse(body);
    if (!result.success) {
      return { success: false, error: result.error.message };
    }
    return { success: true, data: result.data };
  }

  return { handle, parsePayload };
}

// Hono route — POST /hooks
export function hookRoute(deps: { hooks: { handleHook(body: unknown): { status: string } } }) {
  const router = new Hono();
  router.post('/hooks', async (c) => {
    const body = await c.req.json();
    await deps.hooks.handleHook(body);
    return c.json({ ok: true });
  });
  return router;
}