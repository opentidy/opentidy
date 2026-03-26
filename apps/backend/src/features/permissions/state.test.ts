// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect, beforeEach } from 'vitest';
import { createPermissionState } from './state';

describe('PermissionState', () => {
  let state: ReturnType<typeof createPermissionState>;

  beforeEach(() => {
    state = createPermissionState();
  });

  it('returns false for unknown task+module', () => {
    expect(state.isGranted('task-1', 'email')).toBe(false);
  });

  it('grants and checks per-task', () => {
    state.grant('task-1', 'camofox');
    expect(state.isGranted('task-1', 'camofox')).toBe(true);
  });

  it('does not leak grants across tasks', () => {
    state.grant('task-1', 'camofox');
    expect(state.isGranted('task-2', 'camofox')).toBe(false);
  });

  it('revokes grants for a task', () => {
    state.grant('task-1', 'camofox');
    state.revokeTask('task-1');
    expect(state.isGranted('task-1', 'camofox')).toBe(false);
  });
});
