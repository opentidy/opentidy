import type { MemoryEntry } from '@alfred/shared';

export function buildMemoryContext(entries: MemoryEntry[]): string {
  if (!entries.length) return '';
  return entries
    .map(f => `- [${f.category}] ${f.description}: ${f.content.split('\n').slice(-3).join(' ')}`)
    .join('\n');
}
