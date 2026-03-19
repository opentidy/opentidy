// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect } from 'vitest';
import { createPtyManager, ALLOWED_COMMANDS } from './pty.js';

describe('PTY Manager', () => {
  it('rejects commands not in allowlist', () => {
    const manager = createPtyManager();
    expect(() => manager.validateCommand('rm -rf /')).toThrow('not allowed');
  });

  it('accepts known setup commands', () => {
    const manager = createPtyManager();
    for (const cmd of ALLOWED_COMMANDS) {
      expect(() => manager.validateCommand(cmd)).not.toThrow();
    }
  });

  it('accepts commands that start with allowed prefix', () => {
    const manager = createPtyManager();
    expect(() => manager.validateCommand('claude auth login --some-flag')).not.toThrow();
  });

  it('tracks zero active sessions initially', () => {
    const manager = createPtyManager();
    expect(manager.activeSessions()).toBe(0);
  });
});
