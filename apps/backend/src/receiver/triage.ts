// src/receiver/triage.ts
import type { DossierStatus, MemoryEntry } from '@alfred/shared';
import type { SpawnClaudeSimpleFn } from '../infra/spawn-claude.js';
import { buildMemoryContext } from '../utils/memory-context.js';

const TRIAGE_SYSTEM_PROMPT = `Mode triage. Tu reçois un event et la liste des dossiers actifs (avec leur state.md complet).
Décide :
1. Si l'event concerne un ou plusieurs dossiers existants → { "dossierIds": ["id1", ...] }
   - Vérifie la section "## En attente" : si un dossier attend exactement ce type d'info, c'est un match
2. Si c'est un nouveau sujet qui nécessite une ACTION CONCRÈTE de Lolo → { "suggestion": { "title": "...", "urgency": "urgent|normal|faible", "source": "...", "why": "..." } }
   - La suggestion doit être une VRAIE tâche : répondre à un email, traiter une demande, respecter une deadline
   - Le "why" doit expliquer pourquoi Lolo devrait s'en occuper et ce qui se passe s'il ne le fait pas
   - NE PAS créer de suggestions pour du ménage, de l'optimisation, ou des constats techniques
3. Si c'est du spam, une newsletter, un email marketing, ou non pertinent → { "ignore": true, "reason": "..." }
Réponds UNIQUEMENT en JSON, rien d'autre.`;

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
      ? `\n\nSuggestions deja existantes (NE PAS recreer de suggestion similaire) :\n${existingSuggestions.map(t => `- ${t}`).join('\n')}`
      : '';

    const prompt = `Dossiers actifs (contenu complet de chaque state.md):\n\n${dossierList}${suggestionsBlock}\n\n---\n\nEvent (source: ${event.source}):\n${event.content}`;

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
          title: `Event non trié (${event.source})`,
          urgency: 'normal',
          source: event.source,
          why: `Triage automatique échoué. Contenu: ${event.content.slice(0, 200)}`,
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
      ? `${TRIAGE_SYSTEM_PROMPT}\n\n## Mémoire globale (contexte persistant)\n${memoryContext}`
      : TRIAGE_SYSTEM_PROMPT;

    const args = ['-p', '--system-prompt', systemPrompt, prompt];
    return deps.spawnClaude({ args, cwd: workspaceDir, type: 'triage', description: 'Triage email/event entrant' });
  };
}
