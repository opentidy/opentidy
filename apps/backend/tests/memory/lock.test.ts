import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createMemoryLock } from '../../src/memory/lock.js'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

describe('MemoryLock', () => {
  let tmpDir: string
  let lock: ReturnType<typeof createMemoryLock>

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opentidy-lock-test-'))
    lock = createMemoryLock(tmpDir)
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('acquires and releases lock', async () => {
    await lock.acquire()
    expect(fs.existsSync(path.join(tmpDir, '.lock'))).toBe(true)
    lock.release()
    expect(fs.existsSync(path.join(tmpDir, '.lock'))).toBe(false)
  })

  it('waits for lock to be released', async () => {
    await lock.acquire()
    const lock2 = createMemoryLock(tmpDir)

    // Release after 300ms
    setTimeout(() => lock.release(), 300)

    const start = Date.now()
    await lock2.acquire()
    const elapsed = Date.now() - start
    expect(elapsed).toBeGreaterThanOrEqual(200)
    lock2.release()
  })

  it('throws on timeout', async () => {
    await lock.acquire()
    const lock2 = createMemoryLock(tmpDir)
    await expect(lock2.acquire(500)).rejects.toThrow('timeout')
  })
})
