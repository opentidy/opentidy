// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync, symlinkSync, readdirSync } from 'fs';
import { join, resolve } from 'path';
import type { OpenTidyConfig, SkillsConfig, ModuleManifest, ModuleState, SkillDef, PermissionPreset } from '@opentidy/shared';

// Read-only tools — always safe regardless of preset.
const READ_ONLY_PERMISSIONS = ['Read', 'Glob', 'Grep'];

// Built-in Claude Code permissions per preset.
// OpenTidy's PreToolUse hook provides fine-grained control for module tools,
// so we don't want Claude Code's native prompts blocking the agent unnecessarily.
//
// supervised  — read-only tools + safe bash only. Agent asks for everything else.
// assisted    — adds Write/Edit + broader bash. Good balance.
// autonomous  — all tools auto-allowed. Agent runs uninterrupted.
const PRESET_PERMISSIONS: Record<PermissionPreset, string[]> = {
  supervised: [
    ...READ_ONLY_PERMISSIONS,
    'Bash(git:*)', 'Bash(curl:*)', 'Bash(cat:*)', 'Bash(ls:*)',
  ],
  assisted: [
    ...READ_ONLY_PERMISSIONS,
    'Write', 'Edit',
    'Bash(npm:*)', 'Bash(pnpm:*)', 'Bash(git:*)',
    'Bash(curl:*)', 'Bash(python3:*)',
    'Bash(cat:*)', 'Bash(ls:*)', 'Bash(mkdir:*)', 'Bash(cp:*)',
    'WebFetch(*)',
  ],
  autonomous: [
    ...READ_ONLY_PERMISSIONS,
    'Write', 'Edit',
    'Bash(*)',
    'WebFetch(*)', 'WebSearch(*)',
    'Agent', 'NotebookEdit',
  ],
};

// Mapping from user-facing builtin capability keys to Claude Code permission strings.
const BUILTIN_CAPABILITY_PERMISSIONS: Record<string, string[]> = {
  readFiles: ['Read', 'Glob', 'Grep'],
  writeFiles: ['Write', 'Edit'],
  runCommands: ['Bash(*)'],
  webAccess: ['WebFetch(*)', 'WebSearch(*)'],
  subAgents: ['Agent', 'NotebookEdit'],
};

/**
 * Apply per-builtin overrides on top of preset permissions.
 * 'allow' → add permissions, 'ask' → remove (Claude Code prompts natively), 'block' → remove + deny.
 */
function applyBuiltinOverrides(
  allow: string[],
  deny: string[],
  builtins: Record<string, import('@opentidy/shared').PermissionLevel> | undefined,
): void {
  if (!builtins) return;

  for (const [key, level] of Object.entries(builtins)) {
    const perms = BUILTIN_CAPABILITY_PERMISSIONS[key];
    if (!perms) continue;

    if (level === 'allow') {
      // Ensure all permissions are in allow, remove from deny
      for (const p of perms) {
        if (!allow.includes(p)) allow.push(p);
        const di = deny.indexOf(p);
        if (di !== -1) deny.splice(di, 1);
      }
    } else {
      // 'ask' or 'block': remove from allow
      for (const p of perms) {
        // Remove exact match and any matching patterns already in allow
        const idx = allow.indexOf(p);
        if (idx !== -1) allow.splice(idx, 1);
        // Also remove specific patterns that are subsumed (e.g. Bash(git:*) when removing Bash(*))
        if (p === 'Bash(*)') {
          for (let i = allow.length - 1; i >= 0; i--) {
            if (allow[i].startsWith('Bash(')) allow.splice(i, 1);
          }
        }
      }
      if (level === 'block') {
        for (const p of perms) {
          if (!deny.includes(p)) deny.push(p);
        }
      }
    }
  }
}

type McpServerEntry = {
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
  mcpServers: Record<string, McpServerEntry>;
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

/**
 * @deprecated Use generateSettingsFromModules() + regenerateAgentConfig() with modules/manifests params.
 * Legacy function for pre-v3 configs that still have config.mcp.
 */
export function generateClaudeSettings(config: OpenTidyConfig, envDir?: string): ClaudeSettings {
  const preset = config.permissions?.preset ?? 'supervised';
  const allow = [...(PRESET_PERMISSIONS[preset] ?? PRESET_PERMISSIONS.supervised)];
  const mcpServers: Record<string, McpServerEntry> = {};
  // Cast to any — this function only runs for legacy configs that still have mcp field
  const mcp = (config as any).mcp;

  if (!mcp) {
    // v3 config — no legacy mcp field, return minimal settings
    allow.push('mcp__opentidy__*');
    mcpServers.opentidy = { type: 'http', url: `http://localhost:${config.server?.port || 5175}/mcp` };
    return { permissions: { allow, deny: [] }, mcpServers, _regeneratedAt: new Date().toISOString() };
  }

  // Legacy: Gmail (pre-v3 configs — replaced by email module in v3)
  if (mcp.curated?.gmail?.enabled) {
    allow.push('mcp__gmail__*');
    mcpServers.gmail = { type: 'stdio', command: 'npx', args: ['@gongrzhe/server-gmail-autoauth-mcp'] };
  }

  // Curated: Camoufox
  if (mcp.curated?.camoufox?.enabled) {
    allow.push('mcp__camofox__*');
    const configDir = config.agentConfig?.configDir || config.claudeConfig?.dir || '';
    const wrapperPath = join(configDir, 'scripts', 'camofox-mcp.sh');
    mcpServers.camofox = { type: 'stdio', command: 'bash', args: [wrapperPath] };
  }

  // Curated: WhatsApp
  if (mcp.curated?.whatsapp?.enabled) {
    if (mcp.curated.whatsapp.mcpServerPath) {
      allow.push('mcp__whatsapp__*');
      mcpServers.whatsapp = { type: 'stdio', command: 'uv', args: ['run', 'server.py'], cwd: mcp.curated.whatsapp.mcpServerPath };
    } else {
      allow.push('Bash(wacli:*)');
    }
  }

  // OpenTidy MCP — always injected
  allow.push('mcp__opentidy__*');
  mcpServers.opentidy = { type: 'http', url: `http://localhost:${config.server?.port || 5175}/mcp` };

  return { permissions: { allow, deny: [] }, mcpServers, _regeneratedAt: new Date().toISOString() };
}

interface ModuleSettingsResult {
  mcpServers: Record<string, McpServerEntry>;
  skills: SkillDef[];
}

export function generateSettingsFromModules(
  modules: Record<string, ModuleState>,
  manifests: Map<string, ModuleManifest>,
  modulesBaseDir?: string,
): ModuleSettingsResult {
  const mcpServers: Record<string, McpServerEntry> = {};
  const skills: SkillDef[] = [];
  // Track deduplication: key = command + JSON.stringify(args)
  const seenMcpKeys = new Set<string>();

  for (const [moduleName, moduleState] of Object.entries(modules)) {
    if (!moduleState.enabled) continue;

    const manifest = manifests.get(moduleName);
    if (!manifest) continue;

    // Collect MCP servers
    for (const mcpDef of manifest.mcpServers ?? []) {
      // Resolve ./relative args to absolute paths from module directory
      const resolvedArgs = (mcpDef.args ?? []).map(arg =>
        arg.startsWith('./') && modulesBaseDir
          ? join(modulesBaseDir, moduleName, arg)
          : arg
      );

      const dedupKey = `${mcpDef.command}::${JSON.stringify(resolvedArgs)}`;
      if (seenMcpKeys.has(dedupKey)) {
        console.log(`[agent-config] Deduplicating MCP "${mcpDef.name}" from module "${moduleName}" (same command+args already registered)`);
        continue;
      }
      seenMcpKeys.add(dedupKey);

      // Resolve env vars from envFromConfig
      const resolvedEnv: Record<string, string> = { ...(mcpDef.env ?? {}) };
      if (mcpDef.envFromConfig) {
        for (const [envVar, configKey] of Object.entries(mcpDef.envFromConfig)) {
          const configValue = moduleState.config?.[configKey];
          if (typeof configValue === 'string') {
            resolvedEnv[envVar] = configValue;
          } else if (configValue !== undefined) {
            resolvedEnv[envVar] = String(configValue);
          }
        }
      }

      // HTTP MCP (url) vs process MCP (command+args)
      let entry: McpServerEntry;
      if (mcpDef.url || mcpDef.urlFromConfig) {
        const resolvedUrl = mcpDef.urlFromConfig
          ? String(moduleState.config?.[mcpDef.urlFromConfig] ?? mcpDef.url ?? '')
          : mcpDef.url!;
        entry = { type: 'http', url: resolvedUrl } as McpServerEntry;
      } else {
        entry = {
          type: 'stdio',
          command: mcpDef.command!,
          args: resolvedArgs,
          ...(Object.keys(resolvedEnv).length > 0 ? { env: resolvedEnv } : {}),
        };
      }
      mcpServers[mcpDef.name] = entry;
    }

    // Collect skills
    for (const skill of manifest.skills ?? []) {
      skills.push(skill);
    }
  }

  return { mcpServers, skills };
}

/**
 * Write module skills to the agent's skills directory.
 * Each skill gets its own directory with a SKILL.md file.
 * A `.module-generated` marker distinguishes them from user skills for cleanup.
 */
export function syncModuleSkills(skills: SkillDef[], configDir: string): void {
  const skillsDir = join(configDir, 'skills');
  mkdirSync(skillsDir, { recursive: true });

  // Clean up previously generated module skills
  try {
    for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
      if (entry.isDirectory() && existsSync(join(skillsDir, entry.name, '.module-generated'))) {
        rmSync(join(skillsDir, entry.name), { recursive: true, force: true });
      }
    }
  } catch {
    // skills dir doesn't exist yet — nothing to clean
  }

  // Write fresh module skills
  for (const skill of skills) {
    const skillDir = join(skillsDir, skill.name);
    mkdirSync(skillDir, { recursive: true });
    const content = `---\nname: ${skill.name}\ndescription: ${skill.name} module skill\n---\n\n${skill.content}\n`;
    writeFileSync(join(skillDir, 'SKILL.md'), content);
    writeFileSync(join(skillDir, '.module-generated'), '');
  }
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

export function regenerateAgentConfig(
  config: OpenTidyConfig,
  envDir?: string,
  modules?: Record<string, ModuleState>,
  manifests?: Map<string, ModuleManifest>,
  modulesBaseDir?: string,
): void {
  const configDir = config.agentConfig?.configDir || config.claudeConfig?.dir || '';
  if (!configDir) {
    console.warn('[agent-config] No agent config dir set, skipping regeneration');
    return;
  }

  mkdirSync(configDir, { recursive: true });

  let settings: ClaudeSettings;

  if (modules && manifests) {
    // New path: generate from modules (opentidy MCP is now a regular module)
    const moduleResult = generateSettingsFromModules(modules, manifests, modulesBaseDir);

    // Collect permissions from module manifests.
    // If an MCP server has explicit permissions, use those.
    // Otherwise, auto-generate mcp__<name>__* so Claude Code doesn't prompt its
    // own native confirmation — OpenTidy's PreToolUse hook handles fine-grained control.
    const modulePermissions: string[] = [];
    for (const [, manifest] of manifests) {
      for (const mcp of manifest.mcpServers ?? []) {
        if (mcp.permissions?.length) {
          modulePermissions.push(...mcp.permissions);
        } else {
          modulePermissions.push(`mcp__${mcp.name}__*`);
        }
      }

      // Daemon modules register tools on the opentidy MCP server
      if (manifest.daemon?.entry && manifest.toolPermissions) {
        const allTools = [
          ...(manifest.toolPermissions.safe ?? []),
          ...(manifest.toolPermissions.critical ?? []),
        ];
        for (const tool of allTools) {
          modulePermissions.push(`mcp__opentidy__${tool.tool}`);
        }
      }
    }

    const preset = config.permissions?.preset ?? 'supervised';
    const basePerms = PRESET_PERMISSIONS[preset] ?? PRESET_PERMISSIONS.supervised;
    const allow = [...basePerms, ...modulePermissions];
    const deny: string[] = [];
    applyBuiltinOverrides(allow, deny, config.permissions?.builtins);

    settings = {
      permissions: { allow, deny },
      mcpServers: moduleResult.mcpServers,
      _regeneratedAt: new Date().toISOString(),
    };
    // Write module skills to agent's skills directory
    syncModuleSkills(moduleResult.skills, configDir);

    console.log(`[agent-config] Regenerated settings.json from modules (${Object.keys(moduleResult.mcpServers).length} MCP servers, ${moduleResult.skills.length} skills)`);
  } else {
    // Legacy path: generate from config.mcp / config.skills
    settings = generateClaudeSettings(config, envDir);
    console.log(`[agent-config] Regenerated settings.json (${Object.keys(settings.mcpServers).length} MCP servers)`);
  }

  // Write to both settings.json and settings.local.json.
  // Claude Code may overwrite settings.json on first launch, but settings.local.json persists.
  // theme + skipDangerousModePermissionPrompt skip Claude Code's onboarding flow.
  const fullSettings = {
    ...settings,
    theme: 'dark',
    skipDangerousModePermissionPrompt: true,
  };
  writeFileSync(join(configDir, 'settings.json'), JSON.stringify(fullSettings, null, 2) + '\n');
  writeFileSync(join(configDir, 'settings.local.json'), JSON.stringify(fullSettings, null, 2) + '\n');

  // Write standalone MCP config for --strict-mcp-config --mcp-config usage.
  // This ensures agent sessions ONLY see module-configured MCP servers,
  // not cloud account integrations (claude.ai Atlassian, Gmail, etc.).
  writeFileSync(
    join(configDir, 'mcp-config.json'),
    JSON.stringify({ mcpServers: settings.mcpServers }, null, 2) + '\n',
  );

  // Sync skills (legacy path only — module skills handled by syncModuleSkills above)
  if (!modules) {
    const curatedSkillsDir = resolve(import.meta.dirname, '../../config/claude/skills');
    const legacySkills = (config as any).skills;
    if (legacySkills) {
      syncSkills(legacySkills, configDir, curatedSkillsDir);
      console.log('[agent-config] Skills synced');
    }
  }
}
