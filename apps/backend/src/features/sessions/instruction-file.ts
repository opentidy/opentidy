// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import fs from 'fs';
import path from 'path';

const ALL_INSTRUCTION_FILES = ['CLAUDE.md', 'GEMINI.md', 'AGENTS.md'];

interface DossierInfo {
  title: string;
  objective: string;
  confirm?: boolean;
}

interface GenerateOpts {
  workspaceDir: string;
  dossierId: string;
  dossierInfo: DossierInfo;
  instructionFile: string;
  event?: { source: string; content: string };
}

export function generateDossierInstructions(opts: GenerateOpts): void {
  const { workspaceDir, dossierId, dossierInfo, instructionFile, event } = opts;
  const dossierDir = path.join(workspaceDir, dossierId);

  let content = `# Dossier: ${dossierInfo.title}\n\n## Objective\n${dossierInfo.objective}\n`;
  if (event) {
    content += `\n## Trigger\nSource: ${event.source}\n${event.content}\n`;
  }
  if (dossierInfo.confirm) {
    content += `\n## Confirm Mode\nThis dossier is in confirm mode. Before any external action (sending email, form submission, bank navigation, payment, file transfer), you MUST:\n1. Describe the action you will take in state.md\n2. Wait for user confirmation (they will respond via the terminal)\n\nInternal actions (reading files, searching, analysis) do not require confirmation.\n`;
  }
  content += `\n## Available MCP Tools (OpenTidy)\n\n- \`mcp__opentidy__schedule_create\` — Schedule a future action\n  - once: { type: "once", runAt: "ISO-datetime", label: "...", dossierId: "${dossierId}" }\n  - recurring: { type: "recurring", intervalMs: N, label: "...", dossierId: "${dossierId}" }\n- \`mcp__opentidy__schedule_list\` — List schedules (optional dossierId filter)\n- \`mcp__opentidy__schedule_delete\` — Remove a schedule by id\n- \`mcp__opentidy__suggestion_create\` — Suggest a new dossier\n- \`mcp__opentidy__gap_report\` — Report a capability gap\n\nDo NOT write NEXT ACTION in state.md. Use schedule_create instead.\n`;
  content += `\n## End of work\nWhen you have finished working on this dossier, update STATUS: COMPLETED in state.md.\n`;

  // Clean up stale instruction files from other agents
  for (const file of ALL_INSTRUCTION_FILES) {
    if (file !== instructionFile) {
      const stalePath = path.join(dossierDir, file);
      try {
        if (fs.existsSync(stalePath)) fs.unlinkSync(stalePath);
      } catch {}
    }
  }

  // Write INSTRUCTIONS.md (source of truth) and native copy
  fs.writeFileSync(path.join(dossierDir, 'INSTRUCTIONS.md'), content);
  if (instructionFile !== 'INSTRUCTIONS.md') {
    fs.writeFileSync(path.join(dossierDir, instructionFile), content);
  }
  console.log(`[launcher] generated ${instructionFile} for ${dossierId}`);
}
