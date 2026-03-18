import type { SpawnClaudeSimpleFn } from '../infra/spawn-claude.js';

const TITLE_SYSTEM_PROMPT = `Génère un titre court et descriptif (max 50 caractères) pour ce dossier.
Le titre doit résumer l'action principale et le sujet clé.
Exemples de bons titres :
- "Récap météo quotidien Limassol"
- "Veille fiscale Chypre non-dom"
- "Week-end Paphos 22-23 mars"
- "Rappel renouvellement loaddr.com"
- "Surveillance prix vols LCA → BRU"
Réponds UNIQUEMENT avec le titre, sans guillemets ni ponctuation finale.`;

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
      console.log('[alfred] Generating title via claude -p');
      const args = ['-p', '--output-format', 'text', '--system-prompt', TITLE_SYSTEM_PROMPT, `Instruction du dossier :\n${instruction}`];
      const stdout = await deps.spawnClaude({ args, cwd: workspaceDir, type: 'title', description: `Génération titre: ${instruction.slice(0, 100)}` });

      const title = cleanTitle(stdout);
      if (!title) {
        throw new Error('Empty title generated');
      }
      console.log(`[alfred] Generated title: "${title}"`);
      return title;
    } catch (err) {
      console.warn('[alfred] Title generation failed, using fallback:', (err as Error).message);
      const title = fallbackTitle(instruction);
      console.log(`[alfred] Fallback title: "${title}"`);
      return title;
    }
  };
}
