// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPermissionChecker } from './check.js';
import type { PermissionCheckDeps } from './types.js';
import type { ModuleManifest } from '@opentidy/shared';

const gmailManifest: ModuleManifest = {
  name: 'gmail',
  label: 'Gmail',
  description: '',
  version: '1.0.0',
  toolPermissions: {
    scope: 'per-call',
    safe: ['mcp__gmail__search', 'mcp__gmail__read_message'],
    critical: ['mcp__gmail__send', 'mcp__gmail__reply'],
  },
};

const browserManifest: ModuleManifest = {
  name: 'browser',
  label: 'Browser',
  description: '',
  version: '1.0.0',
  toolPermissions: {
    scope: 'per-task',
    safe: ['mcp__camofox__navigate', 'mcp__camofox__snapshot'],
    critical: ['mcp__camofox__click', 'mcp__camofox__fill_form'],
  },
};

const manifests = new Map<string, ModuleManifest>([
  ['gmail', gmailManifest],
  ['browser', browserManifest],
]);

function makeDeps(overrides: Partial<PermissionCheckDeps> = {}): PermissionCheckDeps {
  return {
    manifests,
    loadConfig: () => ({
      preset: 'supervised',
      defaultLevel: 'ask',
      modules: { gmail: 'ask', browser: 'ask' },
    }),
    state: {
      isGranted: vi.fn().mockReturnValue(false),
      grant: vi.fn(),
    },
    requestApproval: vi.fn().mockResolvedValue(true),
    audit: {
      log: vi.fn(),
    },
    ...overrides,
  };
}

describe('createPermissionChecker', () => {
  describe('safe tools', () => {
    it('allows safe tools immediately without requesting approval', async () => {
      const deps = makeDeps();
      const checker = createPermissionChecker(deps);

      const result = await checker.check('task-1', 'session-1', 'mcp__gmail__search', {});

      expect(result).toBe('allow');
      expect(deps.requestApproval).not.toHaveBeenCalled();
      expect(deps.audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ decision: 'ALLOW' }),
      );
    });

    it('allows safe browser tools immediately', async () => {
      const deps = makeDeps();
      const checker = createPermissionChecker(deps);

      const result = await checker.check('task-1', 'session-1', 'mcp__camofox__navigate', {});

      expect(result).toBe('allow');
      expect(deps.requestApproval).not.toHaveBeenCalled();
    });
  });

  describe('ask + per-call tools', () => {
    it('requests approval for ask+per-call critical tools', async () => {
      const deps = makeDeps({
        requestApproval: vi.fn().mockResolvedValue(true),
      });
      const checker = createPermissionChecker(deps);

      const result = await checker.check('task-1', 'session-1', 'mcp__gmail__send', { to: 'alice@example.com' });

      expect(result).toBe('allow');
      expect(deps.requestApproval).toHaveBeenCalledWith({
        taskId: 'task-1',
        toolName: 'mcp__gmail__send',
        toolInput: { to: 'alice@example.com' },
        moduleName: 'gmail',
      });
    });

    it('denies when user rejects approval', async () => {
      const deps = makeDeps({
        requestApproval: vi.fn().mockResolvedValue(false),
      });
      const checker = createPermissionChecker(deps);

      const result = await checker.check('task-1', 'session-1', 'mcp__gmail__send', {});

      expect(result).toBe('deny');
      expect(deps.audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ decision: 'DENY' }),
      );
    });
  });

  describe('ask + per-task tools', () => {
    it('requests approval for per-task critical tools on first call', async () => {
      const deps = makeDeps({
        state: {
          isGranted: vi.fn().mockReturnValue(false),
          grant: vi.fn(),
        },
        requestApproval: vi.fn().mockResolvedValue(true),
      });
      const checker = createPermissionChecker(deps);

      const result = await checker.check('task-1', 'session-1', 'mcp__camofox__click', {});

      expect(result).toBe('allow');
      expect(deps.requestApproval).toHaveBeenCalledOnce();
    });

    it('skips approval when per-task grant already exists', async () => {
      const deps = makeDeps({
        state: {
          isGranted: vi.fn().mockReturnValue(true),
          grant: vi.fn(),
        },
        requestApproval: vi.fn(),
      });
      const checker = createPermissionChecker(deps);

      const result = await checker.check('task-1', 'session-1', 'mcp__camofox__click', {});

      expect(result).toBe('allow');
      expect(deps.requestApproval).not.toHaveBeenCalled();
      expect(deps.audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ decision: 'ALLOW' }),
      );
    });

    it('grants per-task after first approval', async () => {
      const deps = makeDeps({
        state: {
          isGranted: vi.fn().mockReturnValue(false),
          grant: vi.fn(),
        },
        requestApproval: vi.fn().mockResolvedValue(true),
      });
      const checker = createPermissionChecker(deps);

      await checker.check('task-1', 'session-1', 'mcp__camofox__click', {});

      expect(deps.state.grant).toHaveBeenCalledWith('task-1', 'browser');
    });

    it('does not grant per-task when user denies', async () => {
      const deps = makeDeps({
        state: {
          isGranted: vi.fn().mockReturnValue(false),
          grant: vi.fn(),
        },
        requestApproval: vi.fn().mockResolvedValue(false),
      });
      const checker = createPermissionChecker(deps);

      const result = await checker.check('task-1', 'session-1', 'mcp__camofox__click', {});

      expect(result).toBe('deny');
      expect(deps.state.grant).not.toHaveBeenCalled();
    });
  });

  describe('block level', () => {
    it('denies block-level tools defensively', async () => {
      const deps = makeDeps({
        loadConfig: () => ({
          preset: 'supervised',
          defaultLevel: 'block',
          modules: { gmail: 'block', browser: 'block' },
        }),
      });
      const checker = createPermissionChecker(deps);

      const result = await checker.check('task-1', 'session-1', 'mcp__gmail__send', {});

      expect(result).toBe('deny');
      expect(deps.requestApproval).not.toHaveBeenCalled();
      expect(deps.audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ decision: 'BLOCK' }),
      );
    });
  });

  describe('audit', () => {
    it('audits with sessionId and toolName on allow', async () => {
      const deps = makeDeps();
      const checker = createPermissionChecker(deps);

      await checker.check('task-1', 'sess-abc', 'mcp__gmail__read_message', { messageId: '42' });

      expect(deps.audit.log).toHaveBeenCalledWith({
        sessionId: 'sess-abc',
        toolName: 'mcp__gmail__read_message',
        toolInput: { messageId: '42' },
        decision: 'ALLOW',
      });
    });
  });
});
