// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import fs from 'fs';
import path from 'path';
import type { Suggestion, UrgencyLevel } from '@opentidy/shared';
import { generateSlug } from '../../shared/slug.js';

const URGENCY_ORDER: Record<UrgencyLevel, number> = { urgent: 0, normal: 1, low: 2 };
const MAX_SUGGESTIONS = 20;

export function createSuggestionsManager(workspaceDir: string) {
  const suggestionsDir = path.join(workspaceDir, '_suggestions');

  function parseField(content: string, fieldName: string): string {
    // Match both "**Field :** value" and "FIELD: value" formats
    const patterns = [
      new RegExp(`\\*\\*${fieldName}\\s*:\\*\\*\\s*(.+)$`, 'mi'),
      new RegExp(`\\*\\*${fieldName}\\s*:\\s*\\*\\*\\s*(.+)$`, 'mi'),
      new RegExp(`${fieldName.toUpperCase()}\\s*:\\s*(.+)$`, 'mi'),
    ];
    for (const p of patterns) {
      const match = content.match(p);
      if (match) return match[1].trim();
    }
    return '';
  }

  function parseSection(content: string, sectionName: string): string {
    const match = content.match(new RegExp(`## ${sectionName}\\n([\\s\\S]*?)(?=\\n## |$)`));
    return match?.[1]?.trim() ?? '';
  }

  function parseSuggestionFile(slug: string): Suggestion {
    const content = fs.readFileSync(path.join(suggestionsDir, `${slug}.md`), 'utf-8');
    const title = content.match(/^# (.+)$/m)?.[1]?.trim() ?? slug;
    const urgency = (parseField(content, 'Urgency') || parseField(content, 'Urgence') || 'normal') as UrgencyLevel;
    const source = parseField(content, 'Source');
    const date = parseField(content, 'Date');
    const summary = parseSection(content, 'Summary') || parseSection(content, 'Résumé') || parseSection(content, 'Resume');
    const why = parseSection(content, 'Why') || parseSection(content, 'Pourquoi');
    const whatIWouldDo = parseSection(content, 'What I would do') || parseSection(content, 'Ce que je ferais');
    const context = parseSection(content, 'Context') || parseSection(content, 'Contexte');
    return { slug, title, urgency, source, date, summary: summary || why, why, whatIWouldDo, context };
  }

  function listSuggestions(): Suggestion[] {
    if (!fs.existsSync(suggestionsDir)) return [];
    return fs.readdirSync(suggestionsDir)
      .filter(f => f.endsWith('.md'))
      .map(f => parseSuggestionFile(f.replace('.md', '')))
      .sort((a, b) => (URGENCY_ORDER[a.urgency] ?? 1) - (URGENCY_ORDER[b.urgency] ?? 1))
      .slice(0, MAX_SUGGESTIONS);
  }

  function isDuplicateSuggestion(title: string): boolean {
    const existing = listSuggestions();
    return existing.some(s => s.title.toLowerCase() === title.toLowerCase());
  }

  function ignoreSuggestion(slug: string): void {
    const suggFile = path.join(suggestionsDir, `${slug}.md`);
    if (fs.existsSync(suggFile)) fs.unlinkSync(suggFile);
    console.log(`[suggestions] suggestion ignored: ${slug}`);
  }

  function writeSuggestion(
    suggestion: { title: string; urgency: string; why: string; summary?: string; whatIWouldDo?: string },
    source: string,
    eventContent?: string,
  ): string {
    const slug = generateSlug(suggestion.title);
    const lines = [
      `# ${suggestion.title}`,
      '',
      `**Urgency:** ${suggestion.urgency}`,
      `**Source:** ${source}`,
      `**Date:** ${new Date().toISOString().slice(0, 10)}`,
      '',
    ];
    if (suggestion.summary) {
      lines.push(`## Summary`, suggestion.summary, '');
    }
    lines.push(`## Why`, suggestion.why, '');
    if (suggestion.whatIWouldDo) {
      lines.push(`## What I would do`, suggestion.whatIWouldDo, '');
    }
    if (eventContent) {
      lines.push(`## Context`, eventContent.slice(0, 500), '');
    }
    fs.mkdirSync(suggestionsDir, { recursive: true });
    fs.writeFileSync(path.join(suggestionsDir, `${slug}.md`), lines.join('\n'));
    return slug;
  }

  return { listSuggestions, parseSuggestionFile, isDuplicateSuggestion, ignoreSuggestion, writeSuggestion };
}