// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import fs from 'fs';
import path from 'path';

const ALL_INSTRUCTION_FILES = ['CLAUDE.md', 'GEMINI.md', 'AGENTS.md'];

interface JobInfo {
  title: string;
  objective: string;
  confirm?: boolean;
}

interface GenerateOpts {
  workspaceDir: string;
  jobId: string;
  jobInfo: JobInfo;
  instructionFile: string;
  event?: { source: string; content: string };
}

export function generateJobInstructions(opts: GenerateOpts): void {
  const { workspaceDir, jobId, jobInfo, instructionFile, event } = opts;
  const jobDir = path.join(workspaceDir, jobId);

  let content = `# Job: ${jobInfo.title}\n\n## Objective\n${jobInfo.objective}\n`;
  if (event) {
    content += `\n## Trigger\nSource: ${event.source}\n${event.content}\n`;
  }
  if (jobInfo.confirm) {
    content += `\n## Confirm Mode\nThis job is in confirm mode. Before any external action (sending email, form submission, bank navigation, payment, file transfer), you MUST:\n1. Describe the action you will take in state.md\n2. Wait for user confirmation (they will respond via the terminal)\n\nInternal actions (reading files, searching, analysis) do not require confirmation.\n`;
  }
  content += `\n## Available MCP Tools (OpenTidy)\n\n- \`mcp__opentidy__schedule_create\` — Schedule a future action\n  - once: { type: "once", runAt: "ISO-datetime", label: "...", jobId: "${jobId}" }\n  - recurring: { type: "recurring", intervalMs: N, label: "...", jobId: "${jobId}" }\n- \`mcp__opentidy__schedule_list\` — List schedules (optional jobId filter)\n- \`mcp__opentidy__schedule_delete\` — Remove a schedule by id\n- \`mcp__opentidy__suggestion_create\` — Suggest a new job\n- \`mcp__opentidy__gap_report\` — Report a capability gap\n\nDo NOT write NEXT ACTION in state.md. Use schedule_create instead.\n`;
  content += `\n## End of work\nWhen you have finished working on this job, update STATUS: COMPLETED in state.md.\n`;

  // Clean up stale instruction files from other agents
  for (const file of ALL_INSTRUCTION_FILES) {
    if (file !== instructionFile) {
      const stalePath = path.join(jobDir, file);
      try {
        if (fs.existsSync(stalePath)) fs.unlinkSync(stalePath);
      } catch {}
    }
  }

  // Write INSTRUCTIONS.md (source of truth) and native copy
  fs.writeFileSync(path.join(jobDir, 'INSTRUCTIONS.md'), content);
  if (instructionFile !== 'INSTRUCTIONS.md') {
    fs.writeFileSync(path.join(jobDir, instructionFile), content);
  }
  console.log(`[launcher] generated ${instructionFile} for ${jobId}`);
}
