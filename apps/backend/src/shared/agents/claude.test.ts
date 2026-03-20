// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import { createClaudeAdapter } from './claude.js';
import type { GuardrailRule, McpServicesConfig } from './types.js';

vi.mock('fs');

describe('createClaudeAdapter', () => {
  const adapter = createClaudeAdapter('/fake/config/dir');

  it('has correct metadata', () => {
    expect(adapter.name).toBe('claude');
    expect(adapter.binary).toBe('claude');
    expect(adapter.instructionFile).toBe('CLAUDE.md');
    expect(adapter.configEnvVar).toBe('CLAUDE_CONFIG_DIR');
    expect(adapter.experimental).toBe(false);
  });

  describe('buildArgs', () => {
    it('builds one-shot args with system prompt', () => {
      const args = adapter.buildArgs({
        mode: 'one-shot',
        cwd: '/workspace',
        systemPrompt: 'You are a triage agent',
        instruction: 'Classify this email',
      });
      expect(args).toContain('-p');
      expect(args).toContain('--system-prompt');
      expect(args).toContain('You are a triage agent');
      expect(args).toContain('--strict-mcp-config');
      expect(args).toContain('--mcp-config');
      expect(args).toContain('{"mcpServers":{}}');
      expect(args).toContain('Classify this email');
    });

    it('builds one-shot args with allowedTools and -- separator', () => {
      const args = adapter.buildArgs({
        mode: 'one-shot',
        cwd: '/workspace',
        systemPrompt: 'Sweep',
        instruction: 'Check workspace',
        allowedTools: ['Read', 'Glob', 'Grep', 'Write'],
      });
      expect(args).toContain('--allowedTools');
      expect(args).toContain('Read,Glob,Grep,Write');
      const dashDashIdx = args.indexOf('--');
      expect(dashDashIdx).toBeGreaterThan(-1);
      expect(args[dashDashIdx + 1]).toBe('Check workspace');
    });

    it('builds one-shot args with text output format', () => {
      const args = adapter.buildArgs({
        mode: 'one-shot',
        cwd: '/workspace',
        systemPrompt: 'Generate title',
        instruction: 'My instruction',
        outputFormat: 'text',
      });
      expect(args).toContain('--output-format');
      expect(args).toContain('text');
    });

    it('builds autonomous args with resume and skipPermissions', () => {
      const args = adapter.buildArgs({
        mode: 'autonomous',
        cwd: '/workspace/job-1',
        instruction: 'Work on this',
        resumeSessionId: 'session-abc',
        skipPermissions: true,
      });
      expect(args).toContain('-p');
      expect(args).toContain('--dangerously-skip-permissions');
      expect(args).toContain('--resume');
      expect(args).toContain('session-abc');
    });

    it('builds interactive args without -p', () => {
      const args = adapter.buildArgs({
        mode: 'interactive',
        cwd: '/workspace/job-1',
        skipPermissions: true,
        resumeSessionId: 'session-abc',
        pluginDir: '/plugins/opentidy-hooks',
      });
      expect(args).not.toContain('-p');
      expect(args).toContain('--dangerously-skip-permissions');
      expect(args).toContain('--resume');
      expect(args).toContain('session-abc');
      expect(args).toContain('--plugin-dir');
      expect(args).toContain('/plugins/opentidy-hooks');
    });

    it('builds interactive args without instruction', () => {
      const args = adapter.buildArgs({
        mode: 'interactive',
        cwd: '/workspace/job-1',
        skipPermissions: true,
      });
      expect(args).toContain('--dangerously-skip-permissions');
      expect(args).not.toContain('-p');
      // No instruction appended
      const lastArg = args[args.length - 1];
      expect(lastArg).not.toMatch(/^[A-Z]/);
    });

    it('includes --strict-mcp-config only for one-shot mode', () => {
      const oneShot = adapter.buildArgs({ mode: 'one-shot', cwd: '/workspace' });
      expect(oneShot).toContain('--strict-mcp-config');
      expect(oneShot).toContain('{"mcpServers":{}}');

      const interactive = adapter.buildArgs({ mode: 'interactive', cwd: '/workspace' });
      expect(interactive).not.toContain('--strict-mcp-config');

      const autonomous = adapter.buildArgs({ mode: 'autonomous', cwd: '/workspace' });
      expect(autonomous).not.toContain('--strict-mcp-config');
    });

    it('does not add --dangerously-skip-permissions when skipPermissions is false', () => {
      const args = adapter.buildArgs({
        mode: 'one-shot',
        cwd: '/workspace',
        instruction: 'test',
      });
      expect(args).not.toContain('--dangerously-skip-permissions');
    });
  });

  it('returns correct env vars', () => {
    const env = adapter.getEnv();
    expect(env).toEqual({ CLAUDE_CONFIG_DIR: '/fake/config/dir' });
  });

  it('returns null for nonexistent session id', () => {
    vi.mocked(fs.readFileSync).mockImplementation(() => { throw new Error('ENOENT'); });
    const result = adapter.readSessionId('/nonexistent/dir');
    expect(result).toBeNull();
  });

  describe('writeConfig', () => {
    beforeEach(() => {
      vi.mocked(fs.mkdirSync).mockImplementation(() => undefined as any);
      vi.mocked(fs.writeFileSync).mockImplementation(() => {});
    });

    it('translates guardrails to Claude-native hooks.json format', () => {
      const guardrails: GuardrailRule[] = [
        { event: 'pre-tool', type: 'prompt', match: 'mcp__gmail__send', prompt: 'Check email' },
        { event: 'pre-tool', type: 'prompt', match: 'mcp__camofox__click', prompt: 'Check click' },
        { event: 'post-tool', type: 'http', match: 'mcp__gmail__', url: 'http://localhost:5174/api/hooks' },
        { event: 'stop', type: 'command', match: '*', command: 'echo stop' },
        { event: 'session-end', type: 'http', match: '*', url: 'http://localhost:5174/api/hooks' },
      ];

      adapter.writeConfig({
        guardrails,
        mcpServices: {} as McpServicesConfig,
        configDir: '/fake/config/dir',
      });

      expect(fs.mkdirSync).toHaveBeenCalledWith('/fake/config/dir/hooks', { recursive: true });
      const writeCall = vi.mocked(fs.writeFileSync).mock.calls.find(
        c => String(c[0]).endsWith('hooks.json'),
      );
      expect(writeCall).toBeDefined();

      const written = JSON.parse(writeCall![1] as string);
      expect(written.hooks.PreToolUse).toHaveLength(2);
      expect(written.hooks.PreToolUse[0].matcher).toBe('mcp__gmail__send');
      expect(written.hooks.PreToolUse[0].hooks[0].type).toBe('prompt');
      expect(written.hooks.PostToolUse).toHaveLength(1);
      expect(written.hooks.PostToolUse[0].matcher).toBe('mcp__gmail__');
      expect(written.hooks.Stop).toHaveLength(1);
      expect(written.hooks.Stop[0].matcher).toBeUndefined();
      expect(written.hooks.Stop[0].hooks[0].type).toBe('command');
      expect(written.hooks.SessionEnd).toHaveLength(1);
      expect(written.hooks.SessionEnd[0].hooks[0].type).toBe('http');
    });
  });
});
