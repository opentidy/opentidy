import { HookPayloadSchema, type HookPayload } from '@opentidy/shared';

interface AuditLogger {
  log(input: {
    sessionId: string;
    toolName: string;
    toolInput: Record<string, unknown>;
    decision: 'ALLOW' | 'DENY' | 'ASK';
    result?: string;
  }): void;
}

interface Launcher {
  handleSessionEnd(dossierId: string): void;
  markWaiting(dossierId: string): void;
}

interface Notifier {
  notifyCompleted(dossierId: string): void;
  notifyIdle?(dossierId: string): void;
}

interface SSEEmitter {
  emit(event: { type: string; data: Record<string, unknown>; timestamp: string }): void;
}

export interface HooksHandlerDeps {
  launcher: Launcher;
  audit: AuditLogger;
  notify: Notifier;
  sse: SSEEmitter;
}

function extractDossierId(payload: { session_id: string; cwd?: string }): string | null {
  // Try session_id first (opentidy-<dossierId>)
  if (payload.session_id.startsWith('opentidy-')) {
    return payload.session_id.slice('opentidy-'.length);
  }
  // Fallback: extract from cwd (/path/to/workspace/<dossierId>)
  if (payload.cwd?.includes('/workspace/')) {
    const parts = payload.cwd.split('/workspace/');
    const dossierId = parts[parts.length - 1]?.split('/')[0];
    if (dossierId && !dossierId.startsWith('_') && !dossierId.startsWith('.')) {
      return dossierId;
    }
  }
  return null;
}

export function createHooksHandler(deps: HooksHandlerDeps) {
  function handle(payload: HookPayload): { status: string } {
    const dossierId = extractDossierId(payload);
    if (!dossierId) {
      console.warn(`[hooks] Unknown session format: ${payload.session_id} (cwd: ${payload.cwd ?? 'none'})`);
      return { status: 'ignored' };
    }

    console.log(`[hooks] ${payload.hook_event_name} from ${payload.session_id} (tool: ${payload.tool_name ?? 'n/a'})`);

    switch (payload.hook_event_name) {
      case 'PreToolUse':
        handlePreToolUse(dossierId, payload);
        break;
      case 'PostToolUse':
        handlePostToolUse(dossierId, payload);
        break;
      case 'Notification':
        handleNotification(dossierId, payload);
        break;
      case 'SessionEnd':
        handleSessionEnd(dossierId, payload);
        break;
      case 'Stop':
        handleStop(dossierId, payload);
        break;
    }

    return { status: 'ok' };
  }

  function handlePreToolUse(dossierId: string, payload: HookPayload): void {
    // Audit log only — command hooks observe, they don't decide
    deps.audit.log({
      sessionId: payload.session_id,
      toolName: payload.tool_name ?? 'unknown',
      toolInput: payload.tool_input ?? {},
      decision: 'ALLOW',
    });
  }

  function handlePostToolUse(dossierId: string, payload: HookPayload): void {
    // Audit log only
    deps.audit.log({
      sessionId: payload.session_id,
      toolName: payload.tool_name ?? 'unknown',
      toolInput: payload.tool_input ?? {},
      decision: 'ALLOW',
    });
  }

  function handleNotification(dossierId: string, payload: HookPayload): void {
    // Notify only — no launcher state change needed
    if (deps.notify.notifyIdle) {
      deps.notify.notifyIdle(dossierId);
    }
  }

  function handleSessionEnd(dossierId: string, payload: HookPayload): void {
    // SessionEnd fires when Claude Code process exits — cleanup only
    deps.launcher.handleSessionEnd(dossierId);
    deps.sse.emit({
      type: 'session:ended',
      data: { dossierId },
      timestamp: new Date().toISOString(),
    });
  }

  function handleStop(dossierId: string, payload: HookPayload): void {
    // Stop = Claude finished its turn, waiting for input → mark as idle
    deps.launcher.markWaiting(dossierId);
    deps.sse.emit({
      type: 'session:idle',
      data: { dossierId },
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
