// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import fs from 'fs';
import path from 'path';
import type { AgentAdapter, SpawnOpts, SetupOpts } from './types.js';

export function createClaudeAdapter(configDir: string): AgentAdapter {
  return {
    name: 'claude',
    binary: 'claude',
    instructionFile: 'CLAUDE.md',
    configEnvVar: 'CLAUDE_CONFIG_DIR',
    experimental: false,

    buildArgs(opts: SpawnOpts): string[] {
      const args: string[] = [];

      // One-shot calls (triage, sweep, memory) use strict MCP config with no servers.
      // Reasons: speed (no MCP startup), isolation (no side effects), reduced attack surface.
      // Autonomous/interactive sessions load MCPs from CLAUDE_CONFIG_DIR/settings.json.
      if (opts.mode === 'one-shot') {
        args.push('--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}');
      }

      if (opts.mode === 'one-shot' || opts.mode === 'autonomous') {
        args.push('-p');
      }

      if (opts.skipPermissions) {
        args.push('--dangerously-skip-permissions');
      }

      if (opts.systemPrompt) {
        args.push('--system-prompt', opts.systemPrompt);
      }

      if (opts.outputFormat) {
        args.push('--output-format', opts.outputFormat);
      }

      if (opts.allowedTools?.length) {
        args.push('--allowedTools', opts.allowedTools.join(','));
      }

      if (opts.pluginDir) {
        args.push('--plugin-dir', opts.pluginDir);
      }

      if (opts.resumeSessionId) {
        args.push('--resume', opts.resumeSessionId);
      }

      if (opts.allowedTools?.length && opts.instruction) {
        args.push('--', opts.instruction);
      } else if (opts.instruction) {
        args.push(opts.instruction);
      }

      return args;
    },

    getEnv(): Record<string, string> {
      return { CLAUDE_CONFIG_DIR: configDir };
    },

    readSessionId(dossierDir: string): string | null {
      const sessionIdFile = path.join(dossierDir, '.session-id');
      try {
        return fs.readFileSync(sessionIdFile, 'utf-8').trim() || null;
      } catch {
        return null;
      }
    },

    writeConfig(opts: SetupOpts): void {
      const EVENT_MAP: Record<string, string> = {
        'pre-tool': 'PreToolUse',
        'post-tool': 'PostToolUse',
        'stop': 'Stop',
        'session-end': 'SessionEnd',
      };

      // Claude hooks.json format: { hooks: { EventName: [{ matcher?, hooks: [{ type, ... }] }] } }
      const hooksConfig: Record<string, { matcher?: string; hooks: Record<string, unknown>[] }[]> = {};

      for (const rule of opts.guardrails) {
        const eventName = EVENT_MAP[rule.event];
        if (!eventName) continue;
        if (!hooksConfig[eventName]) hooksConfig[eventName] = [];

        const matcher = typeof rule.match === 'string' ? rule.match : rule.match.tool;
        const hookEntry: Record<string, unknown> = { type: rule.type };

        if (rule.type === 'prompt') {
          hookEntry.prompt = rule.prompt;
        } else if (rule.type === 'command') {
          hookEntry.command = rule.command;
        } else if (rule.type === 'http') {
          hookEntry.url = rule.url;
        }

        // Group by matcher — Stop/SessionEnd have no matcher (match: "*")
        if (matcher === '*') {
          hooksConfig[eventName].push({ hooks: [hookEntry] });
        } else {
          hooksConfig[eventName].push({ matcher, hooks: [hookEntry] });
        }
      }

      const hooksDir = path.join(opts.configDir, 'hooks');
      fs.mkdirSync(hooksDir, { recursive: true });
      fs.writeFileSync(
        path.join(hooksDir, 'hooks.json'),
        JSON.stringify({ hooks: hooksConfig }, null, 2),
      );
    },
  };
}
