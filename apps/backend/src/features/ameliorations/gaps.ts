// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import fs from 'fs';
import path from 'path';
import type { Amelioration, AmeliorationStatus, AmeliorationSource, AmeliorationCategory } from '@opentidy/shared';

export function createGapsManager(workspaceDir: string) {
  const gapsFile = path.join(workspaceDir, '_gaps', 'gaps.md');

  function detectStatus(text: string): AmeliorationStatus {
    if (text.includes('[RÉSOLU]') || text.includes('[RESOLVED]')) return 'resolved';
    if (text.includes('[IGNORÉ]') || text.includes('[IGNORED]')) return 'ignored';
    return 'open';
  }

  function parseStructuredSections(content: string): Amelioration[] {
    const sections = content.split(/^---$/m).filter(s => s.trim());
    return sections.map((section, i) => {
      const title = section.match(/## .+? — (.+)/)?.[1]?.replace(/\[RÉSOLU\]|\[IGNORÉ\]|\[RESOLVED\]|\[IGNORED\]/g, '').trim() ?? '';
      const date = section.match(/## (\d{4}-\d{2}-\d{2})/)?.[1] ?? '';
      const problem = section.match(/\*\*Problème:\*\*\s*(.+)/)?.[1]?.trim() ?? '';
      const impact = section.match(/\*\*Impact:\*\*\s*(.+)/)?.[1]?.trim() ?? '';
      const suggestion = section.match(/\*\*Suggestion:\*\*\s*(.+)/)?.[1]?.trim() ?? '';
      const dossierId = section.match(/\*\*Dossier:\*\*\s*(.+)/)?.[1]?.trim() || undefined;
      const sessionId = section.match(/\*\*Session:\*\*\s*(.+)/)?.[1]?.trim() || undefined;
      const source = (section.match(/\*\*Source:\*\*\s*(.+)/)?.[1]?.trim() || undefined) as AmeliorationSource | undefined;
      const category = (section.match(/\*\*Catégorie:\*\*\s*(.+)/)?.[1]?.trim() || undefined) as AmeliorationCategory | undefined;

      // Parse recommended actions (bullet list after **Actions recommandées:**)
      const actionsBlock = section.match(/\*\*Actions recommandées:\*\*\n((?:- .+\n?)+)/);
      const actions = actionsBlock
        ? actionsBlock[1].split('\n').filter(l => l.trim().startsWith('- ')).map(l => l.replace(/^- /, '').trim())
        : [];

      const status = detectStatus(section);
      return { id: String(i), date, title, problem, impact, suggestion, actions, dossierId, sessionId, source, category, resolved: status === 'resolved', status };
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
      // Structured format — add marker after ## heading
      const sections = content.split(/^---$/m).filter(s => s.trim());
      if (index < sections.length) {
        sections[index] = sections[index]
          .replace(/\[RÉSOLU\]\s*/g, '')
          .replace(/\[IGNORÉ\]\s*/g, '')
          .replace(/\[RESOLVED\]\s*/g, '')
          .replace(/\[IGNORED\]\s*/g, '')
          .replace(/^(## .+)/m, `$1 ${marker}`);
      }
      fs.writeFileSync(gapsFile, sections.join('\n---\n') + '\n');
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

  return { listGaps, markResolved, markIgnored, isDuplicateGap };
}