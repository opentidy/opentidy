// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect, beforeEach } from 'vitest'
import { createMemoryManager } from './manager.js'
import fs from 'node:fs'
import path from 'node:path'
import { useTmpDir } from '../../shared/test-helpers/tmpdir.js'

describe('MemoryManager', () => {
  const tmp = useTmpDir('opentidy-mem-test-')
  let manager: ReturnType<typeof createMemoryManager>

  beforeEach(() => {
    manager = createMemoryManager(tmp.path)
  })

  describe('init', () => {
    it('creates _memory dir and empty INDEX.md', () => {
      manager.ensureDir()
      const memDir = path.join(tmp.path, '_memory')
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
      const content = `# OpenTidy Memory Index

| file | category | updated | description |
|---------|-----------|------------|-------------|
| test.md | business | 2026-03-16 | A test entry |
`
      fs.writeFileSync(path.join(tmp.path, '_memory', 'INDEX.md'), content)
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

Acme Corp is active.

- [2026-03-16] Confirmed active
`
      fs.writeFileSync(path.join(tmp.path, '_memory', 'test.md'), content)
      const entry = manager.readFile('test.md')
      expect(entry.category).toBe('business')
      expect(entry.created).toBe('2026-03-16')
      expect(entry.content).toContain('Acme Corp is active')
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
        filename: 'business-acme.md',
        category: 'business',
        description: 'Statut Acme',
        content: 'Acme Corp is active.',
      })
      const file = manager.readFile('business-acme.md')
      expect(file.category).toBe('business')
      expect(file.content).toContain('Acme Corp is active')

      const index = manager.readIndex()
      expect(index).toHaveLength(1)
      expect(index[0].filename).toBe('business-acme.md')
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
      expect(fs.existsSync(path.join(tmp.path, '_memory', '_archived', 'old.md'))).toBe(true)
      expect(fs.existsSync(path.join(tmp.path, '_memory', 'old.md'))).toBe(false)
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
      const memDir = path.join(tmp.path, '_memory')
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