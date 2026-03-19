// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import fs from 'node:fs'
import path from 'node:path'
import type { MemoryEntry, MemoryIndexEntry } from '@opentidy/shared'

interface WriteFileInput {
  filename: string
  category: string
  description: string
  content: string
}

export function createMemoryManager(workspaceDir: string) {
  const memDir = path.join(workspaceDir, '_memory')
  const indexPath = path.join(memDir, 'INDEX.md')
  const archiveDir = path.join(memDir, '_archived')

  function validateFilename(filename: string): void {
    if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
      throw new Error(`[memory] invalid filename: ${filename}`)
    }
    if (filename === 'INDEX.md' || filename === '.lock') {
      throw new Error(`[memory] reserved filename: ${filename}`)
    }
  }

  function escapeTableCell(value: string): string {
    return value.replace(/\|/g, '\\|').replace(/\n/g, ' ')
  }

  function unescapeTableCell(value: string): string {
    return value.replace(/\\\|/g, '|')
  }

  function ensureDir(): void {
    fs.mkdirSync(memDir, { recursive: true })
    fs.mkdirSync(archiveDir, { recursive: true })
    if (!fs.existsSync(indexPath)) {
      writeIndexFile([])
    }
  }

  function splitTableRow(line: string): string[] | null {
    if (!line.startsWith('|') || !line.endsWith('|')) return null
    // Split on unescaped pipes: split on | not preceded by \
    const cells: string[] = []
    let current = ''
    for (let i = 1; i < line.length; i++) {
      if (line[i] === '|' && line[i - 1] !== '\\') {
        cells.push(current.trim())
        current = ''
      } else {
        current += line[i]
      }
    }
    return cells
  }

  function readIndex(): MemoryIndexEntry[] {
    if (!fs.existsSync(indexPath)) return []
    const raw = fs.readFileSync(indexPath, 'utf-8')
    const lines = raw.split('\n')
    const entries: MemoryIndexEntry[] = []
    for (const line of lines) {
      const cells = splitTableRow(line)
      if (!cells || cells.length < 4) continue
      if (cells[0].includes('---') || cells[0] === 'fichier') continue
      entries.push({
        filename: unescapeTableCell(cells[0]),
        category: unescapeTableCell(cells[1]),
        updated: cells[2],
        description: unescapeTableCell(cells[3]),
      })
    }
    return entries
  }

  function writeIndexFile(entries: MemoryIndexEntry[]): void {
    const header = `# OpenTidy Memory Index

| fichier | catégorie | mis à jour | description |
|---------|-----------|------------|-------------|
`
    const rows = entries
      .map(e => `| ${escapeTableCell(e.filename)} | ${escapeTableCell(e.category)} | ${e.updated} | ${escapeTableCell(e.description)} |`)
      .join('\n')
    fs.writeFileSync(indexPath, header + rows + '\n')
  }

  function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string } {
    const normalized = raw.replace(/\r\n/g, '\n')
    const match = normalized.match(/^---\n([\s\S]*?)\n?---\n?([\s\S]*)$/)
    if (!match) return { meta: {}, body: raw }
    const meta: Record<string, string> = {}
    for (const line of match[1].split('\n')) {
      const kv = line.match(/^(\w+):\s*(.+)$/)
      if (kv) meta[kv[1]] = kv[2]
    }
    return { meta, body: match[2].trim() }
  }

  function readFile(filename: string): MemoryEntry {
    validateFilename(filename)
    const filePath = path.join(memDir, filename)
    if (!fs.existsSync(filePath)) {
      throw new Error(`[memory] file not found: ${filename}`)
    }
    const raw = fs.readFileSync(filePath, 'utf-8')
    const { meta, body } = parseFrontmatter(raw)
    return {
      filename,
      category: meta.category ?? 'uncategorized',
      created: meta.created ?? 'unknown',
      updated: meta.updated ?? 'unknown',
      description: meta.description ?? '',
      content: body,
    }
  }

  function writeFile(input: WriteFileInput): void {
    validateFilename(input.filename)
    const today = new Date().toISOString().split('T')[0]
    const filePath = path.join(memDir, input.filename)
    const isNew = !fs.existsSync(filePath)
    const created = isNew ? today : parseFrontmatter(fs.readFileSync(filePath, 'utf-8')).meta.created ?? today

    const safeCategory = input.category.replace(/\n/g, ' ')
    const safeDescription = input.description.replace(/\n/g, ' ')

    const fileContent = `---
created: ${created}
updated: ${today}
category: ${safeCategory}
description: ${safeDescription}
---

${input.content}
`
    fs.writeFileSync(filePath, fileContent)

    const entries = readIndex().filter(e => e.filename !== input.filename)
    entries.push({
      filename: input.filename,
      category: safeCategory,
      updated: today,
      description: safeDescription,
    })
    writeIndexFile(entries)
  }

  function archiveFile(filename: string): void {
    validateFilename(filename)
    const src = path.join(memDir, filename)
    const dest = path.join(archiveDir, filename)
    if (!fs.existsSync(src)) {
      throw new Error(`[memory] file not found: ${filename}`)
    }
    fs.renameSync(src, dest)
    const entries = readIndex().filter(e => e.filename !== filename)
    writeIndexFile(entries)
  }

  function readAllFiles(): MemoryEntry[] {
    if (!fs.existsSync(memDir)) return []
    const files = fs.readdirSync(memDir).filter(f => f.endsWith('.md') && f !== 'INDEX.md')
    return files.map(f => readFile(f))
  }

  function readIndexRaw(): string {
    if (!fs.existsSync(indexPath)) return ''
    return fs.readFileSync(indexPath, 'utf-8')
  }

  function reconstructIndex(): void {
    if (!fs.existsSync(memDir)) return
    const files = fs.readdirSync(memDir).filter(f => f.endsWith('.md') && f !== 'INDEX.md')
    const entries: MemoryIndexEntry[] = []
    for (const f of files) {
      const raw = fs.readFileSync(path.join(memDir, f), 'utf-8')
      const { meta } = parseFrontmatter(raw)
      entries.push({
        filename: f,
        category: meta.category ?? 'uncategorized',
        updated: meta.updated ?? 'unknown',
        description: meta.description ?? f,
      })
    }
    writeIndexFile(entries)
  }

  return {
    ensureDir,
    readIndex,
    readFile,
    writeFile,
    archiveFile,
    readAllFiles,
    readIndexRaw,
    reconstructIndex,
  }
}