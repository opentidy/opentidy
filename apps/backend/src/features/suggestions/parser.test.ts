// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createSuggestionsManager } from './parser.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('SuggestionsManager', () => {
  let wsDir: string;
  let sugg: ReturnType<typeof createSuggestionsManager>;

  beforeEach(() => {
    wsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opentidy-ws-'));
    fs.mkdirSync(path.join(wsDir, '_suggestions'), { recursive: true });
    sugg = createSuggestionsManager(wsDir);
  });
  afterEach(() => {
    fs.rmSync(wsDir, { recursive: true, force: true });
  });

  it('lists all suggestions with parsed fields', () => {
    fs.writeFileSync(
      path.join(wsDir, '_suggestions', 'test.md'),
      '# Test Suggestion\nURGENCY: normal\nSOURCE: gmail\nDATE: 2026-03-14\n\n## Summary\nTest\n\n## Why\nReason\n\n## What I would do\nAction',
    );
    const list = sugg.listSuggestions();
    expect(list).toHaveLength(1);
    expect(list[0].slug).toBe('test');
    expect(list[0].urgency).toBe('normal');
  });

  it('detects duplicate suggestion by title similarity', () => {
    fs.writeFileSync(path.join(wsDir, '_suggestions', 'existing.md'), '# VAT Declaration\nURGENCY: normal');
    expect(sugg.isDuplicateSuggestion('VAT Declaration')).toBe(true);
    expect(sugg.isDuplicateSuggestion('Something completely different')).toBe(false);
  });

  it('sorts suggestions by urgency (urgent first)', () => {
    fs.writeFileSync(path.join(wsDir, '_suggestions', 'a.md'), '# A\nURGENCY: low');
    fs.writeFileSync(path.join(wsDir, '_suggestions', 'b.md'), '# B\nURGENCY: urgent');
    const list = sugg.listSuggestions();
    expect(list[0].urgency).toBe('urgent');
  });

  it('caps suggestions at 20 max', () => {
    for (let i = 0; i < 25; i++) {
      fs.writeFileSync(path.join(wsDir, '_suggestions', `s${i}.md`), `# S${i}\nURGENCY: normal`);
    }
    const list = sugg.listSuggestions();
    expect(list.length).toBeLessThanOrEqual(20);
  });
});