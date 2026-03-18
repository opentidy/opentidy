import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createMemoryManager } from '../../src/memory/manager.js'
import { createMemoryLock } from '../../src/memory/lock.js'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

describe('Adversarial: Memory Manager', () => {
  let workspaceDir: string
  let memDir: string
  let indexPath: string
  let manager: ReturnType<typeof createMemoryManager>

  beforeEach(() => {
    workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alfred-adv-test-'))
    memDir = path.join(workspaceDir, '_memory')
    indexPath = path.join(memDir, 'INDEX.md')
    manager = createMemoryManager(workspaceDir)
    manager.ensureDir()
  })

  afterEach(() => {
    fs.rmSync(workspaceDir, { recursive: true, force: true })
  })

  // ==========================================================================
  // CORRUPTED DATA
  // ==========================================================================
  describe('corrupted data', () => {
    it('INDEX.md contains random garbage text → readIndex() should not crash', () => {
      fs.writeFileSync(indexPath, 'aslkdjf 98q34u jkahsdkjh \n\x00\xff binary junk')
      expect(() => manager.readIndex()).not.toThrow()
      expect(manager.readIndex()).toEqual([])
    })

    it('INDEX.md contains valid markdown but no table → should return empty array', () => {
      fs.writeFileSync(indexPath, '# Just a heading\n\nSome paragraph text.\n\n- a list\n- of items\n')
      expect(manager.readIndex()).toEqual([])
    })

    it('INDEX.md has extra columns in some rows → should still parse', () => {
      const content = `# Alfred Memory Index

| fichier | catégorie | mis à jour | description |
|---------|-----------|------------|-------------|
| test.md | business | 2026-03-16 | A test entry | extra-col |
| ok.md | dev | 2026-03-15 | Normal entry |
`
      fs.writeFileSync(indexPath, content)
      const entries = manager.readIndex()
      // The regex requires exactly 4 captured groups ending with |$
      // Extra column means the line has more pipes — the regex may or may not match
      // At minimum the normal entry should parse
      expect(entries.some(e => e.filename === 'ok.md')).toBe(true)
    })

    // FIX: Pipes in description are now escaped with \| in writeIndexFile,
    // and unescaped when reading back with readIndex.
    it('INDEX.md with escaped pipes in description → parsing works', () => {
      const content = `# Alfred Memory Index

| fichier | catégorie | mis à jour | description |
|---------|-----------|------------|-------------|
| test.md | business | 2026-03-16 | desc with \\| pipe char |
`
      fs.writeFileSync(indexPath, content)
      const entries = manager.readIndex()
      expect(entries).toHaveLength(1)
      expect(entries[0].description).toContain('pipe')
    })

    it('memory file with no frontmatter at all → readFile() should handle gracefully', () => {
      fs.writeFileSync(path.join(memDir, 'nofm.md'), 'Just plain content, no frontmatter.')
      const entry = manager.readFile('nofm.md')
      expect(entry.category).toBe('uncategorized')
      expect(entry.created).toBe('unknown')
      expect(entry.content).toContain('Just plain content')
    })

    // BUG FOUND: The regex /^---\n([\s\S]*?)\n---\n([\s\S]*)$/ requires \n---\n
    // If the closing --- is missing, the regex won't match, so it falls back to
    // {meta: {}, body: raw} — which includes the opening --- in the body.
    // This is actually graceful degradation, not a crash. But the body will contain "---".
    it('memory file with incomplete frontmatter (missing --- closing) → should not crash', () => {
      fs.writeFileSync(path.join(memDir, 'broken.md'), '---\ncategory: test\nSome content without closing')
      const entry = manager.readFile('broken.md')
      expect(entry).toBeDefined()
      expect(entry.category).toBe('uncategorized') // falls back because regex doesn't match
    })

    it('memory file with empty content after frontmatter → should work', () => {
      fs.writeFileSync(path.join(memDir, 'empty-body.md'), '---\ncategory: test\nupdated: 2026-01-01\n---\n')
      const entry = manager.readFile('empty-body.md')
      expect(entry.category).toBe('test')
      expect(entry.content).toBe('')
    })

    it('memory file that is completely empty (0 bytes) → should not crash', () => {
      fs.writeFileSync(path.join(memDir, 'zero.md'), '')
      const entry = manager.readFile('zero.md')
      expect(entry).toBeDefined()
      expect(entry.category).toBe('uncategorized')
      expect(entry.content).toBe('')
    })

    // FIX: The frontmatter regex now handles empty frontmatter (---\n---).
    it('memory file with only ---\\n--- (empty frontmatter) → should work', () => {
      fs.writeFileSync(path.join(memDir, 'emptyfm.md'), '---\n---\n\nBody here')
      const entry = manager.readFile('emptyfm.md')
      expect(entry).toBeDefined()
      expect(entry.content).toBe('Body here')
    })
  })

  // ==========================================================================
  // FILENAME SECURITY
  // ==========================================================================
  describe('filename security', () => {
    // FIX: Path traversal is now rejected by validateFilename.
    it('filename with path traversal "../escape.md" → throws', () => {
      expect(() =>
        manager.writeFile({
          filename: '../escape.md',
          category: 'hack',
          description: 'path traversal',
          content: 'pwned',
        })
      ).toThrow('invalid filename')
      // Verify no file was written outside memDir
      const escapedPath = path.join(workspaceDir, 'escape.md')
      expect(fs.existsSync(escapedPath)).toBe(false)
    })

    it('filename with spaces "my file.md" → should be handled', () => {
      manager.writeFile({
        filename: 'my file.md',
        category: 'test',
        description: 'spaces in name',
        content: 'works?',
      })
      const entry = manager.readFile('my file.md')
      expect(entry.content).toContain('works?')
      const index = manager.readIndex()
      expect(index.some(e => e.filename === 'my file.md')).toBe(true)
    })

    it('filename with special chars "café-résumé.md" → should work', () => {
      manager.writeFile({
        filename: 'café-résumé.md',
        category: 'test',
        description: 'unicode filename',
        content: 'with accents',
      })
      const entry = manager.readFile('café-résumé.md')
      expect(entry.content).toContain('with accents')
    })

    // BUG FOUND: A filename of just ".md" is technically valid on the filesystem
    // but is a terrible edge case — it's a hidden file, and readAllFiles
    // would pick it up since it passes the .endsWith('.md') filter.
    it('filename that is just ".md" → edge case', () => {
      // Should not crash at minimum
      expect(() =>
        manager.writeFile({
          filename: '.md',
          category: 'edge',
          description: 'dot md',
          content: 'edge case',
        })
      ).not.toThrow()
      // Verify it can be read back
      const entry = manager.readFile('.md')
      expect(entry.content).toContain('edge case')
    })

    it('very long filename (500 chars) → should not crash the filesystem', () => {
      const longName = 'a'.repeat(496) + '.md' // 500 chars total
      // Most filesystems limit filenames to 255 bytes. This should throw an OS error.
      expect(() =>
        manager.writeFile({
          filename: longName,
          category: 'test',
          description: 'long',
          content: 'too long',
        })
      ).toThrow() // ENAMETOOLONG
    })
  })

  // ==========================================================================
  // CONTENT EDGE CASES
  // ==========================================================================
  describe('content edge cases', () => {
    // FIX: Pipes are now escaped in writeIndexFile and unescaped in readIndex.
    it('content with pipes in description → INDEX.md round-trips correctly', () => {
      manager.writeFile({
        filename: 'pipes.md',
        category: 'test',
        description: 'has | pipe | chars',
        content: 'normal content',
      })
      const index = manager.readIndex()
      expect(index).toHaveLength(1)
      expect(index[0].description).toBe('has | pipe | chars')
    })

    // BUG FOUND: Content containing --- on its own line can break frontmatter parsing
    // when the file is re-read. The regex /^---\n([\s\S]*?)\n---\n/ is non-greedy
    // so it matches the FIRST ---\n after the opening, which means if content has
    // --- it won't affect the frontmatter block. But let's verify.
    it('content with --- in the body (looks like frontmatter delimiter)', () => {
      manager.writeFile({
        filename: 'dashes.md',
        category: 'test',
        description: 'has dashes',
        content: 'Line 1\n---\nLine 2\n---\nLine 3',
      })
      const entry = manager.readFile('dashes.md')
      // The frontmatter regex is non-greedy, matches first ---\n...\n---\n
      // So the actual frontmatter block is correct, and body contains the --- lines
      expect(entry.content).toContain('---')
      expect(entry.content).toContain('Line 1')
      expect(entry.content).toContain('Line 3')
      expect(entry.category).toBe('test')
    })

    // BUG FOUND: YAML values with colons — the frontmatter parser regex
    // /^(\w+):\s*(.+)$/ captures everything after the first colon.
    // So `description: value: with colon` gives description = "value: with colon" — actually correct!
    // But what about quoted YAML? `description: "value: with colon"` — quotes are included in value.
    it('frontmatter values with colons are preserved', () => {
      manager.writeFile({
        filename: 'colons.md',
        category: 'test',
        description: 'value: with colon',
        content: 'body',
      })
      const entry = manager.readFile('colons.md')
      expect(entry.description).toBe('value: with colon')
    })

    it('very large content (100KB) → writeFile and readFile should handle', () => {
      const largeContent = 'x'.repeat(100 * 1024)
      manager.writeFile({
        filename: 'large.md',
        category: 'test',
        description: 'large file',
        content: largeContent,
      })
      const entry = manager.readFile('large.md')
      expect(entry.content.length).toBeGreaterThanOrEqual(100 * 1024)
    })

    it('unicode content (Chinese, Arabic, emoji)', () => {
      const unicode = '中文内容\nمحتوى عربي\n🎉🔥💀\nÅäö'
      manager.writeFile({
        filename: 'unicode.md',
        category: 'test',
        description: 'unicode test',
        content: unicode,
      })
      const entry = manager.readFile('unicode.md')
      expect(entry.content).toContain('中文内容')
      expect(entry.content).toContain('محتوى عربي')
      expect(entry.content).toContain('🎉🔥💀')
    })

    it('content with null bytes \\0', () => {
      const nasty = 'before\0after\0end'
      manager.writeFile({
        filename: 'nullbytes.md',
        category: 'test',
        description: 'null bytes',
        content: nasty,
      })
      // Should at least not crash. Whether null bytes survive round-trip depends on fs.
      const entry = manager.readFile('nullbytes.md')
      expect(entry).toBeDefined()
    })

    // FIX: Newlines in description are now sanitized to spaces.
    it('description with newlines → sanitized to spaces', () => {
      manager.writeFile({
        filename: 'newline-desc.md',
        category: 'test',
        description: 'line1\nline2',
        content: 'body',
      })
      const entry = manager.readFile('newline-desc.md')
      expect(entry.description).toBe('line1 line2')
    })

    // FIX: Newlines in category are now sanitized to spaces.
    it('category with newline → sanitized to spaces', () => {
      manager.writeFile({
        filename: 'newline-cat.md',
        category: 'cat\nevil',
        description: 'test',
        content: 'body',
      })
      const entry = manager.readFile('newline-cat.md')
      expect(entry.category).toBe('cat evil')
    })
  })

  // ==========================================================================
  // INDEX.MD CONSISTENCY
  // ==========================================================================
  describe('INDEX.md consistency', () => {
    it('write a file, then manually corrupt INDEX.md → readFile should still work', () => {
      manager.writeFile({
        filename: 'safe.md',
        category: 'test',
        description: 'survives corruption',
        content: 'important data',
      })
      // Nuke the index
      fs.writeFileSync(indexPath, 'TOTALLY CORRUPTED GARBAGE')
      // readFile reads from disk, not from index
      const entry = manager.readFile('safe.md')
      expect(entry.content).toContain('important data')
    })

    // BUG FOUND: readAllFiles tries to readFile for every .md in memDir.
    // If a file is listed in INDEX but deleted from disk, readAllFiles will crash
    // because it reads from disk (readdirSync), not from index.
    // BUT: what if we delete from disk only? readdirSync won't list it, so it's fine.
    // The real issue: if a file is in INDEX but not on disk, readIndex returns it
    // but readFile throws. These are inconsistent.
    it('write two files, delete one manually from disk → readAllFiles should handle', () => {
      manager.writeFile({ filename: 'a.md', category: 'c', description: 'd', content: 'A' })
      manager.writeFile({ filename: 'b.md', category: 'c', description: 'd', content: 'B' })
      // Delete b.md from disk but leave INDEX.md untouched
      fs.unlinkSync(path.join(memDir, 'b.md'))

      // readAllFiles uses readdirSync, so it only tries to read existing files — should work
      const all = manager.readAllFiles()
      expect(all).toHaveLength(1)
      expect(all[0].filename).toBe('a.md')

      // But readIndex still shows b.md — inconsistency
      const index = manager.readIndex()
      expect(index).toHaveLength(2) // stale entry for b.md
    })

    it('reconstructIndex after deleting a file → should not include it', () => {
      manager.writeFile({ filename: 'a.md', category: 'c', description: 'd', content: 'A' })
      manager.writeFile({ filename: 'b.md', category: 'c', description: 'd', content: 'B' })
      fs.unlinkSync(path.join(memDir, 'b.md'))

      manager.reconstructIndex()
      const index = manager.readIndex()
      expect(index).toHaveLength(1)
      expect(index[0].filename).toBe('a.md')
    })

    it('write file, archive it, write new file with same name → no ghost entries in index', () => {
      manager.writeFile({ filename: 'reuse.md', category: 'v1', description: 'version 1', content: 'V1' })
      manager.archiveFile('reuse.md')
      manager.writeFile({ filename: 'reuse.md', category: 'v2', description: 'version 2', content: 'V2' })

      const index = manager.readIndex()
      const matches = index.filter(e => e.filename === 'reuse.md')
      expect(matches).toHaveLength(1)
      expect(matches[0].description).toBe('version 2')
    })

    // BUG FOUND: reconstructIndex reads ALL .md files except INDEX.md.
    // But _archived is a subdirectory, and readdirSync on memDir won't list files
    // inside _archived (it's not recursive). However, _archived itself shows up
    // in readdirSync as a directory entry — and it doesn't end with .md so it's filtered.
    // So this should actually be fine. Let's verify.
    it('reconstructIndex should not include archived files', () => {
      manager.writeFile({ filename: 'keep.md', category: 'c', description: 'd', content: 'K' })
      manager.writeFile({ filename: 'old.md', category: 'c', description: 'd', content: 'O' })
      manager.archiveFile('old.md')

      manager.reconstructIndex()
      const index = manager.readIndex()
      expect(index).toHaveLength(1)
      expect(index[0].filename).toBe('keep.md')
    })
  })

  // ==========================================================================
  // ARCHIVE EDGE CASES
  // ==========================================================================
  describe('archive edge cases', () => {
    // BUG FOUND: archiveFile uses fs.renameSync(src, dest). If dest already exists
    // (file already archived with same name), renameSync OVERWRITES it silently.
    // Previous archive is lost.
    it('archive a file that already exists in _archived → overwrites silently (data loss)', () => {
      // First write and archive
      manager.writeFile({ filename: 'dup.md', category: 'c', description: 'v1', content: 'Version 1' })
      manager.archiveFile('dup.md')

      // Write again with same name and archive again
      manager.writeFile({ filename: 'dup.md', category: 'c', description: 'v2', content: 'Version 2' })
      manager.archiveFile('dup.md')

      // The archived file now has Version 2, Version 1 is LOST
      const archived = fs.readFileSync(path.join(memDir, '_archived', 'dup.md'), 'utf-8')
      expect(archived).toContain('Version 2')
      // Version 1 is gone — silent data loss. Not necessarily a bug the test should fail on,
      // but worth noting.
    })

    it('archive then try to readFile → should throw', () => {
      manager.writeFile({ filename: 'gone.md', category: 'c', description: 'd', content: 'C' })
      manager.archiveFile('gone.md')
      expect(() => manager.readFile('gone.md')).toThrow('file not found')
    })

    it('archive then check INDEX.md → entry should be gone', () => {
      manager.writeFile({ filename: 'bye.md', category: 'c', description: 'd', content: 'C' })
      manager.archiveFile('bye.md')
      const index = manager.readIndex()
      expect(index.some(e => e.filename === 'bye.md')).toBe(false)
    })

    it('archive non-existent file → should throw', () => {
      expect(() => manager.archiveFile('nope.md')).toThrow('file not found')
    })
  })

  // ==========================================================================
  // WRITEINDEXFILE / READINDEX ROUND-TRIP
  // ==========================================================================
  describe('writeIndexFile → readIndex round-trip', () => {
    // FIX: Pipes are now escaped/unescaped in writeIndexFile/readIndex.
    it('round-trip preserves descriptions with special markdown chars', () => {
      manager.writeFile({ filename: 'a.md', category: 'test', description: 'desc with | pipe', content: 'A' })
      manager.writeFile({ filename: 'b.md', category: 'test', description: 'desc with `code`', content: 'B' })

      const index = manager.readIndex()
      expect(index.find(e => e.filename === 'a.md')?.description).toBe('desc with | pipe')
      expect(index.find(e => e.filename === 'b.md')?.description).toBe('desc with `code`')
    })
  })

  // ==========================================================================
  // PARSEFRONTMATTER EDGE CASES
  // ==========================================================================
  describe('parseFrontmatter edge cases', () => {
    it('frontmatter with non-word-char keys (e.g. hyphenated) are ignored', () => {
      // The regex /^(\w+):\s*(.+)$/ — \w+ means [a-zA-Z0-9_]
      // So "last-updated: 2026-01-01" won't match because of the hyphen
      fs.writeFileSync(path.join(memDir, 'hyphen.md'), '---\nlast-updated: 2026-01-01\ncategory: test\n---\n\nBody')
      const entry = manager.readFile('hyphen.md')
      // category should work, but last-updated is silently dropped
      expect(entry.category).toBe('test')
    })

    it('frontmatter with empty value → key captured but value is empty string?', () => {
      // "category:" with nothing after → regex (.+) requires at least 1 char → no match
      fs.writeFileSync(path.join(memDir, 'emptyval.md'), '---\ncategory:\nupdated: 2026-01-01\n---\n\nBody')
      const entry = manager.readFile('emptyval.md')
      // category line doesn't match regex, falls through to default
      expect(entry.category).toBe('uncategorized')
      expect(entry.updated).toBe('2026-01-01')
    })

    // FIX: CRLF is now normalized to LF before parsing.
    it('frontmatter with Windows-style CRLF line endings', () => {
      fs.writeFileSync(path.join(memDir, 'crlf.md'), '---\r\ncategory: test\r\nupdated: 2026-01-01\r\n---\r\n\r\nBody')
      const entry = manager.readFile('crlf.md')
      expect(entry.category).toBe('test')
    })
  })
})

// ==========================================================================
// LOCK MANAGER ADVERSARIAL TESTS
// ==========================================================================
describe('Adversarial: Lock Manager', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alfred-advlock-test-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('two locks acquired simultaneously → only one should succeed within timeout', async () => {
    const lock1 = createMemoryLock(tmpDir)
    const lock2 = createMemoryLock(tmpDir)

    await lock1.acquire()

    // lock2 should timeout since lock1 is held
    await expect(lock2.acquire(500)).rejects.toThrow('timeout')

    lock1.release()
  })

  it('release without acquire → should not crash', () => {
    const lock = createMemoryLock(tmpDir)
    expect(() => lock.release()).not.toThrow()
  })

  it('double release → should not crash', async () => {
    const lock = createMemoryLock(tmpDir)
    await lock.acquire()
    lock.release()
    expect(() => lock.release()).not.toThrow()
  })

  // BUG FOUND: If a lock file exists from a dead process, acquire() retries
  // until timeout. There's no stale lock detection (checking if PID is alive).
  // The lock file contains the PID, but it's never checked.
  // This means a crashed process leaves a lock that blocks everyone until manual cleanup.
  it('stale lock from dead process → acquire should detect and steal', async () => {
    const lockPath = path.join(tmpDir, '.lock')
    // Write a lock file with a PID that definitely doesn't exist
    fs.writeFileSync(lockPath, '999999999', { flag: 'wx' })

    const lock = createMemoryLock(tmpDir)
    // Should detect that PID 999999999 is dead and steal the lock
    // Currently: will timeout because there's no stale detection
    await lock.acquire(1000)
    lock.release()
  })

  it('acquire, simulate crash (don\'t release), acquire again → times out', async () => {
    const lock1 = createMemoryLock(tmpDir)
    await lock1.acquire()
    // "crash" — don't release

    const lock2 = createMemoryLock(tmpDir)
    // lock2 should timeout because lock1 is still held
    await expect(lock2.acquire(500)).rejects.toThrow('timeout')

    // Manual cleanup needed
    lock1.release()
  })

  it('lock file manually created as directory → acquire should handle', async () => {
    const lockPath = path.join(tmpDir, '.lock')
    fs.mkdirSync(lockPath)

    const lock = createMemoryLock(tmpDir)
    // writeFileSync with 'wx' flag will fail because .lock is a directory
    // acquire() catches all errors and retries, so it will timeout
    await expect(lock.acquire(500)).rejects.toThrow('timeout')

    // cleanup
    fs.rmdirSync(lockPath)
  })

  it('rapid acquire/release cycles → no race conditions', async () => {
    const lock = createMemoryLock(tmpDir)
    for (let i = 0; i < 50; i++) {
      await lock.acquire()
      lock.release()
    }
    // If we get here without hanging, the test passes
    expect(true).toBe(true)
  })

  it('concurrent acquire attempts with release → second one eventually succeeds', async () => {
    const lock1 = createMemoryLock(tmpDir)
    const lock2 = createMemoryLock(tmpDir)

    await lock1.acquire()

    // Release after 300ms
    const releaseTimer = setTimeout(() => lock1.release(), 300)

    // lock2 should eventually acquire
    await lock2.acquire(2000)
    lock2.release()
    clearTimeout(releaseTimer)
  })
})

// ==========================================================================
// READALLFILES EDGE CASES
// ==========================================================================
describe('Adversarial: readAllFiles', () => {
  let workspaceDir: string
  let memDir: string
  let manager: ReturnType<typeof createMemoryManager>

  beforeEach(() => {
    workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alfred-adv-all-'))
    memDir = path.join(workspaceDir, '_memory')
    manager = createMemoryManager(workspaceDir)
    manager.ensureDir()
  })

  afterEach(() => {
    fs.rmSync(workspaceDir, { recursive: true, force: true })
  })

  it('memDir does not exist → returns empty array', () => {
    fs.rmSync(memDir, { recursive: true, force: true })
    expect(manager.readAllFiles()).toEqual([])
  })

  it('memDir has only INDEX.md → returns empty array', () => {
    // ensureDir already creates INDEX.md, and no other files
    expect(manager.readAllFiles()).toEqual([])
  })

  it('non-.md files in memDir → ignored', () => {
    fs.writeFileSync(path.join(memDir, 'notes.txt'), 'not markdown')
    fs.writeFileSync(path.join(memDir, 'data.json'), '{}')
    expect(manager.readAllFiles()).toEqual([])
  })

  // BUG FOUND: readAllFiles lists files with readdirSync and filters by .endsWith('.md').
  // A corrupted .md file (e.g., binary data) will cause parseFrontmatter to process
  // garbage, but shouldn't crash since the regex simply won't match and returns
  // {meta: {}, body: raw}. Let's verify.
  it('corrupted .md file in memDir → readAllFiles does not crash', () => {
    fs.writeFileSync(path.join(memDir, 'corrupt.md'), Buffer.from([0x00, 0xff, 0xfe, 0x80]))
    expect(() => manager.readAllFiles()).not.toThrow()
    const all = manager.readAllFiles()
    expect(all).toHaveLength(1)
    expect(all[0].filename).toBe('corrupt.md')
  })
})

// ==========================================================================
// WRITEFILE EDGE CASES
// ==========================================================================
describe('Adversarial: writeFile', () => {
  let workspaceDir: string
  let memDir: string
  let manager: ReturnType<typeof createMemoryManager>

  beforeEach(() => {
    workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alfred-adv-write-'))
    memDir = path.join(workspaceDir, '_memory')
    manager = createMemoryManager(workspaceDir)
    manager.ensureDir()
  })

  afterEach(() => {
    fs.rmSync(workspaceDir, { recursive: true, force: true })
  })

  it('writeFile with empty filename → should either work or throw meaningfully', () => {
    // An empty filename means path.join(memDir, '') === memDir — writing to a directory
    expect(() =>
      manager.writeFile({
        filename: '',
        category: 'test',
        description: 'empty name',
        content: 'body',
      })
    ).toThrow() // EISDIR — trying to write to a directory path
  })

  // FIX: INDEX.md is now a reserved filename — writeFile throws.
  it('writeFile with filename "INDEX.md" → throws reserved filename error', () => {
    manager.writeFile({ filename: 'a.md', category: 'c', description: 'd', content: 'A' })
    expect(manager.readIndex()).toHaveLength(1) // a.md is indexed

    expect(() =>
      manager.writeFile({
        filename: 'INDEX.md',
        category: 'meta',
        description: 'oops',
        content: 'I just overwrote the index',
      })
    ).toThrow('reserved filename')

    // a.md entry should still be intact
    const index = manager.readIndex()
    expect(index.some(e => e.filename === 'a.md')).toBe(true)
  })

  // FIX: Filenames with slashes are now rejected by validateFilename.
  it('writeFile with slash in filename → throws invalid filename', () => {
    expect(() =>
      manager.writeFile({
        filename: 'sub/file.md',
        category: 'test',
        description: 'subdir',
        content: 'body',
      })
    ).toThrow('invalid filename')
  })
})
