// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import fs from 'fs';
import path from 'path';
import type { AgentAdapter, SpawnOpts, SetupOpts } from '@opentidy/shared';
import { createPermissionResolver } from '../../features/permissions/resolver.js';

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

    readSessionId(jobDir: string): string | null {
      const sessionIdFile = path.join(jobDir, '.session-id');
      try {
        return fs.readFileSync(sessionIdFile, 'utf-8').trim() || null;
      } catch {
        return null;
      }
    },

    writeConfig(opts: SetupOpts): void {
      const resolver = createPermissionResolver(opts.manifests, opts.permissionConfig);
      const confirmMatcher = resolver.getConfirmMatcher();

      const hooksConfig: Record<string, unknown[]> = {};

      if (confirmMatcher) {
        hooksConfig['PreToolUse'] = [{
          matcher: confirmMatcher,
          hooks: [{
            type: 'command',
            command: `curl -s -X POST http://localhost:${opts.serverPort}/api/permissions/check -H 'Content-Type: application/json' -d @-`,
            timeout: 3600000,
          }],
        }];
      }

      hooksConfig['PostToolUse'] = [{
        hooks: [{
          type: 'command',
          command: `curl -s -X POST http://localhost:${opts.serverPort}/api/hooks -H 'Content-Type: application/json' -d @-`,
        }],
      }];

      hooksConfig['Stop'] = [{
        hooks: [{
          type: 'command',
          command: `curl -s -X POST http://localhost:${opts.serverPort}/api/hooks -H 'Content-Type: application/json' -d @-`,
        }],
      }];

      hooksConfig['SessionEnd'] = [{
        hooks: [{
          type: 'command',
          command: `curl -s -X POST http://localhost:${opts.serverPort}/api/hooks -H 'Content-Type: application/json' -d @-`,
        }],
      }];

      const hooksDir = path.join(opts.configDir, 'hooks');
      fs.mkdirSync(hooksDir, { recursive: true });
      fs.writeFileSync(
        path.join(hooksDir, 'hooks.json'),
        JSON.stringify({ hooks: hooksConfig }, null, 2),
      );
    },
  };
}
