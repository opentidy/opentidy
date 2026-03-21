// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import type { UrgencyLevel, SSEEvent } from '@opentidy/shared';
import type { TriageResult } from './classify.js';

interface TriageHandlerDeps {
  launcher: {
    launchSession(id: string, event?: { source: string; content: string }): Promise<void>;
    sendMessage(id: string, message: string): Promise<void>;
    listActiveSessions(): Array<{ taskId: string }>;
  };
  sse: { emit(event: SSEEvent): void };
  notify: { notifySuggestion(title: string, urgency: UrgencyLevel): Promise<void> };
  writeSuggestion: (suggestion: { title: string; urgency: string; why: string }, source: string, eventContent?: string) => string;
}

export function createTriageHandler(deps: TriageHandlerDeps) {
  return async function handleTriageResult(
    result: TriageResult,
    event: { source: string; content: string },
  ): Promise<void> {
    if (result.taskIds) {
      const activeIds = new Set(deps.launcher.listActiveSessions().map(s => s.taskId));
      for (const id of result.taskIds) {
        if (activeIds.has(id)) {
          await deps.launcher.sendMessage(id, `New event (${event.source}): ${event.content}`);
        } else {
          await deps.launcher.launchSession(id, event);
        }
      }
    }
    if (result.suggestion) {
      const slug = deps.writeSuggestion(result.suggestion, event.source, event.content);
      deps.sse.emit({ type: 'suggestion:created', data: { slug }, timestamp: new Date().toISOString() });
      await deps.notify.notifySuggestion(result.suggestion.title, result.suggestion.urgency as UrgencyLevel);
    }
  };
}