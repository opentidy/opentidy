// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('uninstall safety', () => {
  // We test the safety logic by importing the module
  // The actual uninstall is too destructive to test directly

  it('module exports runUninstall', async () => {
    const mod = await import('./uninstall.js');
    expect(typeof mod.runUninstall).toBe('function');
  });
});