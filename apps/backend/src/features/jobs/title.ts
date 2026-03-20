// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import type { AgentAdapter } from '@opentidy/shared';
import type { SpawnAgentFn } from '../../shared/spawn-agent.js';

const TITLE_SYSTEM_PROMPT = `Generate a short, descriptive title (max 50 characters) for this job.
The title should summarize the main action and key subject.
Examples of good titles:
- "Monthly invoice tracking"
- "Insurance annual report"
- "Follow up tax filing deadline"
- "Renewal reminder example.com"
- "Conference ticket comparison"
Reply ONLY with the title, no quotes or trailing punctuation.`;

export function cleanTitle(raw: string): string {
  let title = raw.trim();
  // Strip surrounding quotes (single, double, or backticks)
  title = title.replace(/^["'`]+|["'`]+$/g, '');
  // Strip trailing punctuation (period, ellipsis)
  title = title.replace(/[.…]+$/, '');
  // If multi-line, take only the first non-empty line
  const firstLine = title.split('\n').map(l => l.trim()).find(l => l.length > 0);
  title = firstLine ?? title;
  // Enforce max length (50 chars)
  if (title.length > 50) title = title.slice(0, 47) + '...';
  return title;
}

export function fallbackTitle(instruction: string): string {
  // Take first sentence or first 50 chars
  const firstSentence = instruction.split(/[.!?\n]/)[0]?.trim() ?? instruction;
  let title = firstSentence.slice(0, 50);
  if (firstSentence.length > 50) title = title.slice(0, 47) + '...';
  return title;
}

export function createTitleGenerator(workspaceDir: string, deps: {
  spawnAgent: SpawnAgentFn;
  adapter: AgentAdapter;
}) {
  return async function generateTitle(instruction: string): Promise<string> {
    try {
      console.log('[opentidy] Generating title via agent');
      const args = deps.adapter.buildArgs({
        mode: 'one-shot', cwd: workspaceDir, systemPrompt: TITLE_SYSTEM_PROMPT,
        instruction: `Job instruction:\n${instruction}`, outputFormat: 'text',
      });
      const stdout = await deps.spawnAgent({ args, cwd: workspaceDir, type: 'title', description: `Title generation: ${instruction.slice(0, 100)}` }).promise;

      const title = cleanTitle(stdout);
      if (!title) {
        throw new Error('Empty title generated');
      }
      console.log(`[opentidy] Generated title: "${title}"`);
      return title;
    } catch (err) {
      console.warn('[opentidy] Title generation failed, using fallback:', (err as Error).message);
      const title = fallbackTitle(instruction);
      console.log(`[opentidy] Fallback title: "${title}"`);
      return title;
    }
  };
}