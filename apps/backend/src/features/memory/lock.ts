// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import fs from 'node:fs'
import path from 'node:path'
import { isPidAlive } from '../../shared/locks.js'

const RETRY_INTERVAL_MS = 200
const DEFAULT_TIMEOUT_MS = 3_600_000 // 1h, Claude -p can take a long time under load

export function createMemoryLock(memoryDir: string) {
  const lockPath = path.join(memoryDir, '.lock')

  async function acquire(timeoutMs = DEFAULT_TIMEOUT_MS): Promise<void> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      try {
        fs.writeFileSync(lockPath, String(process.pid), { flag: 'wx' })
        return
      } catch {
        // Lock exists. Check if the owning process is still alive.
        try {
          const lockPid = parseInt(fs.readFileSync(lockPath, 'utf-8').trim(), 10)
          if (lockPid && !isPidAlive(lockPid)) {
            // Stale lock, remove and retry immediately
            console.warn(`[memory] removing stale lock from dead process ${lockPid}`)
            fs.unlinkSync(lockPath)
            continue
          }
        } catch {
          // Can't read lock file, might have been released. Retry.
        }
        await new Promise(r => setTimeout(r, RETRY_INTERVAL_MS))
      }
    }
    throw new Error(`[memory] lock acquire timeout after ${timeoutMs}ms`)
  }

  function release(): void {
    try {
      fs.unlinkSync(lockPath)
    } catch {
      // Already released
    }
  }

  return { acquire, release }
}