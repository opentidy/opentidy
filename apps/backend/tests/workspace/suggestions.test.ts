import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createSuggestionsManager } from '../../src/workspace/suggestions.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('SuggestionsManager', () => {
  let wsDir: string;
  let sugg: ReturnType<typeof createSuggestionsManager>;

  beforeEach(() => {
    wsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alfred-ws-'));
    fs.mkdirSync(path.join(wsDir, '_suggestions'), { recursive: true });
    sugg = createSuggestionsManager(wsDir);
  });
  afterEach(() => {
    fs.rmSync(wsDir, { recursive: true, force: true });
  });

  it('lists all suggestions with parsed fields', () => {
    fs.writeFileSync(
      path.join(wsDir, '_suggestions', 'test.md'),
      '# Test Suggestion\nURGENCE: normal\nSOURCE: gmail\nDATE: 2026-03-14\n\n## Résumé\nTest\n\n## Pourquoi\nReason\n\n## Ce que je ferais\nAction',
    );
    const list = sugg.listSuggestions();
    expect(list).toHaveLength(1);
    expect(list[0].slug).toBe('test');
    expect(list[0].urgency).toBe('normal');
  });

  it('detects duplicate suggestion by title similarity', () => {
    fs.writeFileSync(path.join(wsDir, '_suggestions', 'existing.md'), '# Déclaration TVA\nURGENCE: normal');
    expect(sugg.isDuplicateSuggestion('Déclaration TVA')).toBe(true);
    expect(sugg.isDuplicateSuggestion('Tout autre chose')).toBe(false);
  });

  it('sorts suggestions by urgency (urgent first)', () => {
    fs.writeFileSync(path.join(wsDir, '_suggestions', 'a.md'), '# A\nURGENCE: faible');
    fs.writeFileSync(path.join(wsDir, '_suggestions', 'b.md'), '# B\nURGENCE: urgent');
    const list = sugg.listSuggestions();
    expect(list[0].urgency).toBe('urgent');
  });

  it('caps suggestions at 20 max', () => {
    for (let i = 0; i < 25; i++) {
      fs.writeFileSync(path.join(wsDir, '_suggestions', `s${i}.md`), `# S${i}\nURGENCE: normal`);
    }
    const list = sugg.listSuggestions();
    expect(list.length).toBeLessThanOrEqual(20);
  });
});
