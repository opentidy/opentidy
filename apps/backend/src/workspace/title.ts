import type { SpawnClaudeSimpleFn } from '../infra/spawn-claude.js';

const TITLE_SYSTEM_PROMPT = `Generate a short, descriptive title (max 50 characters) for this dossier.
The title should summarize the main action and key subject.
Examples of good titles:
- "Daily weather recap Limassol"
- "Cyprus non-dom tax watch"
- "Weekend Paphos March 22-23"
- "Renewal reminder example.com"
- "Flight price tracker LCA → BRU"
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
  spawnClaude: SpawnClaudeSimpleFn;
}) {
  return async function generateTitle(instruction: string): Promise<string> {
    try {
      console.log('[opentidy] Generating title via claude -p');
      const args = ['-p', '--output-format', 'text', '--system-prompt', TITLE_SYSTEM_PROMPT, `Dossier instruction:\n${instruction}`];
      const stdout = await deps.spawnClaude({ args, cwd: workspaceDir, type: 'title', description: `Title generation: ${instruction.slice(0, 100)}` });

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
