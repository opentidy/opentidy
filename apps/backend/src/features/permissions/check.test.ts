// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect, vi } from 'vitest';
import { createPermissionChecker } from './check.js';
import type { PermissionCheckDeps } from './types.js';
import type { ModuleManifest } from '@opentidy/shared';

const emailManifest: ModuleManifest = {
  name: 'email',
  label: 'Email',
  description: '',
  version: '1.0.0',
  toolPermissions: {
    scope: 'per-call',
    safe: ['mcp__email__search', 'mcp__email__read_message'],
    critical: ['mcp__email__send', 'mcp__email__reply'],
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
  ['email', emailManifest],
  ['browser', browserManifest],
]);

function makeDeps(overrides: Partial<PermissionCheckDeps> = {}): PermissionCheckDeps {
  return {
    manifests,
    loadConfig: () => ({
      preset: 'supervised',
      defaultLevel: 'ask',
      modules: { email: { safe: 'allow', critical: 'ask' }, browser: { safe: 'allow', critical: 'ask' } },
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

      const result = await checker.check('task-1', 'session-1', 'mcp__email__search', {});

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

      const result = await checker.check('task-1', 'session-1', 'mcp__email__send', { to: 'alice@example.com' });

      expect(result).toBe('allow');
      expect(deps.requestApproval).toHaveBeenCalledWith({
        taskId: 'task-1',
        toolName: 'mcp__email__send',
        toolInput: { to: 'alice@example.com' },
        moduleName: 'email',
      });
    });

    it('denies when user rejects approval', async () => {
      const deps = makeDeps({
        requestApproval: vi.fn().mockResolvedValue(false),
      });
      const checker = createPermissionChecker(deps);

      const result = await checker.check('task-1', 'session-1', 'mcp__email__send', {});

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
          modules: { email: 'block', browser: 'block' },
        }),
      });
      const checker = createPermissionChecker(deps);

      const result = await checker.check('task-1', 'session-1', 'mcp__email__send', {});

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

      await checker.check('task-1', 'sess-abc', 'mcp__email__read_message', { messageId: '42' });

      expect(deps.audit.log).toHaveBeenCalledWith({
        sessionId: 'sess-abc',
        toolName: 'mcp__email__read_message',
        toolInput: { messageId: '42' },
        decision: 'ALLOW',
      });
    });
  });
});
