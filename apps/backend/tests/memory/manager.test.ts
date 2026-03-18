import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createMemoryManager } from '../../src/memory/manager.js'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

describe('MemoryManager', () => {
  let workspaceDir: string
  let manager: ReturnType<typeof createMemoryManager>

  beforeEach(() => {
    workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alfred-mem-test-'))
    manager = createMemoryManager(workspaceDir)
  })

  afterEach(() => {
    fs.rmSync(workspaceDir, { recursive: true, force: true })
  })

  describe('init', () => {
    it('creates _memory dir and empty INDEX.md', () => {
      manager.ensureDir()
      const memDir = path.join(workspaceDir, '_memory')
      expect(fs.existsSync(memDir)).toBe(true)
      expect(fs.existsSync(path.join(memDir, 'INDEX.md'))).toBe(true)
    })
  })

  describe('readIndex', () => {
    it('returns empty array when INDEX.md has no entries', () => {
      manager.ensureDir()
      expect(manager.readIndex()).toEqual([])
    })

    it('parses INDEX.md table rows', () => {
      manager.ensureDir()
      const content = `# Alfred Memory Index

| fichier | catégorie | mis à jour | description |
|---------|-----------|------------|-------------|
| test.md | business | 2026-03-16 | A test entry |
`
      fs.writeFileSync(path.join(workspaceDir, '_memory', 'INDEX.md'), content)
      const entries = manager.readIndex()
      expect(entries).toHaveLength(1)
      expect(entries[0]).toEqual({
        filename: 'test.md',
        category: 'business',
        updated: '2026-03-16',
        description: 'A test entry',
      })
    })
  })

  describe('readFile', () => {
    it('reads file with frontmatter', () => {
      manager.ensureDir()
      const content = `---
created: 2026-03-16
updated: 2026-03-16
category: business
description: Test desc
---

Loaddr is active.

- [2026-03-16] Confirmed active
`
      fs.writeFileSync(path.join(workspaceDir, '_memory', 'test.md'), content)
      const entry = manager.readFile('test.md')
      expect(entry.category).toBe('business')
      expect(entry.created).toBe('2026-03-16')
      expect(entry.content).toContain('Loaddr is active')
    })

    it('throws for non-existent file', () => {
      manager.ensureDir()
      expect(() => manager.readFile('nope.md')).toThrow()
    })
  })

  describe('writeFile', () => {
    it('creates file with frontmatter and updates INDEX.md', () => {
      manager.ensureDir()
      manager.writeFile({
        filename: 'business-loaddr.md',
        category: 'business',
        description: 'Statut Loaddr',
        content: 'Loaddr is active.',
      })
      const file = manager.readFile('business-loaddr.md')
      expect(file.category).toBe('business')
      expect(file.content).toContain('Loaddr is active')

      const index = manager.readIndex()
      expect(index).toHaveLength(1)
      expect(index[0].filename).toBe('business-loaddr.md')
    })

    it('updates existing file and INDEX.md', () => {
      manager.ensureDir()
      manager.writeFile({
        filename: 'test.md',
        category: 'business',
        description: 'V1',
        content: 'First version',
      })
      manager.writeFile({
        filename: 'test.md',
        category: 'business',
        description: 'V2',
        content: 'Second version',
      })
      const index = manager.readIndex()
      expect(index).toHaveLength(1)
      expect(index[0].description).toBe('V2')
    })
  })

  describe('archiveFile', () => {
    it('moves file to _archived and removes from INDEX.md', () => {
      manager.ensureDir()
      manager.writeFile({
        filename: 'old.md',
        category: 'business',
        description: 'Old stuff',
        content: 'Outdated',
      })
      manager.archiveFile('old.md')

      expect(manager.readIndex()).toHaveLength(0)
      expect(fs.existsSync(path.join(workspaceDir, '_memory', '_archived', 'old.md'))).toBe(true)
      expect(fs.existsSync(path.join(workspaceDir, '_memory', 'old.md'))).toBe(false)
    })
  })

  describe('readAllFiles', () => {
    it('reads all memory files (excluding INDEX.md and _archived)', () => {
      manager.ensureDir()
      manager.writeFile({ filename: 'a.md', category: 'c1', description: 'd1', content: 'A' })
      manager.writeFile({ filename: 'b.md', category: 'c2', description: 'd2', content: 'B' })
      const all = manager.readAllFiles()
      expect(all).toHaveLength(2)
    })
  })

  describe('reconstructIndex', () => {
    it('rebuilds INDEX.md from file frontmatters', () => {
      manager.ensureDir()
      const memDir = path.join(workspaceDir, '_memory')
      fs.writeFileSync(path.join(memDir, 'a.md'), `---
created: 2026-03-16
updated: 2026-03-16
category: cat1
description: Desc A
---

Content A
`)
      // Corrupt INDEX.md
      fs.writeFileSync(path.join(memDir, 'INDEX.md'), 'corrupted')

      manager.reconstructIndex()
      const index = manager.readIndex()
      expect(index).toHaveLength(1)
      expect(index[0].filename).toBe('a.md')
      expect(index[0].description).toBe('Desc A')
    })
  })
})
