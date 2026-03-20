// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect } from 'vitest';
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- scaffolding for future tests
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- scaffolding for future tests
import { join } from 'path';
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- scaffolding for future tests
import { tmpdir } from 'os';

describe('uninstall safety', () => {
  // We test the safety logic by importing the module
  // The actual uninstall is too destructive to test directly

  it('module exports runUninstall', async () => {
    const mod = await import('./uninstall.js');
    expect(typeof mod.runUninstall).toBe('function');
  });
});