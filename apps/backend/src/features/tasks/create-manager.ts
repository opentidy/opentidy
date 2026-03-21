// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import fs from 'fs';
import path from 'path';

export function createTaskManager(workspaceDir: string) {
  function createTask(id: string, instruction: string, title?: string): void {
    const dir = path.join(workspaceDir, id);
    if (fs.existsSync(dir)) throw new Error(`Task '${id}' already exists`);
    fs.mkdirSync(dir, { recursive: true });
    fs.mkdirSync(path.join(dir, 'artifacts'), { recursive: true });
    const now = new Date().toISOString().slice(0, 10);
    const displayTitle = title || id;
    const stateMd = `# ${displayTitle}\n\nSTATUS : IN_PROGRESS\n\n## Objective\n${instruction}\n\n## Log\n- ${now} : Created\n`;
    fs.writeFileSync(path.join(dir, 'state.md'), stateMd);
    console.log(`[workspace] task created: ${id} — "${displayTitle}"`);
  }

  function createTaskFromSuggestion(slug: string, instruction?: string): void {
    const suggFile = path.join(workspaceDir, '_suggestions', `${slug}.md`);
    const content = fs.existsSync(suggFile) ? fs.readFileSync(suggFile, 'utf-8') : '';
    const title = content.match(/^# (.+)$/m)?.[1] ?? slug;
    createTask(slug, instruction ?? title, title);
    if (fs.existsSync(suggFile)) fs.unlinkSync(suggFile);
  }

  function saveArtifact(id: string, filename: string, data: Buffer): void {
    const dir = path.join(workspaceDir, id, 'artifacts');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, filename), data);
    console.log(`[workspace] artifact saved: ${id}/${filename}`);
  }

  function completeTask(id: string): void {
    const dir = path.join(workspaceDir, id);
    if (!fs.existsSync(dir)) throw new Error(`Task '${id}' not found`);
    const stateFile = path.join(dir, 'state.md');
    if (fs.existsSync(stateFile)) {
      let content = fs.readFileSync(stateFile, 'utf-8');
      content = content.replace(/(?:STATUT|STATUS)\s*:\s*.+/m, 'STATUS : COMPLETED');
      fs.writeFileSync(stateFile, content);
    }
    console.log(`[workspace] task completed: ${id}`);
  }

  return { createTask, createTaskFromSuggestion, saveArtifact, completeTask };
}