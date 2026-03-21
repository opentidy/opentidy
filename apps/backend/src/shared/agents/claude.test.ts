// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import { createClaudeAdapter } from './claude.js';
import type { McpServicesConfig, ModuleManifest, PermissionConfig } from '@opentidy/shared';

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

    it('builds autonomous args with resume', () => {
      const args = adapter.buildArgs({
        mode: 'autonomous',
        cwd: '/workspace/task-1',
        instruction: 'Work on this',
        resumeSessionId: 'session-abc',
      });
      expect(args).toContain('-p');
      expect(args).toContain('--resume');
      expect(args).toContain('session-abc');
    });

    it('does not include --dangerously-skip-permissions in args', () => {
      const oneShotArgs = adapter.buildArgs({ mode: 'one-shot', cwd: '/workspace', instruction: 'test' });
      expect(oneShotArgs).not.toContain('--dangerously-skip-permissions');

      const autonomousArgs = adapter.buildArgs({ mode: 'autonomous', cwd: '/workspace/task-1', instruction: 'Work on this' });
      expect(autonomousArgs).not.toContain('--dangerously-skip-permissions');

      const interactiveArgs = adapter.buildArgs({ mode: 'interactive', cwd: '/workspace/task-1' });
      expect(interactiveArgs).not.toContain('--dangerously-skip-permissions');
    });

    it('builds interactive args without -p', () => {
      const args = adapter.buildArgs({
        mode: 'interactive',
        cwd: '/workspace/task-1',
        resumeSessionId: 'session-abc',
        pluginDir: '/plugins/opentidy-hooks',
      });
      expect(args).not.toContain('-p');
      expect(args).toContain('--resume');
      expect(args).toContain('session-abc');
      expect(args).toContain('--plugin-dir');
      expect(args).toContain('/plugins/opentidy-hooks');
    });

    it('builds interactive args without instruction', () => {
      const args = adapter.buildArgs({
        mode: 'interactive',
        cwd: '/workspace/task-1',
      });
      expect(args).not.toContain('-p');
      // No instruction appended — args may be empty or last arg is not a sentence
      if (args.length > 0) {
        const lastArg = args[args.length - 1];
        expect(lastArg).not.toMatch(/^[A-Z][a-z]/);
      }
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
      vi.mocked(fs.mkdirSync).mockReset().mockImplementation(() => undefined as any);
      vi.mocked(fs.writeFileSync).mockReset().mockImplementation(() => {});
    });

    function makeManifest(name: string, safe: string[], critical: string[]): ModuleManifest {
      return {
        name,
        label: name,
        description: name,
        version: '1.0.0',
        toolPermissions: { scope: 'per-call', safe, critical },
      };
    }

    const permissionConfig: PermissionConfig = {
      preset: 'supervised',
      defaultLevel: 'confirm',
      modules: {},
    };

    it('generates PreToolUse command hook when confirm tools exist', () => {
      const manifests = new Map<string, ModuleManifest>([
        ['gmail', makeManifest('gmail', [], ['mcp__gmail__send'])],
      ]);

      adapter.writeConfig({
        permissionConfig,
        manifests,
        mcpServices: {} as McpServicesConfig,
        configDir: '/fake/config/dir',
        serverPort: 5174,
      });

      expect(fs.mkdirSync).toHaveBeenCalledWith('/fake/config/dir/hooks', { recursive: true });
      const writeCall = vi.mocked(fs.writeFileSync).mock.calls.find(
        c => String(c[0]).endsWith('hooks.json'),
      );
      expect(writeCall).toBeDefined();

      const written = JSON.parse(writeCall![1] as string);
      expect(written.hooks.PreToolUse).toHaveLength(1);
      expect(written.hooks.PreToolUse[0].matcher).toContain('mcp__gmail__send');
      expect(written.hooks.PreToolUse[0].hooks[0].type).toBe('command');
      expect(written.hooks.PreToolUse[0].hooks[0].command).toContain('/api/permissions/check');
      expect(written.hooks.PreToolUse[0].hooks[0].timeout).toBe(3600000);
    });

    it('omits PreToolUse when no confirm tools exist (all allow)', () => {
      const allowConfig: PermissionConfig = {
        preset: 'autonomous',
        defaultLevel: 'allow',
        modules: {},
      };
      const manifests = new Map<string, ModuleManifest>([
        ['gmail', makeManifest('gmail', ['mcp__gmail__read'], ['mcp__gmail__send'])],
      ]);

      adapter.writeConfig({
        permissionConfig: allowConfig,
        manifests,
        mcpServices: {} as McpServicesConfig,
        configDir: '/fake/config/dir',
        serverPort: 5174,
      });

      const writeCall = vi.mocked(fs.writeFileSync).mock.calls.find(
        c => String(c[0]).endsWith('hooks.json'),
      );
      expect(writeCall).toBeDefined();
      const written = JSON.parse(writeCall![1] as string);
      expect(written.hooks.PreToolUse).toBeUndefined();
    });

    it('always generates PostToolUse, Stop, and SessionEnd lifecycle hooks', () => {
      const manifests = new Map<string, ModuleManifest>();

      adapter.writeConfig({
        permissionConfig,
        manifests,
        mcpServices: {} as McpServicesConfig,
        configDir: '/fake/config/dir',
        serverPort: 5174,
      });

      const writeCall = vi.mocked(fs.writeFileSync).mock.calls.find(
        c => String(c[0]).endsWith('hooks.json'),
      );
      const written = JSON.parse(writeCall![1] as string);

      expect(written.hooks.PostToolUse).toHaveLength(1);
      expect(written.hooks.PostToolUse[0].hooks[0].command).toContain('/api/hooks');
      expect(written.hooks.Stop).toHaveLength(1);
      expect(written.hooks.Stop[0].hooks[0].command).toContain('/api/hooks');
      expect(written.hooks.SessionEnd).toHaveLength(1);
      expect(written.hooks.SessionEnd[0].hooks[0].command).toContain('/api/hooks');
    });

    it('uses the configured serverPort in hook URLs', () => {
      const manifests = new Map<string, ModuleManifest>();

      adapter.writeConfig({
        permissionConfig,
        manifests,
        mcpServices: {} as McpServicesConfig,
        configDir: '/fake/config/dir',
        serverPort: 9999,
      });

      const writeCall = vi.mocked(fs.writeFileSync).mock.calls.find(
        c => String(c[0]).endsWith('hooks.json'),
      );
      const written = JSON.parse(writeCall![1] as string);
      expect(written.hooks.Stop[0].hooks[0].command).toContain('localhost:9999');
    });
  });
});
