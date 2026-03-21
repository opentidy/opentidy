// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import type { MemoryEntry, AgentAdapter } from '@opentidy/shared';
import type { SpawnAgentFn } from '../../shared/spawn-agent.js';
import { buildMemoryContext } from '../../shared/memory-context.js';

const CHECKUP_SYSTEM_PROMPT = `Checkup mode. You analyze the workspace state.

For each IN_PROGRESS task:
- If an action is needed (deadline, follow-up, work to advance) → add it to "launch"
- If a task has a "## Pending" section, do NOT relaunch it unless a date is mentioned there and has passed
- If a task has a "NEXT ACTION:" or "PROCHAINE ACTION:" field with a past date/time → add it to "launch"

For suggestions — be VERY selective. A suggestion is a REAL actionable task the user should launch:
- YES: "Email received from client requesting March timesheets" (concrete action triggered by an external event)
- YES: "VAT declaration deadline is in 3 days" (urgent action with deadline)
- NO: "Archive completed tasks" (internal housekeeping, not a task)
- NO: "Bitcoin tracking incomplete" (that's a gap/bug, not a suggestion)
- NO: "Improve process X" (that's a gap, belongs in _gaps/gaps.md)

If you detect a technical issue or system improvement → write it in _gaps/gaps.md, not in suggestions.

Respond ONLY in JSON:
{ "launch": ["task-id", ...], "suggestions": [{ "title": "...", "urgency": "urgent|normal|low", "why": "..." }] }`;

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
    listActiveSessions: () => Array<{ taskId: string }>;
  };
  workspaceDir: string;
  intervalMs: number;
  spawnAgent: SpawnAgentFn;
  adapter: AgentAdapter;
  sse?: { emit(event: { type: string; data: Record<string, unknown>; timestamp: string }): void };
  notificationStore?: { record(input: { message: string; link: string; taskId?: string }): unknown };
  memoryManager?: { readAllFiles: () => MemoryEntry[] };
  suggestionsManager?: { listSuggestions: () => Array<{ title: string }> };
  writeSuggestion?: (suggestion: { title: string; urgency: string; why: string }, source: string) => string;
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
    const prompt = `Read workspace/*/state.md in ${deps.workspaceDir}. Analyze each active task.`;

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

    const clArgs = deps.adapter.buildArgs({
      mode: 'one-shot', cwd: deps.workspaceDir, systemPrompt,
      instruction: prompt, allowedTools: ['Read', 'Glob', 'Grep', 'Write'],
    });
    const stdout = await deps.spawnAgent({ args: clArgs, cwd: deps.workspaceDir, type: 'checkup', description: 'Periodic workspace scan' }).promise;

    // Parse JSON from the response (Claude may wrap in ```json)
    const jsonMatch = stdout.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn('[checkup] No JSON in Claude response');
      return { launched: [], suggestions: 0 };
    }

    const result = JSON.parse(jsonMatch[0]) as {
      launch: string[];
      suggestions: Array<{ title: string; urgency: string; why: string }>;
    };

    // Launch sessions — skip active sessions (scheduler handles precise timing)
    const activeTaskIds = new Set(deps.launcher.listActiveSessions().map(s => s.taskId));
    const validLaunches: string[] = [];
    for (const taskId of result.launch) {
      try {
        if (activeTaskIds.has(taskId)) {
          console.log(`[checkup] ${taskId} has active session, skipping`);
          continue;
        }
        validLaunches.push(taskId);
        await deps.launcher.launchSession(taskId);
      } catch (err) {
        console.warn(`[checkup] failed to launch ${taskId}:`, err);
      }
    }

    // Write suggestions via suggestionsManager
    if (result.suggestions?.length && deps.writeSuggestion) {
      for (const suggestion of result.suggestions) {
        deps.writeSuggestion(suggestion, 'checkup');
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
      parts.push(`${result.launch.length} session${result.launch.length > 1 ? 's' : ''} launched`);
    }
    if (checkupResult.suggestions > 0) {
      parts.push(`${checkupResult.suggestions} suggestion${checkupResult.suggestions > 1 ? 's' : ''} created`);
    }
    const summary = parts.length > 0 ? parts.join(', ') : 'nothing to report';
    deps.notificationStore?.record({ message: `Checkup completed — ${summary}`, link: '/' });
    deps.sse?.emit({ type: 'notification:sent', data: { source: 'checkup' }, timestamp: new Date(now).toISOString() });

    return checkupResult;
  }

  function getStatus(): CheckupStatus {
    return { ...status };
  }

  return { runCheckup, getStatus };
}