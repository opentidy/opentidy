import fs from 'fs';
import path from 'path';
import type { DossierStatus, Dossier, JournalEntry } from '@opentidy/shared';

const VALID_STATUSES: DossierStatus[] = ['EN COURS', 'TERMINÉ'];

// Normalize accented status strings — Claude sometimes writes TERMINE without accent
function normalizeStatus(raw: string): DossierStatus {
  const upper = raw.toUpperCase().trim();
  if (upper.startsWith('TERMIN')) return 'TERMINÉ';
  if (upper.startsWith('BLOQU')) return 'TERMINÉ';
  if (upper.startsWith('ARCHIV')) return 'TERMINÉ';
  if (upper === 'EN COURS') return 'EN COURS';
  return 'EN COURS';
}

export function parseStateMd(dossierDir: string): { title: string; status: DossierStatus; objective: string; lastAction: string; confirm: boolean; journal: JournalEntry[]; stateRaw: string; waitingFor?: string; waitingType: 'lolo' | 'tiers' | null } {
  const filePath = path.join(dossierDir, 'state.md');
  if (!fs.existsSync(filePath)) return { title: '', status: 'EN COURS', objective: '', lastAction: '', confirm: false, journal: [], stateRaw: '', waitingType: null };

  const content = fs.readFileSync(filePath, 'utf-8');
  const title = content.match(/^# (.+)$/m)?.[1]?.trim() ?? '';
  const statusMatch = content.match(/STATUT\s*:\s*(.+)$/m)?.[1]?.trim();
  const status: DossierStatus = statusMatch ? normalizeStatus(statusMatch) : 'EN COURS';
  const objective = content.match(/## Objectif\n(.+)/)?.[1]?.trim() ?? '';
  const lastActionMatch = content.match(/- (\d{4}-\d{2}-\d{2})/g);
  const lastAction = lastActionMatch ? lastActionMatch[lastActionMatch.length - 1].replace('- ', '') : '';
  const confirm = /MODE\s*:\s*CONFIRM/m.test(content);

  // Parse journal entries
  const journalSection = content.match(/## Journal\n([\s\S]*?)(?=\n## |\n*$)/)?.[1] ?? '';
  const journal = journalSection
    .split('\n')
    .filter(line => line.match(/^- \d{4}-\d{2}-\d{2}/))
    .map(line => {
      const match = line.match(/^- (\d{4}-\d{2}-\d{2})\s*:\s*(.+)/);
      return match ? { date: match[1], text: match[2].trim() } : null;
    })
    .filter(Boolean) as JournalEntry[];

  // Parse ## En attente section
  const waitingForMatch = content.match(/## En attente\n([\s\S]*?)(?=\n## |\n*$)/);
  const waitingFor = waitingForMatch?.[1]?.trim() || undefined;

  // Determine waiting type from ## En attente section content
  let waitingType: 'lolo' | 'tiers' | null = null;
  if (waitingFor) {
    if (/ATTENTE\s*:\s*TIERS/i.test(waitingFor)) {
      waitingType = 'tiers';
    } else {
      // Default to 'lolo' when section exists (with or without explicit ATTENTE: LOLO tag)
      waitingType = 'lolo';
    }
  }

  if (content.length > 50 && !title) console.warn(`[state] ${dossierDir}: no title found in non-empty state.md`);
  if (content.length > 50 && !statusMatch) console.warn(`[state] ${dossierDir}: no STATUT found in non-empty state.md`);
  if (content.length > 50 && !objective) console.warn(`[state] ${dossierDir}: no objective found in non-empty state.md`);

  return { title, status, objective, lastAction, confirm, journal, stateRaw: content, waitingFor, waitingType };
}

export function setStatus(dossierDir: string, newStatus: DossierStatus): void {
  const filePath = path.join(dossierDir, 'state.md');
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf-8');
  const updated = content.match(/STATUT\s*:\s*.+$/m)
    ? content.replace(/STATUT\s*:\s*.+$/m, `STATUT: ${newStatus}`)
    : content + `\nSTATUT: ${newStatus}\n`;
  fs.writeFileSync(filePath, updated);
}

export function setWaitingType(dossierDir: string, type: 'lolo' | 'tiers'): void {
  const filePath = path.join(dossierDir, 'state.md');
  if (!fs.existsSync(filePath)) return;
  let content = fs.readFileSync(filePath, 'utf-8');
  const tag = `ATTENTE: ${type.toUpperCase()}`;

  const sectionMatch = content.match(/## En attente\n([\s\S]*?)(?=\n## |\n*$)/);
  if (sectionMatch) {
    const sectionBody = sectionMatch[1];
    // Replace existing ATTENTE tag or insert at beginning
    if (/ATTENTE\s*:\s*(LOLO|TIERS)/i.test(sectionBody)) {
      const updated = sectionBody.replace(/ATTENTE\s*:\s*(LOLO|TIERS)/i, tag);
      content = content.replace(sectionBody, updated);
    } else {
      // Insert tag as first line of section
      content = content.replace('## En attente\n', `## En attente\n${tag}\n`);
    }
  } else {
    // No ## En attente section — create one
    content = content.trimEnd() + `\n\n## En attente\n${tag}\n`;
  }
  fs.writeFileSync(filePath, content);
}

export function clearWaitingFor(dossierDir: string): void {
  const filePath = path.join(dossierDir, 'state.md');
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf-8');
  const cleaned = content.replace(/\n## En attente\n[\s\S]*?(?=\n## |\n*$)/, '');
  if (cleaned !== content) {
    fs.writeFileSync(filePath, cleaned);
  }
}

export function listDossierIds(workspaceDir: string): string[] {
  return fs.readdirSync(workspaceDir)
    .filter(f => !f.startsWith('_') && !f.startsWith('.'))
    .filter(f => fs.statSync(path.join(workspaceDir, f)).isDirectory())
    .filter(f => fs.existsSync(path.join(workspaceDir, f, 'state.md')));
}

export function resolveDossierDir(workspaceDir: string, id: string): string {
  return path.join(workspaceDir, id);
}

export function getDossier(workspaceDir: string, id: string): Dossier {
  const dossierDir = resolveDossierDir(workspaceDir, id);
  const state = parseStateMd(dossierDir);
  const artifactsDir = path.join(dossierDir, 'artifacts');
  const artifacts = fs.existsSync(artifactsDir) ? fs.readdirSync(artifactsDir) : [];

  return {
    id,
    ...state,
    waitingType: state.waitingType ?? undefined,
    hasActiveSession: false,
    artifacts,
  };
}
