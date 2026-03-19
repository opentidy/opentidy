// src/features/triage/classify.ts
import type { DossierStatus, MemoryEntry } from '@opentidy/shared';
import type { SpawnClaudeSimpleFn } from '../../shared/spawn-claude.js';
import { buildMemoryContext } from '../../shared/memory-context.js';

const TRIAGE_SYSTEM_PROMPT = `Triage mode. You receive an event and the list of active dossiers (with their full state.md).
Decide:
1. If the event relates to one or more existing dossiers → { "dossierIds": ["id1", ...] }
   - Check the "## Waiting" section: if a dossier is waiting for exactly this type of info, it's a match
2. If it's a new topic requiring a CONCRETE ACTION from the user → { "suggestion": { "title": "...", "urgency": "urgent|normal|low", "source": "...", "why": "..." } }
   - The suggestion must be a REAL task: reply to an email, handle a request, meet a deadline
   - The "why" must explain why the user should handle it and what happens if they don't
   - Do NOT create suggestions for cleanup, optimization, or technical observations
3. If it's spam, a newsletter, marketing email, or not relevant → { "ignore": true, "reason": "..." }
Respond ONLY in JSON, nothing else.`;

export interface TriageResult {
  dossierIds?: string[];
  suggestion?: { title: string; urgency: string; source: string; why: string };
  ignore?: boolean;
  reason?: string;
}

interface DossierSummary {
  id: string;
  title: string;
  status: DossierStatus;
  stateRaw: string;
}

export function createTriager(deps: {
  runClaude: (prompt: string) => Promise<string>;
  listDossiers: () => DossierSummary[];
  listSuggestionTitles?: () => string[];
}) {
  async function triage(event: { source: string; content: string }): Promise<TriageResult> {
    const dossiers = deps.listDossiers();
    const dossierList = dossiers
      .map(d => `--- ${d.id} ---\n${d.stateRaw}`)
      .join('\n\n');

    const existingSuggestions = deps.listSuggestionTitles?.() ?? [];
    const suggestionsBlock = existingSuggestions.length > 0
      ? `\n\nExisting suggestions (do NOT recreate similar ones):\n${existingSuggestions.map(t => `- ${t}`).join('\n')}`
      : '';

    const prompt = `Active dossiers (full state.md content):\n\n${dossierList}${suggestionsBlock}\n\n---\n\nEvent (source: ${event.source}):\n${event.content}`;

    try {
      const stdout = await deps.runClaude(prompt);
      const jsonMatch = stdout.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON in response');
      return JSON.parse(jsonMatch[0]) as TriageResult;
    } catch (error) {
      // Fallback: never lose an event — create a generic suggestion
      console.error('[triage] Claude failed, creating fallback suggestion:', error);
      return {
        suggestion: {
          title: `Unsorted event (${event.source})`,
          urgency: 'normal',
          source: event.source,
          why: `Automatic triage failed. Content: ${event.content.slice(0, 200)}`,
        },
      };
    }
  }

  return { triage };
}

// Production: runClaude calls claude -p via spawnClaude
export function createClaudeRunner(workspaceDir: string, deps: {
  memoryManager?: { readAllFiles: () => MemoryEntry[] };
  spawnClaude: SpawnClaudeSimpleFn;
}) {
  return async function runClaude(prompt: string): Promise<string> {
    console.log('[triage] Running claude -p for triage');

    const memoryContext = deps.memoryManager
      ? buildMemoryContext(deps.memoryManager.readAllFiles())
      : '';

    const systemPrompt = memoryContext
      ? `${TRIAGE_SYSTEM_PROMPT}\n\n## Global memory (persistent context)\n${memoryContext}`
      : TRIAGE_SYSTEM_PROMPT;

    const args = ['-p', '--system-prompt', systemPrompt, prompt];
    return deps.spawnClaude({ args, cwd: workspaceDir, type: 'triage', description: 'Triage incoming email/event' });
  };
}
