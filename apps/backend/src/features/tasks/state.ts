// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import fs from 'fs';
import path from 'path';
import type { TaskStatus, Task, JournalEntry } from '@opentidy/shared';

// Normalize status strings: accepts both old French and new English values
function normalizeStatus(raw: string): TaskStatus {
  const upper = raw.toUpperCase().trim();
  // English values
  if (upper.startsWith('COMPLET')) return 'COMPLETED';
  if (upper.replace(/[\s_-]/g, '').startsWith('INPROGRESS')) return 'IN_PROGRESS';
  // French legacy values
  if (upper.startsWith('TERMIN')) return 'COMPLETED';
  if (upper.startsWith('BLOQU')) return 'COMPLETED';
  if (upper.startsWith('ARCHIV')) return 'COMPLETED';
  if (upper === 'EN COURS') return 'IN_PROGRESS';
  return 'IN_PROGRESS';
}

export function parseStateMd(taskDir: string): { title: string; status: TaskStatus; objective: string; lastAction: string; journal: JournalEntry[]; stateRaw: string; waitingFor?: string; waitingType: 'user' | 'tiers' | null } {
  const filePath = path.join(taskDir, 'state.md');
  if (!fs.existsSync(filePath)) return { title: '', status: 'IN_PROGRESS', objective: '', lastAction: '', journal: [], stateRaw: '', waitingType: null };

  const content = fs.readFileSync(filePath, 'utf-8');
  const title = content.match(/^# (.+)$/m)?.[1]?.trim() ?? '';
  const statusMatch = content.match(/(?:STATUT|STATUS)\s*:\s*(.+)$/m)?.[1]?.trim();
  const status: TaskStatus = statusMatch ? normalizeStatus(statusMatch) : 'IN_PROGRESS';
  const objective = content.match(/## (?:Objectif|Objective)\n(.+)/)?.[1]?.trim() ?? '';
  const lastActionMatch = content.match(/- (\d{4}-\d{2}-\d{2})/g);
  const lastAction = lastActionMatch ? lastActionMatch[lastActionMatch.length - 1].replace('- ', '') : '';
  // Parse journal entries
  const journalSection = content.match(/## (?:Journal|Log)\n([\s\S]*?)(?=\n## |\n*$)/)?.[1] ?? '';
  const journal = journalSection
    .split('\n')
    .filter(line => line.match(/^- \d{4}-\d{2}-\d{2}/))
    .map(line => {
      const match = line.match(/^- (\d{4}-\d{2}-\d{2})\s*:\s*(.+)/);
      return match ? { date: match[1], text: match[2].trim() } : null;
    })
    .filter(Boolean) as JournalEntry[];

  // Parse ## Waiting / ## En attente section
  const waitingForMatch = content.match(/## (?:En attente|Waiting)\n([\s\S]*?)(?=\n## |\n*$)/);
  const waitingFor = waitingForMatch?.[1]?.trim() || undefined;

  // Determine waiting type from ## En attente section content
  let waitingType: 'user' | 'tiers' | null = null;
  if (waitingFor) {
    if (/ATTENTE\s*:\s*TIERS/i.test(waitingFor)) {
      waitingType = 'tiers';
    } else {
      // Default to 'user' when section exists (with or without explicit ATTENTE: USER tag)
      waitingType = 'user';
    }
  }

  if (content.length > 50 && !title) console.warn(`[state] ${taskDir}: no title found in non-empty state.md`);
  if (content.length > 50 && !statusMatch) console.warn(`[state] ${taskDir}: no STATUS found in non-empty state.md`);
  if (content.length > 50 && !objective) console.warn(`[state] ${taskDir}: no objective found in non-empty state.md`);

  return { title, status, objective, lastAction, journal, stateRaw: content, waitingFor, waitingType };
}

export function setStatus(taskDir: string, newStatus: TaskStatus): void {
  const filePath = path.join(taskDir, 'state.md');
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf-8');
  const updated = content.match(/(?:STATUT|STATUS)\s*:\s*.+$/m)
    ? content.replace(/(?:STATUT|STATUS)\s*:\s*.+$/m, `STATUS: ${newStatus}`)
    : content + `\nSTATUS: ${newStatus}\n`;
  fs.writeFileSync(filePath, updated);
}

export function setWaitingType(taskDir: string, type: 'user' | 'tiers'): void {
  const filePath = path.join(taskDir, 'state.md');
  if (!fs.existsSync(filePath)) return;
  let content = fs.readFileSync(filePath, 'utf-8');
  const tag = `ATTENTE: ${type.toUpperCase()}`;

  const sectionMatch = content.match(/## (?:En attente|Waiting)\n([\s\S]*?)(?=\n## |\n*$)/);
  if (sectionMatch) {
    const sectionBody = sectionMatch[1];
    // Replace existing ATTENTE tag or insert at beginning
    if (/ATTENTE\s*:\s*(USER|TIERS)/i.test(sectionBody)) {
      const updated = sectionBody.replace(/ATTENTE\s*:\s*(USER|TIERS)/i, tag);
      content = content.replace(sectionBody, updated);
    } else {
      // Insert tag as first line of section (match whichever header exists)
      content = content.replace(/## (?:En attente|Waiting)\n/, (match) => `${match}${tag}\n`);
    }
  } else {
    // No waiting section. Create one with English header.
    content = content.trimEnd() + `\n\n## Waiting\n${tag}\n`;
  }
  fs.writeFileSync(filePath, content);
}

export function clearWaitingFor(taskDir: string): void {
  const filePath = path.join(taskDir, 'state.md');
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf-8');
  const cleaned = content.replace(/\n## (?:En attente|Waiting)\n[\s\S]*?(?=\n## |\n*$)/, '');
  if (cleaned !== content) {
    fs.writeFileSync(filePath, cleaned);
  }
}

export function listTaskIds(workspaceDir: string): string[] {
  return fs.readdirSync(workspaceDir)
    .filter(f => !f.startsWith('_') && !f.startsWith('.'))
    .filter(f => fs.statSync(path.join(workspaceDir, f)).isDirectory())
    .filter(f => fs.existsSync(path.join(workspaceDir, f, 'state.md')));
}

export function resolveTaskDir(workspaceDir: string, id: string): string {
  return path.join(workspaceDir, id);
}

export function getTask(workspaceDir: string, id: string): Task {
  const taskDir = resolveTaskDir(workspaceDir, id);
  const state = parseStateMd(taskDir);
  const artifactsDir = path.join(taskDir, 'artifacts');
  const artifacts = fs.existsSync(artifactsDir) ? fs.readdirSync(artifactsDir) : [];

  return {
    id,
    ...state,
    waitingType: state.waitingType ?? undefined,
    hasActiveSession: false,
    artifacts,
  };
}