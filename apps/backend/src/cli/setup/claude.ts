// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { execFileSync } from 'child_process';
import type { OpenTidyConfig } from '@opentidy/shared';
import { loadConfig, saveConfig, getConfigPath } from '../../shared/config.js';
import { generateClaudeSettings } from '../../shared/agent-config.js';
import { ask, info, success, warn } from './utils.js';

export { generateClaudeSettings };

export function generateClaudeMd(templatePath: string, config: OpenTidyConfig): string {
  let content = readFileSync(templatePath, 'utf-8');

  content = content.replace(
    '- Email: (configured during setup)',
    `- Email: ${config.userInfo.email || '(not configured)'}`,
  );
  content = content.replace(
    '- Full name: (configured during setup)',
    `- Full name: ${config.userInfo.name || '(not configured)'}`,
  );
  content = content.replace(
    '- Company: (configured during setup)',
    `- Company: ${config.userInfo.company || '(not configured)'}`,
  );

  if (config.language) {
    const langName = config.language === 'fr' ? 'French' : config.language;
    content = content.replace(
      "Communicate in the user's preferred language",
      `Communicate in ${langName}`,
    );
  }

  return content;
}

export async function setupClaude(): Promise<void> {
  const configPath = getConfigPath();
  const config = loadConfig(configPath);

  console.log('');
  console.log('  ┌─────────────────────────────────────┐');
  console.log('  │  Claude Code                         │');
  console.log('  └─────────────────────────────────────┘');
  console.log('');
  info('OpenTidy runs Claude Code sessions autonomously.');
  info('It uses an isolated config (separate from yours).');
  console.log('');

  const templateDir = resolve(import.meta.dirname, '../../../config/claude');
  const claudeConfigDir = resolve(dirname(configPath), 'agents', 'claude');

  // Generate settings.json from config
  const settings = generateClaudeSettings(config);
  mkdirSync(claudeConfigDir, { recursive: true });
  writeFileSync(join(claudeConfigDir, 'settings.json'), JSON.stringify(settings, null, 2) + '\n');
  success('Generated settings.json with MCP servers.');

  // Generate personalized CLAUDE.md from template
  const templateMd = join(templateDir, 'CLAUDE.md');
  if (existsSync(templateMd)) {
    const personalizedMd = generateClaudeMd(templateMd, config);
    writeFileSync(join(claudeConfigDir, 'CLAUDE.md'), personalizedMd);
    success('Generated personalized CLAUDE.md.');
  }

  // settings.local.json — user overrides, never overwritten
  const localSettings = join(claudeConfigDir, 'settings.local.json');
  if (!existsSync(localSettings)) {
    writeFileSync(localSettings, '{}\n');
  }

  if (config.claudeConfig) config.claudeConfig.dir = claudeConfigDir; else config.claudeConfig = { dir: claudeConfigDir };
  saveConfig(configPath, config);

  // MCP summary
  const mcpNames = Object.keys(settings.mcpServers);
  if (mcpNames.length > 0) {
    info(`MCP servers: ${mcpNames.join(', ')}`);
  } else {
    warn('No MCP servers configured. Run setup for Gmail/Camoufox/WhatsApp first.');
  }

  // Auth
  console.log('');
  info('Claude Code needs to be authenticated (OAuth).');
  info('This opens a browser — log in with your Claude account.');
  console.log('');
  await ask('  Press Enter to open the browser...');

  try {
    execFileSync('claude', ['auth', 'login'], {
      stdio: 'inherit',
      timeout: 120_000,
      env: { ...process.env, CLAUDE_CONFIG_DIR: claudeConfigDir },
    });
    console.log('');
    success('Claude Code authenticated.');
  } catch {
    console.log('');
    warn('Authentication failed or skipped.');
    info(`Run manually: CLAUDE_CONFIG_DIR="${claudeConfigDir}" claude auth login`);
  }
}
