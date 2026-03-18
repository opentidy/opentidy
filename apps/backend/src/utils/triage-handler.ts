import fs from 'fs';
import path from 'path';
import type { UrgencyLevel, SSEEvent } from '@opentidy/shared';
import type { TriageResult } from '../receiver/triage.js';
import { generateSlug } from './slug.js';

interface TriageHandlerDeps {
  launcher: {
    launchSession(id: string, event?: { source: string; content: string }): Promise<void>;
    sendMessage(id: string, message: string): Promise<void>;
    listActiveSessions(): Array<{ dossierId: string }>;
  };
  sse: { emit(event: SSEEvent): void };
  notify: { notifySuggestion(title: string, urgency: UrgencyLevel): Promise<void> };
  workspaceDir: string;
}

export function createTriageHandler(deps: TriageHandlerDeps) {
  const suggestionsDir = path.join(deps.workspaceDir, '_suggestions');

  function writeSuggestion(
    suggestion: { title: string; urgency: string; why: string },
    source: string,
    eventContent?: string,
  ): string {
    const slug = generateSlug(suggestion.title);
    const lines = [
      `# ${suggestion.title}`,
      '',
      `**Urgence :** ${suggestion.urgency}`,
      `**Source :** ${source}`,
      `**Date :** ${new Date().toISOString().slice(0, 10)}`,
      '',
      `## Pourquoi`,
      suggestion.why,
      '',
    ];
    if (eventContent) {
      lines.push(`## Contexte`, `Event original : ${eventContent.slice(0, 500)}`, '');
    }
    fs.mkdirSync(suggestionsDir, { recursive: true });
    fs.writeFileSync(path.join(suggestionsDir, `${slug}.md`), lines.join('\n'));
    return slug;
  }

  return async function handleTriageResult(
    result: TriageResult,
    event: { source: string; content: string },
  ): Promise<void> {
    if (result.dossierIds) {
      const activeIds = new Set(deps.launcher.listActiveSessions().map(s => s.dossierId));
      for (const id of result.dossierIds) {
        if (activeIds.has(id)) {
          await deps.launcher.sendMessage(id, `Nouvel event (${event.source}): ${event.content}`);
        } else {
          await deps.launcher.launchSession(id, event);
        }
      }
    }
    if (result.suggestion) {
      const slug = writeSuggestion(result.suggestion, event.source, event.content);
      deps.sse.emit({ type: 'suggestion:created', data: { slug }, timestamp: new Date().toISOString() });
      await deps.notify.notifySuggestion(result.suggestion.title, result.suggestion.urgency as UrgencyLevel);
    }
  };
}
