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

  it('ignoreSuggestion deletes the suggestion file', () => {
    const suggFile = path.join(wsDir, '_suggestions', 'test-sugg.md');
    fs.writeFileSync(suggFile, '# Test');
    sugg.ignoreSuggestion('test-sugg');
    expect(fs.existsSync(suggFile)).toBe(false);
  });

  it('ignoreSuggestion does not throw for missing file', () => {
    expect(() => sugg.ignoreSuggestion('nonexistent')).not.toThrow();
  });

  it('writeSuggestion creates a suggestion file with correct format', () => {
    const slug = sugg.writeSuggestion(
      { title: 'Tax Filing', urgency: 'urgent', why: 'Deadline approaching' },
      'gmail',
    );
    expect(slug).toBeTruthy();
    const files = fs.readdirSync(path.join(wsDir, '_suggestions'));
    expect(files.length).toBe(1);
    const content = fs.readFileSync(path.join(wsDir, '_suggestions', files[0]), 'utf-8');
    expect(content).toContain('# Tax Filing');
    expect(content).toContain('**Urgency:** urgent');
    expect(content).toContain('**Source:** gmail');
    expect(content).toContain('## Why');
    expect(content).toContain('Deadline approaching');
  });

  it('writeSuggestion includes context section when eventContent provided', () => {
    sugg.writeSuggestion(
      { title: 'New Task', urgency: 'normal', why: 'Needs action' },
      'gmail',
      'Email from alice@example.com about timesheets',
    );
    const files = fs.readdirSync(path.join(wsDir, '_suggestions'));
    const content = fs.readFileSync(path.join(wsDir, '_suggestions', files[0]), 'utf-8');
    expect(content).toContain('## Context');
    expect(content).toContain('Email from alice@example.com about timesheets');
  });

  it('writeSuggestion truncates long event content to 500 chars', () => {
    const longContent = 'A'.repeat(1000);
    sugg.writeSuggestion(
      { title: 'Long', urgency: 'low', why: 'Test' },
      'checkup',
      longContent,
    );
    const files = fs.readdirSync(path.join(wsDir, '_suggestions'));
    const content = fs.readFileSync(path.join(wsDir, '_suggestions', files[0]), 'utf-8');
    // Context should contain at most 500 A's
    const contextMatch = content.match(/Original event: (A+)/);
    expect(contextMatch![1].length).toBe(500);
  });
});