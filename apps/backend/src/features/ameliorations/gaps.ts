// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import fs from 'fs';
import path from 'path';
import type { Amelioration, AmeliorationStatus, AmeliorationSource, AmeliorationCategory, AmeliorationFixType } from '@opentidy/shared';

export function createGapsManager(workspaceDir: string) {
  const gapsFile = path.join(workspaceDir, '_gaps', 'gaps.md');

  function detectStatus(text: string): AmeliorationStatus {
    if (text.includes('[RÉSOLU]') || text.includes('[RESOLVED]')) return 'resolved';
    if (text.includes('[IGNORÉ]') || text.includes('[IGNORED]')) return 'ignored';
    return 'open';
  }

  // Split structured content into sections — supports both `---` separators and `## date —` heading boundaries
  function splitSections(content: string): string[] {
    if (/^---$/m.test(content)) {
      return content.split(/^---$/m).filter(s => s.trim());
    }
    // Split by ## headings (each heading starts a new section)
    const sections: string[] = [];
    const lines = content.split('\n');
    let current = '';
    for (const line of lines) {
      if (/^## \d{4}-\d{2}-\d{2} — /.test(line) && current.trim()) {
        sections.push(current);
        current = '';
      }
      current += line + '\n';
    }
    if (current.trim()) sections.push(current);
    return sections;
  }

  // Match a field in both bold (**Field:**) and plain (Field:) format
  function matchField(section: string, ...names: string[]): string {
    for (const name of names) {
      const bold = section.match(new RegExp(`\\*\\*${name}:\\*\\*\\s*(.+)`))?.[1]?.trim();
      if (bold) return bold;
      const plain = section.match(new RegExp(`^${name}:\\s*(.+)`, 'm'))?.[1]?.trim();
      if (plain) return plain;
    }
    return '';
  }

  function parseStructuredSections(content: string): Amelioration[] {
    const sections = splitSections(content);
    return sections.map((section, i) => {
      const title = section.match(/## .+? — (.+)/)?.[1]?.replace(/\[RÉSOLU\]|\[IGNORÉ\]|\[RESOLVED\]|\[IGNORED\]/g, '').trim() ?? '';
      const date = section.match(/## (\d{4}-\d{2}-\d{2})/)?.[1] ?? '';
      const problem = matchField(section, 'Problème', 'Problem');
      const impact = matchField(section, 'Impact');
      const suggestion = matchField(section, 'Suggestion');
      const taskId = matchField(section, 'Task', 'TASK') || undefined;
      const sessionId = matchField(section, 'Session', 'SESSION') || undefined;
      const source = (matchField(section, 'Source', 'SOURCE') || undefined) as AmeliorationSource | undefined;
      const category = (matchField(section, 'Catégorie', 'Category', 'CATEGORY') || undefined) as AmeliorationCategory | undefined;

      // New actionable gap fields
      const fixType = (matchField(section, 'Fix type') || undefined) as AmeliorationFixType | undefined;
      const sanitizedTitle = matchField(section, 'Sanitized title') || undefined;
      const sanitizedBody = matchField(section, 'Sanitized') || undefined;
      const githubIssueStr = section.match(/\*\*GitHub Issue:\*\*\s*#?(\d+)/)?.[1] || section.match(/^GitHub Issue:\s*#?(\d+)/m)?.[1];
      const githubIssueNumber = githubIssueStr ? parseInt(githubIssueStr, 10) : undefined;
      const suggestionSlug = matchField(section, 'Suggestion slug') || undefined;

      // Parse recommended actions (bullet list after actions header)
      const actionsBlock = section.match(/\*\*(Actions recommandées|Recommended actions):\*\*\n((?:- .+\n?)+)/) ||
        section.match(/^(Actions recommandées|Recommended actions):\n((?:- .+\n?)+)/m);
      const actions = actionsBlock
        ? actionsBlock[2].split('\n').filter(l => l.trim().startsWith('- ')).map(l => l.replace(/^- /, '').trim())
        : [];

      // Detect resolved from RESOLVED: true field or marker
      const resolvedField = /^RESOLVED:\s*true/m.test(section);
      const status = resolvedField ? 'resolved' as AmeliorationStatus : detectStatus(section);
      return { id: String(i), date, title, problem, impact, suggestion, actions, taskId, sessionId, source, category, resolved: status === 'resolved', status, fixType, sanitizedTitle, sanitizedBody, githubIssueNumber, suggestionSlug };
    });
  }

  function parseBulletLines(content: string): Amelioration[] {
    const lines = content.split('\n').filter(l => l.trim().startsWith('- ['));
    return lines.map((line, i) => {
      const dateMatch = line.match(/- \[(\d{4}-\d{2}-\d{2})\]\s*/);
      const date = dateMatch?.[1] ?? '';
      const text = line.replace(/^- \[\d{4}-\d{2}-\d{2}\]\s*/, '').replace(/\[RÉSOLU\]\s*/g, '').replace(/\[IGNORÉ\]\s*/g, '').replace(/\[RESOLVED\]\s*/g, '').replace(/\[IGNORED\]\s*/g, '').trim();
      const titleEnd = text.indexOf('. ');
      const title = titleEnd > 0 && titleEnd < 80 ? text.slice(0, titleEnd) : text.slice(0, 80);
      const status = detectStatus(line);
      return { id: String(i), date, title, problem: text, impact: '', suggestion: '', actions: [], resolved: status === 'resolved', status };
    });
  }

  function parseGapsFile(): Amelioration[] {
    if (!fs.existsSync(gapsFile)) return [];
    const content = fs.readFileSync(gapsFile, 'utf-8');

    // Structured format uses --- separators with ## date — title headings
    const hasStructuredFormat = /^## \d{4}-\d{2}-\d{2} — /m.test(content);

    if (hasStructuredFormat) {
      return parseStructuredSections(content);
    }

    // Legacy bullet-point format: - [date] description
    return parseBulletLines(content);
  }

  function listGaps(): Amelioration[] {
    return parseGapsFile();
  }

  function applyMarker(index: number, marker: '[RESOLVED]' | '[IGNORED]'): void {
    if (!fs.existsSync(gapsFile)) return;
    const content = fs.readFileSync(gapsFile, 'utf-8');

    // Detect format
    const hasStructured = /^## \d{4}-\d{2}-\d{2} — /m.test(content);

    if (!hasStructured) {
      // Legacy bullet format
      const lines = content.split('\n');
      let bulletIndex = 0;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim().startsWith('- [')) {
          if (bulletIndex === index) {
            lines[i] = lines[i]
              .replace(/\[RÉSOLU\]\s*/g, '')
              .replace(/\[IGNORÉ\]\s*/g, '')
              .replace(/\[RESOLVED\]\s*/g, '')
              .replace(/\[IGNORED\]\s*/g, '')
              .replace(/^(- \[\d{4}-\d{2}-\d{2}\])\s*/, `$1 ${marker} `);
            break;
          }
          bulletIndex++;
        }
      }
      fs.writeFileSync(gapsFile, lines.join('\n'));
    } else {
      // Structured format — use same splitSections logic
      const hasSeparators = /^---$/m.test(content);
      const sections = splitSections(content);
      if (index < sections.length) {
        sections[index] = sections[index]
          .replace(/\[RÉSOLU\]\s*/g, '')
          .replace(/\[IGNORÉ\]\s*/g, '')
          .replace(/\[RESOLVED\]\s*/g, '')
          .replace(/\[IGNORED\]\s*/g, '')
          .replace(/^(## .+)/m, `$1 ${marker}`);
      }
      const separator = hasSeparators ? '\n---\n' : '\n';
      fs.writeFileSync(gapsFile, sections.join(separator) + '\n');
    }
    console.log(`[workspace] gap ${marker}: ${index}`);
  }

  function markResolved(index: number): void {
    applyMarker(index, '[RESOLVED]');
  }

  function markIgnored(index: number): void {
    applyMarker(index, '[IGNORED]');
  }

  function isDuplicateGap(title: string): boolean {
    return parseGapsFile().some(g => g.title.toLowerCase().includes(title.toLowerCase()));
  }

  function updateGapFields(index: number, fields: { githubIssueNumber?: number; suggestionSlug?: string }): void {
    if (!fs.existsSync(gapsFile)) return;
    const content = fs.readFileSync(gapsFile, 'utf-8');
    const hasStructured = /^## \d{4}-\d{2}-\d{2} — /m.test(content);
    if (!hasStructured) return;

    const sections = splitSections(content);
    if (index >= sections.length) return;

    let section = sections[index];
    if (fields.githubIssueNumber != null) {
      section = section.replace(/\*\*GitHub Issue:\*\*.*\n?/, '');
      section = section.trimEnd() + `\n**GitHub Issue:** #${fields.githubIssueNumber}\n`;
    }
    if (fields.suggestionSlug != null) {
      section = section.replace(/\*\*Suggestion slug:\*\*.*\n?/, '');
      section = section.trimEnd() + `\n**Suggestion slug:** ${fields.suggestionSlug}\n`;
    }
    sections[index] = section;
    const hasSeparators = /^---$/m.test(content);
    const separator = hasSeparators ? '\n---\n' : '\n';
    fs.writeFileSync(gapsFile, sections.join(separator) + '\n');
    console.log(`[workspace] gap fields updated: index=${index}`);
  }

  return { listGaps, markResolved, markIgnored, isDuplicateGap, updateGapFields };
}