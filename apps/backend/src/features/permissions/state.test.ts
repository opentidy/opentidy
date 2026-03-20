// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect, beforeEach } from 'vitest';
import { createPermissionState } from './state';

describe('PermissionState', () => {
  let state: ReturnType<typeof createPermissionState>;

  beforeEach(() => {
    state = createPermissionState();
  });

  it('returns false for unknown job+module', () => {
    expect(state.isGranted('job-1', 'gmail')).toBe(false);
  });

  it('grants and checks per-job', () => {
    state.grant('job-1', 'camofox');
    expect(state.isGranted('job-1', 'camofox')).toBe(true);
  });

  it('does not leak grants across jobs', () => {
    state.grant('job-1', 'camofox');
    expect(state.isGranted('job-2', 'camofox')).toBe(false);
  });

  it('revokes grants for a job', () => {
    state.grant('job-1', 'camofox');
    state.revokeJob('job-1');
    expect(state.isGranted('job-1', 'camofox')).toBe(false);
  });
});
