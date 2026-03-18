import fs from 'fs';
import path from 'path';
import type { MemoryEntry } from '@opentidy/shared';
import type { SpawnClaudeSimpleFn } from '../infra/spawn-claude.js';
import { generateSlug } from '../utils/slug.js';
import { buildMemoryContext } from '../utils/memory-context.js';

const CHECKUP_SYSTEM_PROMPT = `Checkup mode. You analyze the workspace state.

For each IN_PROGRESS dossier:
- If an action is needed (deadline, follow-up, work to advance) → add it to "launch"
- If a dossier has a "## Pending" section, do NOT relaunch it unless a date is mentioned there and has passed
- If a dossier has a "NEXT ACTION:" or "PROCHAINE ACTION:" field with a past date/time → add it to "launch"

For suggestions — be VERY selective. A suggestion is a REAL actionable task the user should launch:
- YES: "Email received from Sopra requesting March timesheets" (concrete action triggered by an external event)
- YES: "VAT declaration deadline is in 3 days" (urgent action with deadline)
- NO: "Archive completed dossiers" (internal housekeeping, not a task)
- NO: "Bitcoin tracking incomplete" (that's a gap/bug, not a suggestion)
- NO: "Improve process X" (that's a gap, belongs in _gaps/gaps.md)

If you detect a technical issue or system improvement → write it in _gaps/gaps.md, not in suggestions.

Respond ONLY in JSON:
{ "launch": ["dossier-id", ...], "suggestions": [{ "title": "...", "urgency": "urgent|normal|low", "why": "..." }] }`;

type RunClaudeFn = (args: string[], opts: { cwd: string; timeout?: number }) => Promise<string>;

interface CheckupStatus {
  lastRun: string | null;
  nextRun: string | null;
  result: 'ok' | 'error' | 'pending';
  launched: string[];
  suggestions: number;
}

export function createCheckup(deps: {
  launcher: {
    launchSession: (id: string) => Promise<void>;
    sendMessage: (id: string, message: string) => Promise<void>;
    listActiveSessions: () => Array<{ dossierId: string }>;
  };
  workspaceDir: string;
  intervalMs: number;
  runClaude?: RunClaudeFn;
  spawnClaude?: SpawnClaudeSimpleFn;
  sse?: { emit(event: { type: string; data: Record<string, unknown>; timestamp: string }): void };
  notificationStore?: { record(input: { message: string; link: string; dossierId?: string }): unknown };
  memoryManager?: { readAllFiles: () => MemoryEntry[] };
  suggestionsManager?: { listSuggestions: () => Array<{ title: string }> };
}) {
  const startedAt = Date.now();
  const status: CheckupStatus = {
    lastRun: null,
    nextRun: new Date(startedAt + deps.intervalMs).toISOString(),
    result: 'pending',
    launched: [],
    suggestions: 0,
  };

  async function runCheckup(): Promise<{ launched: string[]; suggestions: number }> {
    const prompt = `Read workspace/*/state.md in ${deps.workspaceDir}. Analyze each active dossier.`;

    // Build system prompt with memory context
    const memoryContext = deps.memoryManager
      ? buildMemoryContext(deps.memoryManager.readAllFiles())
      : '';
    const existingSuggestions = deps.suggestionsManager?.listSuggestions() ?? [];
    const suggestionsBlock = existingSuggestions.length > 0
      ? `\n\nExisting suggestions (do NOT recreate similar ones):\n${existingSuggestions.map(s => `- ${s.title}`).join('\n')}`
      : '';

    const systemPrompt = memoryContext
      ? `${CHECKUP_SYSTEM_PROMPT}${suggestionsBlock}\n\n## Global memory (persistent context)\n${memoryContext}`
      : `${CHECKUP_SYSTEM_PROMPT}${suggestionsBlock}`;

    let stdout: string;

    try {
    const clArgs = ['-p', '--system-prompt', systemPrompt, '--allowedTools', 'Read,Glob,Grep,Write', '--', prompt];

    if (deps.runClaude) {
      stdout = await deps.runClaude(clArgs, { cwd: deps.workspaceDir, timeout: 3_600_000 });
    } else if (deps.spawnClaude) {
      stdout = await deps.spawnClaude({ args: clArgs, cwd: deps.workspaceDir, type: 'checkup', description: 'Periodic workspace scan' });
    } else {
      throw new Error('[checkup] No Claude runner provided — pass runClaude or spawnClaude');
    }
    } catch (err) {
      throw err;
    }

    // Parse JSON de la réponse (Claude peut wrapper dans ```json)
    const jsonMatch = stdout.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn('[checkup] No JSON in Claude response');
      return { launched: [], suggestions: 0 };
    }

    const result = JSON.parse(jsonMatch[0]) as {
      launch: string[];
      suggestions: Array<{ title: string; urgency: string; why: string }>;
    };

    // Launch sessions (with NEXT ACTION date guard)
    const activeDossierIds = new Set(deps.launcher.listActiveSessions().map(s => s.dossierId));
    const validLaunches: string[] = [];
    for (const dossierId of result.launch) {
      try {
        const statePath = path.join(deps.workspaceDir, dossierId, 'state.md');
        const stateContent = fs.readFileSync(statePath, 'utf-8');
        const prochaineMatch = stateContent.match(/PROCHAINE ACTION\s*:\s*(\d{4}-\d{2}-\d{2}[\sT]\d{2}:\d{2})/);
        if (prochaineMatch) {
          const nextDate = new Date(prochaineMatch[1].replace(' ', 'T'));
          if (nextDate.getTime() > Date.now()) {
            console.log(`[checkup] ${dossierId} PROCHAINE ACTION ${prochaineMatch[1]} not reached yet, skipping`);
            continue;
          }
        }
        validLaunches.push(dossierId);
        if (activeDossierIds.has(dossierId)) {
          await deps.launcher.sendMessage(dossierId, 'Checkup: reprends ton travail, les conditions sont remplies.');
        } else {
          await deps.launcher.launchSession(dossierId);
        }
      } catch (err) {
        console.warn(`[checkup] failed to launch ${dossierId}:`, err);
      }
    }

    // Write suggestions to _suggestions/
    if (result.suggestions?.length) {
      const suggestionsDir = path.join(deps.workspaceDir, '_suggestions');
      fs.mkdirSync(suggestionsDir, { recursive: true });
      for (const suggestion of result.suggestions) {
        const slug = generateSlug(suggestion.title);
        const content = `# ${suggestion.title}\n\n**Urgence :** ${suggestion.urgency}\n**Source :** checkup\n**Date :** ${new Date().toISOString().slice(0, 10)}\n\n## Pourquoi\n${suggestion.why}\n`;
        fs.writeFileSync(path.join(suggestionsDir, `${slug}.md`), content);
      }
    }

    const checkupResult = { launched: validLaunches, suggestions: result.suggestions?.length ?? 0 };

    // Emit SSE if suggestions were created
    if (result.suggestions?.length) {
      deps.sse?.emit({ type: 'amelioration:created', data: { count: result.suggestions.length }, timestamp: new Date().toISOString() });
    }

    const now = Date.now();
    status.lastRun = new Date(now).toISOString();
    status.nextRun = new Date(now + deps.intervalMs).toISOString();
    status.result = 'ok';
    status.launched = result.launch;
    status.suggestions = checkupResult.suggestions;

    // Record checkup activity notification
    const parts: string[] = [];
    if (result.launch.length > 0) {
      parts.push(`${result.launch.length} session${result.launch.length > 1 ? 's' : ''} lancée${result.launch.length > 1 ? 's' : ''}`);
    }
    if (checkupResult.suggestions > 0) {
      parts.push(`${checkupResult.suggestions} suggestion${checkupResult.suggestions > 1 ? 's' : ''} créée${checkupResult.suggestions > 1 ? 's' : ''}`);
    }
    const summary = parts.length > 0 ? parts.join(', ') : 'rien à signaler';
    deps.notificationStore?.record({ message: `Checkup terminé — ${summary}`, link: '/' });
    deps.sse?.emit({ type: 'notification:sent', data: { source: 'checkup' }, timestamp: new Date(now).toISOString() });

    return checkupResult;
  }

  function getStatus(): CheckupStatus {
    return { ...status };
  }

  return { runCheckup, getStatus };
}
