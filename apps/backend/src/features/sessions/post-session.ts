// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import type { Session } from '@opentidy/shared';
import type { SessionExecutor } from './launch.js';

import fs from 'fs';
import path from 'path';
import os from 'os';

interface PostSessionDeps {
  tmuxExecutor: SessionExecutor;
  locks: { release(dossierId: string): void };
  sse: { emit(event: { type: string; data: Record<string, unknown>; timestamp: string }): void };
  terminal: { killTtyd(sessionName: string): void };
  memoryAgents?: {
    isTranscriptSubstantial(transcriptPath: string): boolean;
    runExtraction(input: { transcriptPath: string; indexContent: string; dossierId: string; stateContent: string }): Promise<void>;
  };
  workspaceDir?: string;
}

/**
 * Creates post-session cleanup functions (end, archive).
 * Separated from session launch to keep concerns isolated.
 */
export function createPostSessionHandlers(
  deps: PostSessionDeps,
  sessions: Map<string, Session>,
) {
  function triggerMemoryExtraction(dossierId: string): void {
    if (!deps.memoryAgents || !deps.workspaceDir) return;

    const dossierDir = path.join(deps.workspaceDir, dossierId);
    const memoryDir = path.join(deps.workspaceDir, '_memory');
    const indexPath = path.join(memoryDir, 'INDEX.md');

    // Find most recent transcript for this dossier in Claude's project data
    const claudeDir = path.join(os.homedir(), '.claude', 'projects');
    let transcriptPath = '';
    try {
      if (fs.existsSync(claudeDir)) {
        // Scan all project dirs for transcripts, pick the most recent .jsonl
        const projectDirs = fs.readdirSync(claudeDir).filter(d => fs.statSync(path.join(claudeDir, d)).isDirectory());
        let newest = 0;
        for (const dir of projectDirs) {
          const projPath = path.join(claudeDir, dir);
          const files = fs.readdirSync(projPath).filter(f => f.endsWith('.jsonl'));
          for (const f of files) {
            const fp = path.join(projPath, f);
            const stat = fs.statSync(fp);
            if (stat.mtimeMs > newest) { newest = stat.mtimeMs; transcriptPath = fp; }
          }
        }
      }
    } catch { /* ignore errors scanning transcripts */ }

    if (!transcriptPath) {
      console.log(`[memory] no transcript found for ${dossierId}, skipping extraction`);
      return;
    }

    if (!deps.memoryAgents.isTranscriptSubstantial(transcriptPath)) {
      console.log(`[memory] transcript too short for ${dossierId}, skipping extraction`);
      return;
    }

    const stateContent = fs.existsSync(path.join(dossierDir, 'state.md'))
      ? fs.readFileSync(path.join(dossierDir, 'state.md'), 'utf-8')
      : '';
    const indexContent = fs.existsSync(indexPath)
      ? fs.readFileSync(indexPath, 'utf-8')
      : '';

    console.log(`[memory] triggering extraction for ${dossierId}`);
    deps.memoryAgents.runExtraction({ transcriptPath, indexContent, dossierId, stateContent }).catch(err => {
      console.error(`[memory] extraction failed for ${dossierId}:`, (err as Error).message);
    });
  }

  function handleSessionEnd(dossierId: string): void {
    deps.locks.release(dossierId);
    deps.terminal.killTtyd(`opentidy-${dossierId}`);
    sessions.delete(dossierId);
    deps.sse.emit({ type: 'session:ended', data: { dossierId }, timestamp: new Date().toISOString() });
    console.log(`[launcher] session ended: ${dossierId}`);
    triggerMemoryExtraction(dossierId);
  }

  async function archiveSession(dossierId: string): Promise<void> {
    const sessionName = `opentidy-${dossierId}`;
    deps.terminal.killTtyd(sessionName);
    await deps.tmuxExecutor.killSession(sessionName);
    deps.locks.release(dossierId);
    sessions.delete(dossierId);
    deps.sse.emit({ type: 'session:ended', data: { dossierId }, timestamp: new Date().toISOString() });
    console.log(`[launcher] session archived: ${dossierId}`);
    triggerMemoryExtraction(dossierId);
  }

  return { handleSessionEnd, archiveSession };
}
