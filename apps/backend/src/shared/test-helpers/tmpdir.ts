// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { beforeEach, afterEach } from 'vitest'

/**
 * Create a temporary directory that is automatically cleaned up after each test.
 * Returns a stable ref object whose `.path` is set in beforeEach.
 *
 * Usage:
 *   const tmp = useTmpDir('opentidy-test-')
 *   // in tests: tmp.path is the directory
 */
export function useTmpDir(prefix = 'opentidy-test-'): { path: string } {
  const ref = { path: '' }

  beforeEach(() => {
    ref.path = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  })

  afterEach(() => {
    if (ref.path) {
      fs.rmSync(ref.path, { recursive: true, force: true })
    }
  })

  return ref
}
