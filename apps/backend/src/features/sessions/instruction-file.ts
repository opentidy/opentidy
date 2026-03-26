// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import fs from 'fs';
import path from 'path';
import type { ModuleManifest, ModuleState } from '@opentidy/shared';

const ALL_INSTRUCTION_FILES = ['CLAUDE.md', 'GEMINI.md', 'AGENTS.md'];

interface TaskInfo {
  title: string;
  objective: string;
}

interface GenerateOpts {
  workspaceDir: string;
  taskId: string;
  taskInfo: TaskInfo;
  instructionFile: string;
  event?: { source: string; content: string };
  /** Enabled module manifests, used to generate the capabilities index */
  modules?: { manifests: Map<string, ModuleManifest>; states: Record<string, ModuleState> };
}

/**
 * Build a capabilities index from enabled modules.
 * Each line maps a module to its access method (MCP tools, skills, or both).
 * Fully module-agnostic: derived from manifests, no hardcoding.
 */
function buildCapabilitiesSection(
  manifests: Map<string, ModuleManifest>,
  states: Record<string, ModuleState>,
  taskId: string,
): string {
  const lines: string[] = [];

  for (const [name, manifest] of manifests) {
    if (!states[name]?.enabled) continue;

    const accessMethods: string[] = [];

    // MCP tools
    for (const mcp of manifest.mcpServers ?? []) {
      accessMethods.push(`MCP tools \`mcp__${mcp.name}__*\``);
    }

    // Skills
    for (const skill of manifest.skills ?? []) {
      accessMethods.push(`skill \`/${skill.name}\``);
    }

    if (accessMethods.length === 0) continue;

    lines.push(`- **${manifest.label}**: ${manifest.description} → ${accessMethods.join(', ')}`);
  }

  if (lines.length === 0) return '';

  let section = `\n## Available Capabilities\n\n`;
  section += lines.join('\n');
  section += '\n';

  // Add scheduling tools explicitly (part of opentidy MCP but worth highlighting)
  section += `\n### Scheduling\n`;
  section += `- \`mcp__opentidy__schedule_create\`: Schedule a future action\n`;
  section += `  - once: { type: "once", runAt: "ISO-datetime", label: "...", taskId: "${taskId}" }\n`;
  section += `  - recurring: { type: "recurring", intervalMs: N, label: "...", taskId: "${taskId}" }\n`;
  section += `- \`mcp__opentidy__schedule_list\`: List schedules\n`;
  section += `- \`mcp__opentidy__schedule_delete\`: Remove a schedule by id\n`;
  section += `\nDo NOT write NEXT ACTION in state.md. Use schedule_create instead.\n`;

  return section;
}

export function generateTaskInstructions(opts: GenerateOpts): void {
  const { workspaceDir, taskId, taskInfo, instructionFile, event, modules } = opts;
  const taskDir = path.join(workspaceDir, taskId);

  let content = `# Task: ${taskInfo.title}\n\n## Objective\n${taskInfo.objective}\n`;
  if (event) {
    content += `\n## Trigger\nSource: ${event.source}\n${event.content}\n`;
  }

  // Generate capabilities from modules (agent-agnostic, module-agnostic)
  if (modules) {
    content += buildCapabilitiesSection(modules.manifests, modules.states, taskId);
  } else {
    // Fallback: hardcoded OpenTidy tools (for backwards compat / tests without modules)
    content += `\n## Available MCP Tools (OpenTidy)\n\n- \`mcp__opentidy__schedule_create\`: Schedule a future action\n  - once: { type: "once", runAt: "ISO-datetime", label: "...", taskId: "${taskId}" }\n  - recurring: { type: "recurring", intervalMs: N, label: "...", taskId: "${taskId}" }\n- \`mcp__opentidy__schedule_list\`: List schedules (optional taskId filter)\n- \`mcp__opentidy__schedule_delete\`: Remove a schedule by id\n- \`mcp__opentidy__suggestion_create\`: Suggest a new task\n- \`mcp__opentidy__gap_report\`: Report a capability gap\n\nDo NOT write NEXT ACTION in state.md. Use schedule_create instead.\n`;
  }

  content += `\n## End of work\nWhen you have finished working on this task, update STATUS: COMPLETED in state.md.\n`;

  // Clean up stale instruction files from other agents
  for (const file of ALL_INSTRUCTION_FILES) {
    if (file !== instructionFile) {
      const stalePath = path.join(taskDir, file);
      try {
        if (fs.existsSync(stalePath)) fs.unlinkSync(stalePath);
      } catch {}
    }
  }

  // Write INSTRUCTIONS.md (source of truth) and native copy
  fs.writeFileSync(path.join(taskDir, 'INSTRUCTIONS.md'), content);
  if (instructionFile !== 'INSTRUCTIONS.md') {
    fs.writeFileSync(path.join(taskDir, instructionFile), content);
  }
  console.log(`[launcher] generated ${instructionFile} for ${taskId}`);
}
