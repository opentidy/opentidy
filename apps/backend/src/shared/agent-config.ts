// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync, symlinkSync } from 'fs';
import { join, resolve } from 'path';
import type { OpenTidyConfig, SkillsConfig, GuardrailRule } from '@opentidy/shared';

const BASE_PERMISSIONS = [
  'Read', 'Write', 'Edit', 'Glob', 'Grep',
  'Bash(npm:*)', 'Bash(pnpm:*)', 'Bash(git:*)',
  'Bash(osascript:*)', 'Bash(open:*)',
  'Bash(curl:*)', 'Bash(python3:*)',
];

type McpServerDef = {
  type: 'stdio';
  command: string;
  args: string[];
  cwd?: string;
  env?: Record<string, string>;
} | {
  type: 'http';
  url: string;
};

interface ClaudeSettings {
  permissions: { allow: string[]; deny: string[] };
  mcpServers: Record<string, McpServerDef>;
  _regeneratedAt: string;
}

export function readEnvFile(filePath: string): Record<string, string> {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const env: Record<string, string> = {};
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex > 0) {
        env[trimmed.slice(0, eqIndex)] = trimmed.slice(eqIndex + 1);
      }
    }
    return env;
  } catch {
    return {};
  }
}

export function generateClaudeSettings(config: OpenTidyConfig, envDir?: string): ClaudeSettings {
  const allow = [...BASE_PERMISSIONS];
  const mcpServers: Record<string, McpServerDef> = {};
  const mcp = config.mcp;

  // Curated: Gmail
  if (mcp.curated.gmail.enabled) {
    allow.push('mcp__gmail__*');
    mcpServers.gmail = {
      type: 'stdio',
      command: 'npx',
      args: ['@gongrzhe/server-gmail-autoauth-mcp'],
    };
  }

  // Curated: Camoufox
  if (mcp.curated.camoufox.enabled) {
    allow.push('mcp__camofox__*');
    const configDir = config.agentConfig?.configDir || config.claudeConfig?.dir || '';
    const wrapperPath = join(configDir, 'scripts', 'camofox-mcp.sh');
    mcpServers.camofox = {
      type: 'stdio',
      command: 'bash',
      args: [wrapperPath],
    };
  }

  // Curated: WhatsApp
  if (mcp.curated.whatsapp.enabled) {
    if (mcp.curated.whatsapp.mcpServerPath) {
      allow.push('mcp__whatsapp__*');
      mcpServers.whatsapp = {
        type: 'stdio',
        command: 'uv',
        args: ['run', 'server.py'],
        cwd: mcp.curated.whatsapp.mcpServerPath,
      };
    } else {
      allow.push('Bash(wacli:*)');
    }
  }

  // OpenTidy MCP — always injected (system infrastructure, not optional)
  allow.push('mcp__opentidy__*');
  mcpServers.opentidy = {
    type: 'http',
    url: `http://localhost:${config.server?.port || 5175}/mcp`,
  };

  // Marketplace MCPs
  const mcpEnvDir = envDir || join(config.agentConfig?.configDir || '', '..', 'mcp');
  for (const [name, mcpDef] of Object.entries(mcp.marketplace)) {
    const serverDef: McpServerDef = {
      type: 'stdio',
      command: mcpDef.command,
      args: mcpDef.args,
    };
    if (mcpDef.envFile) {
      const env = readEnvFile(join(mcpEnvDir, mcpDef.envFile));
      if (Object.keys(env).length > 0) {
        serverDef.env = env;
      }
    }
    mcpServers[name] = serverDef;
    for (const perm of mcpDef.permissions) {
      allow.push(perm);
    }
  }

  return {
    permissions: { allow, deny: [] },
    mcpServers,
    _regeneratedAt: new Date().toISOString(),
  };
}

export function buildMarketplaceGuardrails(config: OpenTidyConfig): GuardrailRule[] {
  const port = config.server?.port || 5175;
  const rules: GuardrailRule[] = [];
  for (const name of Object.keys(config.mcp.marketplace)) {
    rules.push({
      event: 'post-tool',
      type: 'http',
      match: `mcp__${name}__`,
      url: `http://localhost:${port}/api/hooks`,
    });
  }
  return rules;
}

export function syncSkills(
  skills: SkillsConfig,
  configDir: string,
  curatedSkillsDir: string,
): void {
  const targetDir = join(configDir, 'skills');
  mkdirSync(targetDir, { recursive: true });

  // Curated skills
  for (const [name, state] of Object.entries(skills.curated)) {
    const targetPath = join(targetDir, name);
    if (state.enabled) {
      const sourcePath = join(curatedSkillsDir, name);
      if (existsSync(sourcePath)) {
        rmSync(targetPath, { recursive: true, force: true });
        cpSync(sourcePath, targetPath, { recursive: true });
      }
    } else {
      rmSync(targetPath, { recursive: true, force: true });
    }
  }

  // User skills
  for (const skill of skills.user) {
    const targetPath = join(targetDir, skill.name);
    if (skill.enabled) {
      const sourcePath = skill.source.startsWith('~/')
        ? join(process.env.HOME || '', skill.source.slice(2))
        : skill.source;
      if (existsSync(sourcePath)) {
        rmSync(targetPath, { recursive: true, force: true });
        try {
          symlinkSync(sourcePath, targetPath);
        } catch {
          console.warn(`[agent-config] Failed to symlink skill "${skill.name}" from ${sourcePath}`);
        }
      } else {
        console.warn(`[agent-config] Skill "${skill.name}" disabled: source path not found at ${sourcePath}`);
        skill.enabled = false;
      }
    } else {
      rmSync(targetPath, { recursive: true, force: true });
    }
  }
}

export function regenerateAgentConfig(config: OpenTidyConfig, envDir?: string): void {
  const configDir = config.agentConfig?.configDir || config.claudeConfig?.dir || '';
  if (!configDir) {
    console.warn('[agent-config] No agent config dir set, skipping regeneration');
    return;
  }

  mkdirSync(configDir, { recursive: true });

  // Generate settings.json
  const settings = generateClaudeSettings(config, envDir);
  writeFileSync(join(configDir, 'settings.json'), JSON.stringify(settings, null, 2) + '\n');
  console.log(`[agent-config] Regenerated settings.json (${Object.keys(settings.mcpServers).length} MCP servers)`);

  // Sync skills
  const curatedSkillsDir = resolve(import.meta.dirname, '../../config/claude/skills');
  if (config.skills) {
    syncSkills(config.skills, configDir, curatedSkillsDir);
    console.log('[agent-config] Skills synced');
  }
}
