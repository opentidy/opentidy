// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import type { TaskStatus, MemoryEntry, AgentAdapter } from '@opentidy/shared';
import type { SpawnAgentFn } from '../../shared/spawn-agent.js';
import { buildMemoryContext } from '../../shared/memory-context.js';

const TRIAGE_SYSTEM_PROMPT = `Triage mode. You receive an event and the list of active tasks (with their full state.md).
Decide:
1. If the event relates to one or more existing tasks → { "taskIds": ["id1", ...] }
   - Check the "## Waiting" section: if a task is waiting for exactly this type of info, it's a match
2. If it's a new topic requiring a CONCRETE ACTION from the user → { "suggestion": { "title": "...", "urgency": "urgent|normal|low", "source": "...", "summary": "...", "why": "...", "whatIWouldDo": "..." } }
   - The suggestion must be a REAL task: reply to an email, handle a request, meet a deadline
   - "summary": one-liner factual description (who sent it, what's it about)
   - "why": specific reasons with concrete details (dates, amounts, consequences). Never be vague.
   - "whatIWouldDo": concrete steps to resolve this
   - Do NOT create suggestions for cleanup, optimization, or technical observations
3. If it's spam, a newsletter, marketing email, or not relevant → { "ignore": true, "reason": "..." }
Respond ONLY in JSON, nothing else.`;

const TRIAGE_BATCH_SYSTEM_PROMPT = `Triage mode (batch). You receive MULTIPLE events and the list of active tasks (with their full state.md).
For EACH event, decide independently:
1. If the event relates to one or more existing tasks → { "taskIds": ["id1", ...] }
   - Check the "## Waiting" section: if a task is waiting for exactly this type of info, it's a match
2. If it's a new topic requiring a CONCRETE ACTION from the user → { "suggestion": { "title": "...", "urgency": "urgent|normal|low", "source": "...", "summary": "...", "why": "...", "whatIWouldDo": "..." } }
   - The suggestion must be a REAL task: reply to an email, handle a request, meet a deadline
   - "summary": one-liner factual description (who sent it, what's it about)
   - "why": specific reasons with concrete details (dates, amounts, consequences). Never be vague.
   - "whatIWouldDo": concrete steps to resolve this
   - Do NOT create suggestions for cleanup, optimization, or technical observations
3. If it's spam, a newsletter, marketing email, or not relevant → { "ignore": true, "reason": "..." }
Respond with a JSON ARRAY containing one result object per event, in the SAME ORDER as the events. Nothing else.`;

export interface TriageResult {
  taskIds?: string[];
  suggestion?: { title: string; urgency: string; source: string; why: string };
  ignore?: boolean;
  reason?: string;
}

interface TaskSummary {
  id: string;
  title: string;
  status: TaskStatus;
  stateRaw: string;
}

export function createTriager(deps: {
  runClaude: (prompt: string, opts?: { systemPrompt?: string; description?: string }) => Promise<string>;
  listTasks: () => TaskSummary[];
  listSuggestionTitles?: () => string[];
}) {
  function buildTaskContext(): { taskList: string; suggestionsBlock: string } {
    const tasks = deps.listTasks();
    const taskList = tasks
      .map(d => `--- ${d.id} ---\n${d.stateRaw}`)
      .join('\n\n');

    const existingSuggestions = deps.listSuggestionTitles?.() ?? [];
    const suggestionsBlock = existingSuggestions.length > 0
      ? `\n\nExisting suggestions (do NOT recreate similar ones):\n${existingSuggestions.map(t => `- ${t}`).join('\n')}`
      : '';

    return { taskList, suggestionsBlock };
  }

  async function triage(event: { source: string; content: string }): Promise<TriageResult> {
    const { taskList, suggestionsBlock } = buildTaskContext();
    const prompt = `Active tasks (full state.md content):\n\n${taskList}${suggestionsBlock}\n\n---\n\nEvent (source: ${event.source}):\n${event.content}`;

    try {
      const stdout = await deps.runClaude(prompt);
      const jsonMatch = stdout.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON in response');
      return JSON.parse(jsonMatch[0]) as TriageResult;
    } catch (error) {
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

  async function triageBatch(events: Array<{ source: string; content: string }>): Promise<TriageResult[]> {
    if (events.length === 1) return [await triage(events[0])];

    const { taskList, suggestionsBlock } = buildTaskContext();
    const eventList = events
      .map((e, i) => `### Event #${i + 1} (source: ${e.source})\n${e.content}`)
      .join('\n\n');
    const prompt = `Active tasks (full state.md content):\n\n${taskList}${suggestionsBlock}\n\n---\n\n${events.length} events to triage:\n\n${eventList}`;

    try {
      const stdout = await deps.runClaude(prompt, {
        systemPrompt: TRIAGE_BATCH_SYSTEM_PROMPT,
        description: `Triage batch (${events.length} events)`,
      });
      const jsonMatch = stdout.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error('No JSON array in batch response');
      const results = JSON.parse(jsonMatch[0]) as TriageResult[];
      if (results.length !== events.length) {
        console.warn(`[triage] Batch returned ${results.length} results for ${events.length} events`);
      }
      return results;
    } catch (error) {
      console.error('[triage] Batch failed, creating fallback suggestions:', error);
      return events.map(e => ({
        suggestion: {
          title: `Unsorted event (${e.source})`,
          urgency: 'normal',
          source: e.source,
          why: `Automatic triage failed. Content: ${e.content.slice(0, 200)}`,
        },
      }));
    }
  }

  return { triage, triageBatch };
}

// Production: runAgent calls agent CLI via spawnAgent
export function createAgentRunner(workspaceDir: string, deps: {
  memoryManager?: { readAllFiles: () => MemoryEntry[] };
  spawnAgent: SpawnAgentFn;
  adapter: AgentAdapter;
}) {
  return async function runAgent(
    prompt: string,
    opts?: { systemPrompt?: string; description?: string },
  ): Promise<string> {
    const description = opts?.description ?? 'Triage incoming email/event';
    console.log(`[triage] Running agent: ${description}`);

    const memoryContext = deps.memoryManager
      ? buildMemoryContext(deps.memoryManager.readAllFiles())
      : '';

    const basePrompt = opts?.systemPrompt ?? TRIAGE_SYSTEM_PROMPT;
    const systemPrompt = memoryContext
      ? `${basePrompt}\n\n## Global memory (persistent context)\n${memoryContext}`
      : basePrompt;

    const args = deps.adapter.buildArgs({ mode: 'one-shot', cwd: workspaceDir, systemPrompt, instruction: prompt });
    return deps.spawnAgent({ args, cwd: workspaceDir, type: 'triage', description, instruction: prompt }).promise;
  };
}
